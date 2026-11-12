"""KERNEL verify-before-pay: open the real retailer page in a cloud browser and
read what is actually there, independently of the (untrusted) listing text.

Flow: create browser -> publish live-view URL immediately (UI embeds it while
the check runs) -> record a replay -> read title/prices/stock via Playwright ->
stop replay (mp4 kept by KERNEL) -> delete browser a little later.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable

from app.config import get_settings

log = logging.getLogger(__name__)

_JS = r"""
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(2500);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(1200);
const title = await page.title();
const text = (await page.evaluate(() => document.body ? document.body.innerText : '')).slice(0, 20000);
const prices = Array.from(text.matchAll(/\$\s?(\d{1,4}(?:[.,]\d{2})?)/g)).map(m => parseFloat(m[1].replace(',', '.'))).slice(0, 40);
const oos = /out of stock|sold out|unavailable/i.test(text);
return { title, prices, out_of_stock: oos, final_url: page.url() };
"""

OnLive = Callable[[dict[str, Any]], Awaitable[None]]


def _kernel():
    from kernel import Kernel  # lazy: app runs without the SDK configured

    return Kernel(api_key=get_settings().kernel_api_key)


async def _delete_later(k, session_id: str, delay: float) -> None:
    await asyncio.sleep(delay)
    try:
        await asyncio.to_thread(k.browsers.delete_by_id, session_id)
    except Exception:
        pass


_bg: set[asyncio.Task] = set()


async def _session(url: str, on_live: OnLive | None) -> dict[str, Any]:
    k = _kernel()
    browser = await asyncio.to_thread(k.browsers.create, stealth=True, timeout_seconds=240)
    sid = browser.session_id
    live = getattr(browser, "browser_live_view_url", None)
    replay_id = None
    try:
        try:
            rep = await asyncio.to_thread(k.browsers.replays.start, sid)
            replay_id = rep.replay_id
        except Exception as e:
            log.info("replay start failed: %s", e)
        if on_live and live:
            await on_live({"live_view_url": live, "status": "browsing", "session_id": sid})
        await asyncio.sleep(1.5)  # let the embedded viewer attach before navigation
        res = await asyncio.to_thread(k.browsers.playwright.execute, sid, code=_JS.replace("URL", repr(url)))
        result = getattr(res, "result", None) or {}
        replay_url = None
        if replay_id:
            try:
                await asyncio.to_thread(k.browsers.replays.stop, replay_id, id_or_name=sid)
                for _ in range(5):
                    reps = await asyncio.to_thread(k.browsers.replays.list, sid)
                    hit = next((r for r in reps if r.replay_id == replay_id and r.replay_view_url), None)
                    if hit:
                        replay_url = hit.replay_view_url
                        break
                    await asyncio.sleep(1.5)
            except Exception as e:
                log.info("replay stop/list failed: %s", e)
        return {"ok": True, "live_view_url": live, "replay_view_url": replay_url, "session_id": sid, **result}
    finally:
        t = asyncio.create_task(_delete_later(k, sid, 45))  # keep live view valid briefly for the UI
        _bg.add(t)
        t.add_done_callback(_bg.discard)


async def verify(url: str | None, expected_price: float | None, on_live: OnLive | None = None) -> dict[str, Any]:
    """Returns {status: verified|mismatch|inconclusive|skipped, ...}."""
    if not get_settings().kernel_api_key or not url:
        return {"status": "skipped", "reason": "KERNEL not configured or no URL"}
    try:
        data = await asyncio.wait_for(_session(url, on_live), timeout=90)
    except Exception as e:
        log.warning("kernel verify failed: %s", e)
        return {"status": "inconclusive", "reason": f"browser error: {e}"[:300]}
    prices = data.get("prices") or []
    if data.get("out_of_stock"):
        return {**data, "status": "mismatch", "reason": "page says out of stock"}
    if expected_price is None or not prices:
        return {**data, "status": "inconclusive", "reason": "no price found on page"}
    close = any(abs(p - expected_price) <= max(1.0, expected_price * 0.03) for p in prices)
    return {
        **data,
        "status": "verified" if close else "mismatch",
        "reason": "listed price found on retailer page" if close else f"price ${expected_price} not seen on page",
    }

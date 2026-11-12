"""Standing mandates (human-not-present): periodically wake the agent for each
active standing mandate that still has purchases left. The gateway enforces the
trigger (e.g. 'only when price <= $X'); the PayPal authorization caps total spend."""
from __future__ import annotations

import asyncio
import logging
import time

from app.config import get_settings
from app.core.events import emit
from app.store import store

log = logging.getLogger(__name__)


async def tick() -> list[str]:
    from app.agent import shopper

    started = []
    interval = get_settings().standing_interval_min * 60
    for m in store.list("mandates"):
        pol = m["policy"]
        if m.get("user") == "attack-lab" or m["status"] != "active" or pol.get("type") != "standing":
            continue
        if m.get("purchases", 0) >= pol["max_purchases"]:
            continue
        runs = store.list("runs", ref=m["id"], limit=5)
        if any(r.get("status") in ("queued", "running") for r in runs):
            continue
        if runs and time.time() - runs[0]["ts"] < interval:
            continue
        run = store.put("runs", {"mandate_id": m["id"], "protected": True, "status": "queued", "trigger": "watcher"}, ref=m["id"])
        await emit(run["id"], "status", {"status": "queued", "reason": f"standing mandate check ({pol.get('trigger') or 'scheduled'})"}, m["id"])
        shopper.start_background(run["id"])
        started.append(run["id"])
    return started


async def loop() -> None:
    while True:
        try:
            await tick()
        except Exception as e:
            log.warning("watcher tick failed: %s", e)
        await asyncio.sleep(60)

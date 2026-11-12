"""Channel3 product search. The mandate is compiled into Channel3 filters, so
out-of-mandate products are never even shown to the agent."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)
_FIXTURE = Path(__file__).resolve().parent.parent / "data" / "catalog.json"


def _norm(p: dict[str, Any]) -> dict[str, Any]:
    offers = p.get("offers") or []
    offer = offers[0] if offers else {}
    price = (offer.get("price") or {}).get("price")
    images = p.get("images") or []
    main = next((i for i in images if i.get("is_main_image")), images[0] if images else {})
    return {
        "id": p.get("id"),
        "title": p.get("title"),
        "brand": ((p.get("brands") or [{}])[0] or {}).get("name"),
        "description": (p.get("description") or "")[:1500],
        "price": float(price) if price is not None else None,
        "currency": (offer.get("price") or {}).get("currency", "USD"),
        "merchant": offer.get("domain"),
        "url": offer.get("url"),
        "availability": offer.get("availability"),
        "image": main.get("url"),
        "rating": (p.get("ratings") or {}).get("value"),
        "source": "channel3",
    }


def _fixture() -> list[dict[str, Any]]:
    return json.loads(_FIXTURE.read_text(encoding="utf-8"))


async def search(query: str, max_price: float | None, allow: list[str], deny: list[str], limit: int = 8) -> list[dict]:
    s = get_settings()
    if not s.channel3_api_key:
        return _fixture_search(query, max_price, allow, deny, limit)
    filters: dict[str, Any] = {"availability": ["InStock"], "conditions": ["new"]}
    if max_price:
        filters["price"] = {"max_price": max_price}
    if allow:
        filters["website_ids"] = allow
    if deny:
        filters["exclude_website_ids"] = deny
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{s.channel3_base_url}/v1/search",
                headers={"x-api-key": s.channel3_api_key},
                json={"query": query, "filters": filters, "limit": limit},
            )
            r.raise_for_status()
        return [_norm(p) for p in r.json().get("products", []) if p.get("offers")]
    except Exception as e:  # keep demo alive if the API hiccups
        log.warning("channel3 search failed (%s); using fixture", e)
        return _fixture_search(query, max_price, allow, deny, limit)


async def product(product_id: str) -> dict | None:
    s = get_settings()
    if product_id.startswith("fx_") or not s.channel3_api_key:
        return next((p for p in _fixture() if p["id"] == product_id), None)
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(f"{s.channel3_base_url}/v1/products/{product_id}", headers={"x-api-key": s.channel3_api_key})
            r.raise_for_status()
        return _norm(r.json())
    except Exception as e:
        log.warning("channel3 product failed: %s", e)
        return None


def _fixture_search(query: str, max_price: float | None, allow: list[str], deny: list[str], limit: int) -> list[dict]:
    words = {w for w in query.lower().split() if len(w) > 2}
    out = []
    for p in _fixture():
        hay = f"{p['title']} {p['description']} {' '.join(p.get('tags', []))}".lower()
        score = sum(w in hay for w in words)
        if score == 0:
            continue
        if max_price and p["price"] > max_price:
            continue
        if allow and p["merchant"] not in allow:
            continue
        if p["merchant"] in deny:
            continue
        out.append((score, p))
    out.sort(key=lambda x: -x[0])
    return [p for _, p in out[:limit]]

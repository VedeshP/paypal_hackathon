"""Elastic: append-only audit trail + semantic 'threat memory' over past decisions."""
from __future__ import annotations

import logging
from typing import Any

from app.config import get_settings

log = logging.getLogger(__name__)
_client = None
_ready = False


def _es():
    global _client
    s = get_settings()
    if not (s.elastic_url and s.elastic_api_key):
        return None
    if _client is None:
        from elasticsearch import AsyncElasticsearch

        _client = AsyncElasticsearch(s.elastic_url, api_key=s.elastic_api_key, request_timeout=20)
    return _client


async def ensure_index() -> bool:
    global _ready
    idx = get_settings().elastic_index
    try:
        es = _es()
        if es is None:
            return False
        if not await es.indices.exists(index=idx):
            await es.indices.create(
                index=idx,
                mappings={
                    "properties": {
                        "ts": {"type": "date", "format": "epoch_second"},
                        "kind": {"type": "keyword"},
                        "decision": {"type": "keyword"},
                        "mandate_id": {"type": "keyword"},
                        "run_id": {"type": "keyword"},
                        "merchant": {"type": "keyword"},
                        "amount": {"type": "float"},
                        "protected": {"type": "boolean"},
                        "reason_text": {"type": "semantic_text"},
                    }
                },
            )
        _ready = True
    except Exception as e:
        log.warning("elastic ensure_index failed: %s", e)
        _ready = False
    return _ready


async def log_event(doc: dict[str, Any]) -> None:
    es = _es()
    if es is None or not _ready:
        return
    try:
        await es.index(index=get_settings().elastic_index, document=doc)
    except Exception as e:
        log.warning("elastic index failed: %s", e)


async def similar_blocks(text: str, k: int = 3) -> list[dict[str, Any]]:
    """Semantic search over previously BLOCKED actions (threat memory)."""
    es = _es()
    if es is None or not _ready or not text:
        return []
    try:
        r = await es.search(
            index=get_settings().elastic_index,
            size=k,
            query={
                "bool": {
                    "must": [{"semantic": {"field": "reason_text", "query": text[:2000]}}],
                    "filter": [{"term": {"decision": "BLOCK"}}],
                }
            },
            source_excludes=["reason_text"],
        )
        return [{"score": h["_score"], **h["_source"]} for h in r["hits"]["hits"]]
    except Exception as e:
        log.warning("elastic search failed: %s", e)
        return []


def status() -> str:
    return "connected" if _ready else ("configured" if _es() else "not configured")

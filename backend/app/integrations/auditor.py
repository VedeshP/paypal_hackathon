"""Elastic Agent Builder 'Mandate Auditor': an Elastic-hosted agent with ES|QL
tools over the mandate-events index. Answers questions like 'which merchants
were blocked most this week and why?'."""
from __future__ import annotations

import logging

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)
AGENT_ID = "mandate-auditor"


def _kb() -> tuple[str, dict]:
    s = get_settings()
    return s.elastic_url.replace(".es.", ".kb.").rstrip("/"), {
        "Authorization": f"ApiKey {s.elastic_api_key}", "kbn-xsrf": "true", "Content-Type": "application/json"}


TOOLS = [
    {
        "id": "mandate_decisions_by_merchant",
        "type": "esql",
        "description": "Counts gateway decisions (ALLOW/BLOCK/ESCALATE) and blocked dollar value per merchant.",
        "tags": ["mandate"],
        "configuration": {
            "query": "FROM mandate-events | WHERE kind == \"decision\" | STATS decisions = COUNT(*), value = SUM(amount) BY decision, merchant | SORT decisions DESC | LIMIT ?limit",
            "params": {"limit": {"type": "integer", "description": "max rows"}},
        },
    },
    {
        "id": "mandate_recent_blocks",
        "type": "esql",
        "description": "Most recent BLOCK decisions with the reasons the gateway gave.",
        "tags": ["mandate"],
        "configuration": {
            "query": "FROM mandate-events | WHERE decision == \"BLOCK\" | SORT ts DESC | KEEP ts, merchant, amount, protected, reason_text, run_id | LIMIT ?limit",
            "params": {"limit": {"type": "integer", "description": "max rows"}},
        },
    },
]


async def setup() -> dict:
    s = get_settings()
    if not (s.elastic_url and s.elastic_api_key):
        return {"status": "not configured"}
    kb, h = _kb()
    out = {}
    async with httpx.AsyncClient(timeout=30) as c:
        for t in TOOLS:
            r = await c.post(f"{kb}/api/agent_builder/tools", headers=h, json=t)
            out[t["id"]] = r.status_code
        agent = {
            "id": AGENT_ID,
            "name": "Mandate Auditor",
            "description": "Audits AI-agent payments checked by the Mandate Gateway.",
            "labels": ["mandate"],
            "configuration": {
                "instructions": (
                    "You audit an AI payments gateway. The index mandate-events holds decisions (ALLOW/BLOCK/ESCALATE), "
                    "merchant, amount, protected (gateway on), and reason_text. Use the tools, cite numbers, keep answers short."
                ),
                "tools": [{"tool_ids": [t["id"] for t in TOOLS] + ["platform.core.search"]}],
            },
        }
        r = await c.post(f"{kb}/api/agent_builder/agents", headers=h, json=agent)
        out[AGENT_ID] = r.status_code
    return {"status": "ok", "results": out}


async def ask(question: str, conversation_id: str | None = None) -> dict:
    kb, h = _kb()
    body = {"input": question, "agent_id": AGENT_ID}
    if conversation_id:
        body["conversation_id"] = conversation_id
    async with httpx.AsyncClient(timeout=280) as c:
        r = await c.post(f"{kb}/api/agent_builder/converse", headers=h, json=body)
        if r.status_code == 404 or (r.status_code >= 400 and "agent" in r.text.lower()):
            await setup()
            r = await c.post(f"{kb}/api/agent_builder/converse", headers=h, json=body)
    if r.status_code >= 400:
        return {"error": r.text[:500]}
    j = r.json()
    steps = [{"type": s.get("type"), "tool": s.get("tool_id")} for s in j.get("steps", []) if isinstance(s, dict)]
    return {"answer": (j.get("response") or {}).get("message", ""), "conversation_id": j.get("conversation_id"), "steps": steps}

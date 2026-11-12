"""Backend LLM proxy for AG Studio's Agent Framework.

AG Studio's built-in agents (Lead / Planning / Data / Page / Widget) run in the
browser and call an `AgLlmAdapter`. Our adapter posts each turn here; we map
AG Studio's conversation items to OpenAI-style chat messages, call Gemini (with
Groq fallback) and return text + tool calls. Keys never reach the browser.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.core import llm

router = APIRouter(prefix="/api/studio")
DROP_TOOLS = {"add_page_filter"}
_extras: dict[str, Any] = {}  # callId -> provider extras (Gemini thought signatures)


class Turn(BaseModel):
    input: list[dict[str, Any]] = []
    instructions: str | None = None
    tools: list[dict[str, Any]] | None = None
    toolChoice: Any = None
    responseFormat: dict[str, Any] | None = None


def _text(content: list[dict]) -> str:
    return "\n".join(c.get("text") or c.get("refusal") or "" for c in content or [] if isinstance(c, dict))


def _messages(t: Turn) -> list[dict]:
    msgs: list[dict] = []
    system = t.instructions or ""
    if t.responseFormat and t.responseFormat.get("type") == "json":
        system += "\n\nRespond ONLY with JSON matching this schema:\n" + json.dumps(t.responseFormat.get("schema"))[:20000]
    if system:
        msgs.append({"role": "system", "content": system})
    for it in t.input:
        typ = it.get("type")
        if typ == "message":
            role = it.get("role", "user")
            msgs.append({"role": "assistant" if role == "assistant" else role, "content": _text(it.get("content"))})
        elif typ == "function_call":
            call = {"id": it["callId"], "type": "function", "function": {"name": it["name"], "arguments": it.get("arguments") or "{}"}}
            if it["callId"] in _extras:
                call["extra_content"] = _extras[it["callId"]]
            if msgs and msgs[-1]["role"] == "assistant" and "tool_calls" in msgs[-1]:
                msgs[-1]["tool_calls"].append(call)
            else:
                msgs.append({"role": "assistant", "content": "", "tool_calls": [call]})
        elif typ == "function_call_output":
            msgs.append({"role": "tool", "tool_call_id": it["callId"], "content": str(it.get("output", ""))[:20000]})
    return msgs


@router.get("/data")
async def data(request: Request):
    """Flat tables for AG Studio data sources."""
    from datetime import datetime

    from app.auth import require_user
    from app.store import store

    u = require_user(request)
    mine = {m["id"] for m in store.list("mandates", ref=u["id"], limit=5000)}
    lab = {m["id"] for m in store.list("mandates", ref="attack-lab", limit=20000)}

    def day(ts: float) -> str:
        return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")

    decisions = []
    for e in store.list("events", limit=5000):
        if e["kind"] != "decision" or e.get("mandate_id") not in (mine | lab):
            continue
        failed = [c["name"] for c in e.get("checks", []) if not c.get("ok")]
        decisions.append({
            "time": day(e["ts"]), "decision": e.get("decision"), "protected": bool(e.get("protected")),
            "source": "attack-lab" if e.get("run_id") and (store.get("runs", e["run_id"]) or {}).get("scenario") else "live",
            "product": (e.get("product") or {}).get("title"), "merchant": e.get("merchant") or "unknown",
            "amount": float(e.get("amount") or 0), "failed_check": failed[0] if failed else "none",
            "quantity": int((e.get("proposal") or {}).get("quantity") or 1), "mandate_id": e.get("mandate_id"),
        })
    mandates = [{
        "mandate_id": m["id"], "goal": m["policy"]["goal"], "type": m["policy"]["type"], "status": m["status"],
        "budget": float(m["policy"]["budget"]["max_total"]), "spent": float(m.get("spent", 0)),
        "remaining": float(m["policy"]["budget"]["max_total"] - m.get("spent", 0)), "purchases": m.get("purchases", 0),
        "created": m["created_at"][:16],
    } for m in store.list("mandates", ref=u["id"])]
    purchases = [{
        "time": day(p["ts"]), "product": p["product"]["title"], "merchant": p["product"].get("merchant"),
        "amount": float(p["amount"]), "status": (p.get("payment") or {}).get("status"), "simulated": bool(p.get("simulated")),
        "mandate_id": p["mandate_id"],
    } for p in store.list("purchases") if p.get("mandate_id") in mine]
    return {"decisions": decisions, "mandates": mandates, "purchases": purchases}


@router.post("/turn")
async def turn(t: Turn):
    try:  # keep the last request for debugging schema issues
        import pathlib
        pathlib.Path("data/last_studio_turn.json").write_text(t.model_dump_json(), encoding="utf-8")
    except Exception:
        pass
    tools = None
    if t.tools and t.toolChoice != "none":
        # add_page_filter's schema alone is ~20k chars: it blows free-tier token limits and makes small models emit
        # malformed calls, so the Control Tower agent builds widgets/pages and leaves filtering to the UI.
        tools = [{"type": "function", "function": {"name": x["name"], "description": (x.get("description") or "")[:600],
                                                     "parameters": x.get("parameters") or {"type": "object", "properties": {}}}}
                 for x in t.tools if x.get("kind") != "provided" and x["name"] not in DROP_TOOLS]
    try:
        msg = await llm.chat("studio", _messages(t), tools=tools or None)
    except Exception as e:
        return {"error": str(e)[:500], "text": "", "tool_calls": []}
    calls = []
    for c in msg.tool_calls or []:
        cid = c.id or f"call_{uuid.uuid4().hex[:10]}"
        raw = c.model_dump()
        if raw.get("extra_content"):
            _extras[cid] = raw["extra_content"]
        calls.append({"id": cid, "name": c.function.name, "arguments": c.function.arguments or "{}"})
    return {"text": msg.content or "", "tool_calls": calls}

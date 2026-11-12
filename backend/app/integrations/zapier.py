"""Human-in-the-loop notifications through Zapier MCP.

When the gateway ESCALATEs, a small notifier agent connects to Zapier's MCP
server (Streamable HTTP, bearer token) and uses whatever email/Slack action is
enabled there to tell the user, with an approve link back to Mandate.
"""
from __future__ import annotations

import json
import logging

from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport

from app.config import get_settings
from app.core import llm

log = logging.getLogger(__name__)

SYSTEM = """You are a notification agent with Zapier tools. Send exactly ONE email to the recipient using
an available Zapier email action (Gmail 'send email' or similar). If you must discover/enable an action first,
do that. Use the subject and body given verbatim. Stop once it is sent."""


def _tools(mcp_tools) -> list[dict]:
    return [{"type": "function", "function": {"name": t.name, "description": (t.description or "")[:900],
                                              "parameters": t.inputSchema}} for t in mcp_tools]


async def notify_escalation(approval: dict) -> dict:
    s = get_settings()
    if not (s.zapier_mcp_token and s.notify_email):
        return {"status": "skipped", "reason": "ZAPIER_MCP_TOKEN / NOTIFY_EMAIL not set"}
    p = approval.get("product") or {}
    link = f"{s.public_base_url}/approvals"
    subject = f"Mandate: your agent wants to spend ${approval['proposal'].get('amount')} - approval needed"
    body = (
        f"Your shopping agent proposed: {p.get('title')} from {p.get('merchant')} for ${approval['proposal'].get('amount')}.\n"
        f"Why it needs you: {'; '.join(approval.get('reasons', []))}\n\nApprove or reject: {link}"
    )
    transport = StreamableHttpTransport(s.zapier_mcp_url, headers={"Authorization": f"Bearer {s.zapier_mcp_token}"})
    log_steps = []
    try:
        async with Client(transport) as client:
            tools = _tools(await client.list_tools())
            messages = [{"role": "system", "content": SYSTEM},
                        {"role": "user", "content": f"Recipient: {s.notify_email}\nSubject: {subject}\nBody:\n{body}"}]
            for _ in range(6):
                msg = await llm.chat("planner", messages, tools=tools)
                entry = msg.model_dump(exclude_none=True)
                entry["content"] = msg.content or ""
                entry.pop("refusal", None)
                messages.append(entry)
                if not msg.tool_calls:
                    break
                for c in msg.tool_calls:
                    args = json.loads(c.function.arguments or "{}")
                    try:
                        res = await client.call_tool(c.function.name, args)
                        out = "\n".join(getattr(x, "text", "") for x in res.content)[:3000]
                    except Exception as e:
                        out = f"error: {e}"[:500]
                    log_steps.append({"tool": c.function.name, "result": out[:200]})
                    messages.append({"role": "tool", "tool_call_id": c.id, "content": out})
        return {"status": "sent" if log_steps else "no_action", "steps": log_steps}
    except Exception as e:
        log.warning("zapier notify failed: %s", e)
        return {"status": "error", "error": str(e)[:300], "steps": log_steps}

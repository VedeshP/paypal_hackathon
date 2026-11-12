from __future__ import annotations

import time
from typing import Any

from app.integrations import elastic
from app.store import bus, store


async def emit(run_id: str | None, kind: str, data: dict[str, Any], mandate_id: str | None = None) -> dict:
    ev = {"ts": time.time(), "run_id": run_id, "mandate_id": mandate_id, "kind": kind, **data}
    store.put("events", ev, ref=run_id)
    if run_id:
        bus.publish(run_id, ev)
    bus.publish("*", ev)
    if kind in ("decision", "mandate", "payment", "approval"):
        await elastic.log_event(
            {
                "ts": int(ev["ts"]),
                "kind": kind,
                "decision": data.get("decision"),
                "mandate_id": mandate_id,
                "run_id": run_id,
                "merchant": data.get("merchant"),
                "amount": data.get("amount"),
                "protected": data.get("protected"),
                "reason_text": " | ".join(data.get("reasons", [])) + " " + str(data.get("evidence", ""))[:1500],
            }
        )
    return ev

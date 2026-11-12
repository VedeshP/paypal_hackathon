from __future__ import annotations

import asyncio
import json
import time
from collections import Counter

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.agent import attacklab, scenarios, shopper
from app.auth import require_user
from app.config import get_settings
from app.core import gateway, llm
from app.core import mandate as M
from app.core.events import emit
from app.integrations import elastic
from app.integrations.paypal import PayPalError, paypal
from app.store import bus, store

router = APIRouter(prefix="/api")
_bg: set[asyncio.Task] = set()


def _mine(request: Request) -> tuple[dict, set[str]]:
    """Signed-in user and the ids of the mandates they own."""
    u = require_user(request)
    return u, {m["id"] for m in store.list("mandates", ref=u["id"], limit=5000)}


def _own_mandate(request: Request, mid: str) -> dict:
    u = require_user(request)
    m = store.get("mandates", mid)
    if not m or m.get("user") != u["id"]:
        raise HTTPException(404, "mandate not found")
    return m


def _spawn(coro):
    t = asyncio.create_task(coro)
    _bg.add(t)
    t.add_done_callback(_bg.discard)


# ------------------------------------------------------------------ health
@router.get("/health")
async def health():
    s = get_settings()
    return {
        "ok": True,
        "integrations": {
            "paypal": "sandbox" if s.paypal_enabled else "not configured",
            "planner": llm.model_label("planner"),
            "extractor": llm.model_label("extractor"),
            "judge": llm.model_label("judge"),
            "channel3": "live" if s.channel3_api_key else "fixture catalog",
            "elastic": elastic.status(),
            "kernel": "configured" if s.kernel_api_key else "not configured",
        },
    }


# ------------------------------------------------------------------ mandates
class CompileIn(BaseModel):
    text: str


class CreateIn(BaseModel):
    policy: M.MandatePolicy
    ship_to: dict | None = None  # defaults to the signed-in user's PayPal profile address
    fund_with_paypal: bool = True


@router.post("/mandates/compile")
async def compile_mandate(body: CompileIn):
    try:
        return (await M.compile_mandate(body.text)).model_dump()
    except llm.LLMNotConfigured as e:
        raise HTTPException(400, str(e))


@router.post("/mandates")
async def create_mandate(body: CreateIn, request: Request):
    s = get_settings()
    u = require_user(request)
    m = M.new_mandate(body.policy, body.ship_to or u.get("ship_to") or {"name": "Alex Doe", "line": "742 Evergreen Terrace, Springfield, OR 97477"}, user=u["id"])
    approve_url = None
    if body.fund_with_paypal and s.paypal_enabled:
        pol = body.policy
        try:
            order = await paypal.create_order(
                intent="AUTHORIZE", amount=pol.budget.max_total, currency=pol.budget.currency,
                description=f"Mandate: {pol.goal}"[:120], custom_id=m["id"],
                return_url=f"{s.public_base_url}/api/paypal/return?kind=mandate&mandate_id={m['id']}",
                cancel_url=f"{s.public_base_url}/mandates?cancelled={m['id']}",
                payer_email=u.get("email"),
            )
            approve_url = paypal.approve_link(order)
            m["paypal"] = {"order_id": order["id"], "mode": "authorization", "approve_url": approve_url}
        except PayPalError as e:
            m["paypal"] = {"error": str(e.body)[:400]}
            m["status"] = "active"
    else:
        m["status"] = "active"
    m["signature"] = M.sign(m)
    store.put("mandates", m, ref=m["user"])
    await emit(None, "mandate", {"action": "created", "decision": "SIGNED", "amount": m["policy"]["budget"]["max_total"],
                                 "reasons": [m["policy"]["summary"]]}, m["id"])
    return {"mandate": m, "approve_url": approve_url}


@router.get("/mandates")
async def list_mandates(request: Request):
    u = require_user(request)
    return store.list("mandates", ref=u["id"])


@router.get("/mandates/{mid}")
async def get_mandate(mid: str, request: Request):
    m = _own_mandate(request, mid)
    return {"mandate": m, "verified": M.verify(m), "runs": store.list("runs", ref=mid), "purchases": store.list("purchases", ref=mid)}


@router.post("/mandates/{mid}/revoke")
async def revoke(mid: str, request: Request):
    m = _own_mandate(request, mid)
    out = {"refunds": [], "void": None}
    pp = m.get("paypal") or {}
    if get_settings().paypal_enabled:
        for p in store.list("purchases", ref=mid):
            cid = (p.get("payment") or {}).get("capture_id")
            if cid:
                try:
                    out["refunds"].append(await paypal.refund_capture(cid))
                except PayPalError as e:
                    out["refunds"].append({"error": str(e.body)[:300]})
        if pp.get("authorization_id"):
            try:
                out["void"] = await paypal.void_authorization(pp["authorization_id"]) or {"status": "VOIDED"}
            except PayPalError as e:
                out["void"] = {"error": str(e.body)[:300]}
    m["status"] = "revoked"
    store.put("mandates", m, ref=m["user"])
    await emit(None, "mandate", {"action": "revoked", "decision": "REVOKED", "reasons": ["user revoked mandate"]}, mid)
    return out


@router.get("/paypal/return")
async def paypal_return(request: Request, kind: str, token: str | None = None, mandate_id: str | None = None, run_id: str | None = None):
    """PayPal redirects the buyer here after approval (token = order id)."""
    if kind == "mandate" and mandate_id:
        m = gateway.get_mandate(mandate_id)
        try:
            order = await paypal.get_order(token or m["paypal"]["order_id"])
            payer = (order.get("payer") or {})
            payer_id = payer.get("payer_id")
            owner = store.get("users", m["user"]) or {}
            if owner.get("payer_id") and payer_id and owner["payer_id"] != payer_id:
                m["paypal"]["error"] = (f"approved by a different PayPal account ({(payer.get('email_address') or payer_id)}); "
                                        "sign in with the PayPal account that owns this mandate")
                m["status"] = "payer_mismatch"
                store.put("mandates", m, ref=m["user"])
                await emit(None, "mandate", {"action": "payer_mismatch", "decision": "BLOCK", "reasons": [m["paypal"]["error"]]}, mandate_id)
                return RedirectResponse(f"/mandates/{mandate_id}")
            if owner and not owner.get("payer_id") and payer_id:  # demo user: first approval links their PayPal account
                owner.update(payer_id=payer_id, email=payer.get("email_address"), paypal_linked_at=time.time(),
                             name=owner.get("name") if owner.get("provider") == "paypal" else
                             " ".join(x for x in ((payer.get("name") or {}).get("given_name"), (payer.get("name") or {}).get("surname")) if x) or owner.get("name"))
                store.put("users", owner, ref=owner.get("provider"))
            res = await paypal.authorize_order(token or m["paypal"]["order_id"])
            auth = res["purchase_units"][0]["payments"]["authorizations"][0]
            m["paypal"].update(payer_id=payer_id, payer_email=payer.get("email_address"))
            m["paypal"].update(authorization_id=auth["id"], authorization_status=auth["status"],
                               authorization_expires=auth.get("expiration_time"))
            m["status"] = "active"
            await emit(None, "payment", {"status": "AUTHORIZED", "amount": float(auth["amount"]["value"]),
                                         "decision": "FUNDED", "reasons": ["buyer approved mandate budget hold in PayPal"]}, mandate_id)
        except (PayPalError, KeyError, IndexError) as e:
            m["paypal"]["error"] = str(getattr(e, "body", e))[:400]
        store.put("mandates", m, ref=m["user"])
        return RedirectResponse(f"/mandates/{mandate_id}")
    if kind == "purchase" and run_id and token:
        try:
            cap = await paypal.capture_order(token)
            await emit(run_id, "payment", {"status": cap.get("status"), "order_id": token, "decision": "ALLOW"})
        except PayPalError as e:
            await emit(run_id, "payment", {"status": "PAYPAL_ERROR", "error": str(e.body)[:300]})
        return RedirectResponse(f"/runs/{run_id}")
    return RedirectResponse("/")


# ------------------------------------------------------------------ runs
class RunIn(BaseModel):
    mandate_id: str
    protected: bool = True
    dry_run: bool = False


@router.post("/runs")
async def start_run(body: RunIn, request: Request):
    m = _own_mandate(request, body.mandate_id)
    if m["status"] != "active":
        raise HTTPException(400, f"mandate is {m['status']}; approve it in PayPal first")
    run = store.put("runs", {"mandate_id": m["id"], "protected": body.protected, "dry_run": body.dry_run, "status": "queued"}, ref=m["id"])
    shopper.start_background(run["id"])
    return run


@router.get("/runs")
async def list_runs(request: Request, kind: str = "all", limit: int = 300):
    """The user's agent runs (live + standing) and the shared Attack Lab runs, newest first."""
    _, mine = _mine(request)
    out = []
    for r in store.list("runs", limit=3000):
        if r.get("kind") == "lab":
            continue
        is_lab = bool(r.get("scenario"))
        if not is_lab and r.get("mandate_id") not in mine:
            continue
        if (kind == "live" and is_lab) or (kind == "lab" and not is_lab):
            continue
        m = store.get("mandates", r.get("mandate_id") or "") or {}
        props = r.get("proposals", [])
        out.append({
            "id": r["id"], "ts": r["ts"], "status": r.get("status"), "protected": r.get("protected"),
            "kind": "attack-lab" if is_lab else ("standing" if r.get("trigger") == "watcher" else "live"),
            "scenario": r.get("scenario"), "mandate_id": r.get("mandate_id"),
            "goal": (m.get("policy") or {}).get("goal"), "planner": r.get("planner_model") or "default",
            "decisions": [p["decision"] for p in props], "spent": round(sum(p["amount"] for p in props if p["decision"] == "ALLOW"), 2),
            "summary": (r.get("summary") or "")[:400],
            "duration": round(r["finished_at"] - r["started_at"], 1) if r.get("finished_at") and r.get("started_at") else None,
        })
        if len(out) >= limit:
            break
    return out


@router.get("/runs/{rid}")
async def get_run(rid: str):
    run = store.get("runs", rid)
    if not run:
        raise HTTPException(404)
    events = sorted(store.list("events", ref=rid, limit=1000), key=lambda e: e["ts"])
    return {"run": run, "events": events}


@router.get("/runs/{rid}/stream")
async def stream(rid: str, request: Request):
    q = bus.subscribe(rid)

    async def gen():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                    yield {"event": "message", "data": json.dumps(ev, default=str)}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            bus.unsubscribe(rid, q)

    return EventSourceResponse(gen())


# ------------------------------------------------------------------ approvals
class ApprovalIn(BaseModel):
    approve: bool


@router.get("/approvals")
async def approvals(request: Request):
    _, mine = _mine(request)
    return [a for a in store.list("approvals") if a.get("mandate_id") in mine]


@router.post("/approvals/{aid}")
async def decide(aid: str, body: ApprovalIn, request: Request):
    _, mine = _mine(request)
    a = store.get("approvals", aid)
    if not a or a["status"] != "pending" or a.get("mandate_id") not in mine:
        raise HTTPException(404, "no pending approval")
    a["status"] = "approved" if body.approve else "rejected"
    payment = None
    if body.approve:
        run = gateway.get_run(a["run_id"])
        m = gateway.get_mandate(a["mandate_id"])
        product = run["products"][a["proposal"]["product_id"]]
        payment = await gateway._execute(run, m, product, a["proposal"]["quantity"], a["proposal"]["amount"])
    a["payment"] = payment
    store.put("approvals", a, ref=a["mandate_id"])
    await emit(a["run_id"], "approval", {"decision": "APPROVED" if body.approve else "REJECTED", "reasons": ["human decision"],
                                         "amount": a["proposal"].get("amount")}, a["mandate_id"])
    return a


# ------------------------------------------------------------------ attack lab
class LabIn(BaseModel):
    scenarios: list[str] | None = None
    planner_model: str | None = None


@router.get("/lab/scenarios")
async def lab_scenarios():
    return [{k: v for k, v in s.items() if k != "attack_won"} for s in scenarios.SCENARIOS]


@router.post("/lab")
async def start_lab(body: LabIn):
    lab = store.put("runs", {"kind": "lab", "status": "running", "started_at": time.time(), "scenarios": body.scenarios, "planner_model": body.planner_model}, ref="lab")
    _spawn(attacklab.run_lab(lab["id"], body.scenarios, planner_model=body.planner_model))
    return lab


@router.get("/lab")
async def latest_labs():
    return store.list("runs", ref="lab", limit=10)


@router.get("/lab/{lid}")
async def get_lab(lid: str):
    lab = store.get("runs", lid)
    if not lab:
        raise HTTPException(404)
    return lab


# ------------------------------------------------------------------ dashboard
def _lab_mandates() -> set[str]:
    return {m["id"] for m in store.list("mandates", ref="attack-lab", limit=20000)}


@router.get("/events")
async def events(request: Request, limit: int = 200, include_lab: bool = False):
    _, mine = _mine(request)
    allowed = mine | (_lab_mandates() if include_lab else set())
    return [e for e in store.list("events", limit=limit * 6) if e.get("mandate_id") in allowed][:limit]


@router.get("/stats")
async def stats(request: Request):
    u, mine = _mine(request)
    scope = mine | _lab_mandates()  # dashboard counts include the shared Attack Lab
    decisions = [e for e in store.list("events", limit=8000) if e["kind"] == "decision" and e.get("mandate_id") in scope]
    by = Counter(e["decision"] for e in decisions if e.get("protected"))
    mandates = store.list("mandates", ref=u["id"])
    purchases = [p for p in store.list("purchases") if not p.get("simulated") and p.get("mandate_id") in mine]
    labs = [lab for lab in store.list("runs", ref="lab", limit=5) if lab.get("status") == "completed"]
    return {
        "mandates_active": sum(m["status"] == "active" for m in mandates),
        "mandates_total": len(mandates),
        "authorized_total": round(sum(m["policy"]["budget"]["max_total"] for m in mandates if m["status"] in ("active", "fulfilled")), 2),
        "spent_total": round(sum(p["amount"] for p in purchases), 2),
        "decisions": {"ALLOW": by.get("ALLOW", 0), "BLOCK": by.get("BLOCK", 0), "ESCALATE": by.get("ESCALATE", 0)},
        "blocked_value": round(sum(e.get("amount") or 0 for e in decisions if e.get("decision") == "BLOCK" and e.get("protected")), 2),
        "pending_approvals": sum(a["status"] == "pending" for a in store.list("approvals") if a.get("mandate_id") in mine)
        + sum(m["status"] == "pending_funding" for m in mandates),
        "latest_lab": labs[0]["summary"] if labs else None,
    }


# ------------------------------------------------------------------ elastic auditor
class AskIn(BaseModel):
    question: str
    conversation_id: str | None = None


@router.post("/auditor/setup")
async def auditor_setup():
    from app.integrations import auditor
    return await auditor.setup()


@router.post("/auditor/ask")
async def auditor_ask(body: AskIn):
    from app.integrations import auditor
    return await auditor.ask(body.question, body.conversation_id)


@router.post("/watcher/tick")
async def watcher_tick():
    """Run the standing-mandate watcher now (also used by the Render cron job)."""
    from app.core import watcher
    return {"started": await watcher.tick()}


@router.get("/public/summary")
async def public_summary():
    """Unauthenticated numbers for the landing page."""
    labs = [lab for lab in store.list("runs", ref="lab", limit=10) if lab.get("status") == "completed" and lab.get("summary")]
    decisions = [e for e in store.list("events", limit=8000) if e["kind"] == "decision" and e.get("protected")]
    captured = [p for p in store.list("purchases") if not p.get("simulated") and (p.get("payment") or {}).get("status") == "COMPLETED"]
    return {
        "lab": labs[0]["summary"] if labs else None,
        "checks": 14,
        "blocked": sum(e.get("decision") == "BLOCK" for e in decisions),
        "escalated": sum(e.get("decision") == "ESCALATE" for e in decisions),
        "allowed": sum(e.get("decision") == "ALLOW" for e in decisions),
        "captured_usd": round(sum(p["amount"] for p in captured), 2),
    }

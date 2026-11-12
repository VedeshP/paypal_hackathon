"""Users and sign-in.

Identity = a PayPal account, via Log in with PayPal (OpenID Connect, sandbox):
  /api/auth/login -> PayPal authorize page -> /api/auth/callback?code=...
  -> exchange code for a user access token -> userinfo (payer_id, name, email, address)
  -> upsert user -> signed session cookie.

The same payer_id is then enforced when a mandate's PayPal hold is approved
(see api.paypal_return), so "who is signed in" and "who pays" are one account.

A demo user (no PayPal login) is available for judges; its PayPal account is
linked the first time it approves a hold.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

from app.config import get_settings
from app.store import store

router = APIRouter(prefix="/api/auth")
COOKIE = "mandate_session"
DEFAULT_SHIP_TO = {"name": "Alex Doe", "line": "742 Evergreen Terrace, Springfield, OR 97477"}


# ---------------------------------------------------------------- sessions
def _sig(value: str) -> str:
    return hmac.new(get_settings().mandate_signing_secret.encode(), value.encode(), hashlib.sha256).hexdigest()[:32]


def _cookie_for(uid: str) -> str:
    return f"{uid}.{_sig(uid)}"


def current_user(request: Request) -> dict | None:
    raw = request.cookies.get(COOKIE, "")
    uid, _, sig = raw.rpartition(".")
    if not uid or not hmac.compare_digest(sig, _sig(uid)):
        return None
    return store.get("users", uid)


def require_user(request: Request) -> dict:
    u = current_user(request)
    if not u:
        raise HTTPException(401, "sign in required")
    return u


def user_by_token(token: str) -> dict | None:
    return next((u for u in store.list("users", limit=5000) if hmac.compare_digest(u.get("mcp_token", ""), token)), None)


def _login(user: dict, to: str = "/") -> RedirectResponse:
    resp = RedirectResponse(to, status_code=302)
    resp.set_cookie(COOKIE, _cookie_for(user["id"]), httponly=True, samesite="lax", max_age=7 * 86400)
    return resp


def upsert_user(uid: str, **fields) -> dict:
    u = store.get("users", uid) or {"id": uid, "created_at": time.time(), "mcp_token": f"mdt_tok_{secrets.token_urlsafe(24)}"}
    u.update({k: v for k, v in fields.items() if v is not None})
    return store.put("users", u, ref=u.get("provider"))


def public(u: dict) -> dict:
    return {k: u.get(k) for k in ("id", "name", "email", "provider", "payer_id", "ship_to", "mcp_token", "paypal_linked_at")}


# ---------------------------------------------------------------- PayPal OIDC
def _paypal_web() -> str:
    return "https://www.sandbox.paypal.com" if "sandbox" in get_settings().paypal_base_url else "https://www.paypal.com"


def _redirect_uri(request: Request | None = None) -> str:
    """Must match a Return URL registered under the app's Log in with PayPal settings.
    Built from the host the user is browsing (localhost / 127.0.0.1 / Render) unless AUTH_REDIRECT_URI is set."""
    s = get_settings()
    if s.auth_redirect_uri:
        return s.auth_redirect_uri
    if request is not None:
        return f"{str(request.base_url).rstrip('/')}/api/auth/callback"
    return f"{s.public_base_url}/api/auth/callback"


@router.get("/config")
async def config(request: Request):
    s = get_settings()
    return {
        "paypal_login": s.paypal_enabled,
        "paypal_login_mode": s.paypal_login_mode,
        "login_url": "/api/auth/login" if s.paypal_login_mode == "oidc" else "/api/auth/paypal",
        "redirect_uri": _redirect_uri(request),
        "demo_buyer_email": s.demo_buyer_email,
        "demo_buyer_password": s.demo_buyer_password,
    }


@router.get("/login")
async def login(request: Request):
    s = get_settings()
    state = secrets.token_urlsafe(16)
    q = urlencode({
        "flowEntry": "static", "client_id": s.paypal_client_id, "response_type": "code",
        "scope": "openid profile email address https://uri.paypal.com/services/paypalattributes",
        "redirect_uri": _redirect_uri(request), "state": state,
    })
    resp = RedirectResponse(f"{_paypal_web()}/signin/authorize?{q}", status_code=302)
    resp.set_cookie("mandate_oauth_state", state, httponly=True, samesite="lax", max_age=600)
    return resp


@router.get("/callback")
async def callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None,
                   error_description: str | None = None):
    if error or not code:
        return RedirectResponse(f"/login?error={error or 'no_code'}", status_code=302)
    if not state or state != request.cookies.get("mandate_oauth_state"):
        return RedirectResponse("/login?error=state_mismatch", status_code=302)
    s = get_settings()
    basic = base64.b64encode(f"{s.paypal_client_id}:{s.paypal_client_secret}".encode()).decode()
    async with httpx.AsyncClient(timeout=30) as c:
        tok = await c.post(f"{s.paypal_base_url}/v1/oauth2/token", headers={"Authorization": f"Basic {basic}"},
                           data={"grant_type": "authorization_code", "code": code, "redirect_uri": _redirect_uri(request)})
        if tok.status_code >= 400:
            return RedirectResponse("/login?error=token_exchange_failed", status_code=302)
        access = tok.json()["access_token"]
        info = await c.get(f"{s.paypal_base_url}/v1/identity/oauth2/userinfo?schema=paypalv1.1",
                           headers={"Authorization": f"Bearer {access}"})
    if info.status_code >= 400:
        return RedirectResponse("/login?error=userinfo_failed", status_code=302)
    j = info.json()
    payer_id = j.get("payer_id") or j.get("user_id", "").rsplit("/", 1)[-1]
    emails = j.get("emails") or []
    email = next((e.get("value") for e in emails if e.get("primary")), emails[0]["value"] if emails else j.get("email"))
    name = j.get("name") or " ".join(x for x in (j.get("given_name"), j.get("family_name")) if x) or email
    addr = j.get("address") or {}
    line = ", ".join(x for x in (addr.get("street_address"), addr.get("locality"), addr.get("region"), addr.get("postal_code")) if x)
    user = upsert_user(f"pp_{payer_id}", provider="paypal", payer_id=payer_id, name=name, email=email,
                       ship_to={"name": name, "line": line} if line else DEFAULT_SHIP_TO, paypal_linked_at=time.time())
    return _login(user)


# ---------------------------------------------------------------- PayPal verification sign-in
# Works with only Orders permissions (no Log in with PayPal / Vault features needed):
# the user approves a $1 AUTHORIZE order that is never authorized or captured; the approved
# order tells us exactly which PayPal account approved it (payer_id, name, email, address).
@router.get("/paypal")
async def paypal_signin(request: Request):
    from app.integrations.paypal import paypal

    base = str(request.base_url).rstrip("/")
    order = await paypal.create_order(
        intent="AUTHORIZE", amount=1.00, currency="USD", description="Mandate sign-in - verification only, never charged",
        custom_id="signin", return_url=f"{base}/api/auth/paypal/return", cancel_url=f"{base}/login?error=cancelled",
        shipping_preference="GET_FROM_FILE",
    )
    resp = RedirectResponse(paypal.approve_link(order), status_code=302)
    resp.set_cookie("mandate_signin_order", order["id"], httponly=True, samesite="lax", max_age=900)
    return resp


@router.get("/paypal/return")
async def paypal_signin_return(request: Request, token: str | None = None):
    from app.integrations.paypal import PayPalError, paypal

    if not token or token != request.cookies.get("mandate_signin_order"):
        return RedirectResponse("/login?error=signin_state_mismatch", status_code=302)
    try:
        order = await paypal.get_order(token)
    except PayPalError:
        return RedirectResponse("/login?error=order_lookup_failed", status_code=302)
    if order.get("status") != "APPROVED":
        return RedirectResponse(f"/login?error=order_{order.get('status', 'unknown').lower()}", status_code=302)
    payer = order.get("payer") or {}
    payer_id = payer.get("payer_id")
    name = " ".join(x for x in ((payer.get("name") or {}).get("given_name"), (payer.get("name") or {}).get("surname")) if x)
    ship = ((order.get("purchase_units") or [{}])[0].get("shipping") or {})
    a = ship.get("address") or {}
    line = ", ".join(x for x in (a.get("address_line_1"), a.get("admin_area_2"), a.get("admin_area_1"), a.get("postal_code")) if x)
    user = upsert_user(f"pp_{payer_id}", provider="paypal", payer_id=payer_id, name=name or payer.get("email_address"),
                       email=payer.get("email_address"), paypal_linked_at=time.time(),
                       ship_to={"name": (ship.get("name") or {}).get("full_name") or name, "line": line} if line else DEFAULT_SHIP_TO)
    resp = _login(user)
    resp.delete_cookie("mandate_signin_order")
    return resp  # the approved order is never authorized/captured, so no money is held


@router.post("/demo")
async def demo():
    user = upsert_user("demo_judge", provider="demo", name="Demo Judge", email=None, ship_to=DEFAULT_SHIP_TO)
    resp = JSONResponse(public(user))
    resp.set_cookie(COOKIE, _cookie_for(user["id"]), httponly=True, samesite="lax", max_age=7 * 86400)
    return resp


@router.get("/me")
async def me(request: Request):
    u = current_user(request)
    if not u:
        raise HTTPException(401, "not signed in")
    return public(u)


@router.post("/logout")
async def logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE)
    return resp

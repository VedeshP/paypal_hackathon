"""PayPal REST client (Orders v2 + Payments v2), sandbox.

Why REST here and MCP at the agent boundary: the gateway needs AUTHORIZE ->
partial capture -> void and idempotency keys, which PayPal's MCP tool surface
does not expose, and it authenticates server-to-server with client credentials.
"""
from __future__ import annotations

import base64
import time
import uuid
from typing import Any

import httpx

from app.config import get_settings


class PayPalError(RuntimeError):
    def __init__(self, status: int, body: Any):
        super().__init__(f"PayPal {status}: {body}")
        self.status, self.body = status, body


class PayPal:
    def __init__(self):
        self.s = get_settings()
        self._token: str | None = None
        self._exp = 0.0

    async def _auth(self) -> str:
        if self._token and time.time() < self._exp - 60:
            return self._token
        basic = base64.b64encode(f"{self.s.paypal_client_id}:{self.s.paypal_client_secret}".encode()).decode()
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{self.s.paypal_base_url}/v1/oauth2/token",
                headers={"Authorization": f"Basic {basic}"},
                data={"grant_type": "client_credentials"},
            )
        if r.status_code >= 400:
            raise PayPalError(r.status_code, r.text)
        j = r.json()
        self._token, self._exp = j["access_token"], time.time() + j.get("expires_in", 3000)
        return self._token

    async def _req(self, method: str, path: str, json: dict | None = None, idem: str | None = None) -> dict:
        headers = {
            "Authorization": f"Bearer {await self._auth()}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
            "PayPal-Request-Id": idem or uuid.uuid4().hex,
        }
        async with httpx.AsyncClient(timeout=45) as c:
            r = await c.request(method, f"{self.s.paypal_base_url}{path}", json=json, headers=headers)
        body = r.json() if r.content else {}
        if r.status_code >= 400:
            raise PayPalError(r.status_code, body)
        return body

    @staticmethod
    def approve_link(order: dict) -> str | None:
        for link in order.get("links", []):
            if link.get("rel") in ("payer-action", "approve"):
                return link["href"]
        return None

    async def create_order(
        self,
        *,
        intent: str,
        amount: float,
        currency: str,
        description: str,
        custom_id: str,
        return_url: str,
        cancel_url: str,
        items: list[dict] | None = None,
        payer_email: str | None = None,
        shipping_preference: str = "NO_SHIPPING",
    ) -> dict:
        unit: dict[str, Any] = {
            "reference_id": custom_id,
            "custom_id": custom_id,
            "description": description[:127],
            "amount": {"currency_code": currency, "value": f"{amount:.2f}"},
        }
        if items:
            unit["items"] = items
            unit["amount"]["breakdown"] = {"item_total": {"currency_code": currency, "value": f"{amount:.2f}"}}
        paypal_src: dict[str, Any] = {
            "experience_context": {
                "brand_name": "Mandate",
                "user_action": "CONTINUE" if intent == "AUTHORIZE" else "PAY_NOW",
                "shipping_preference": shipping_preference,
                "return_url": return_url,
                "cancel_url": cancel_url,
            }
        }
        if payer_email:
            paypal_src["email_address"] = payer_email  # pre-fills PayPal login with the signed-in user's account
        body = {
            "intent": intent,
            "purchase_units": [unit],
            "payment_source": {"paypal": paypal_src},
        }
        return await self._req("POST", "/v2/checkout/orders", body)

    async def get_order(self, order_id: str) -> dict:
        return await self._req("GET", f"/v2/checkout/orders/{order_id}")

    async def authorize_order(self, order_id: str) -> dict:
        return await self._req("POST", f"/v2/checkout/orders/{order_id}/authorize", {})

    async def capture_order(self, order_id: str) -> dict:
        return await self._req("POST", f"/v2/checkout/orders/{order_id}/capture", {})

    async def capture_authorization(
        self, auth_id: str, amount: float, currency: str, invoice_id: str, note: str, final: bool, idem: str
    ) -> dict:
        body = {
            "amount": {"currency_code": currency, "value": f"{amount:.2f}"},
            "invoice_id": invoice_id,
            "note_to_payer": note[:255],
            "final_capture": final,
        }
        return await self._req("POST", f"/v2/payments/authorizations/{auth_id}/capture", body, idem=idem)

    async def void_authorization(self, auth_id: str) -> dict:
        return await self._req("POST", f"/v2/payments/authorizations/{auth_id}/void", {})

    async def refund_capture(self, capture_id: str, note: str = "Mandate revoked") -> dict:
        return await self._req("POST", f"/v2/payments/captures/{capture_id}/refund", {"note_to_payer": note})


paypal = PayPal()

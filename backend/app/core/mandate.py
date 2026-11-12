"""Mandates: natural-language intent -> signed, machine-checkable spending policy.

Modelled on AP2's Intent/Cart mandates and Progent-style privilege policies.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, Field

from app.config import get_settings
from app.core import llm


class Budget(BaseModel):
    max_total: float = Field(description="Maximum total spend across all purchases, in currency units")
    max_per_item: float = Field(description="Maximum price for a single unit")
    currency: str = "USD"


class MandatePolicy(BaseModel):
    type: Literal["one_time", "standing"] = Field(
        description="one_time = single shopping task; standing = recurring/conditional purchases while user is away"
    )
    goal: str = Field(description="Short restatement of what the user wants bought")
    search_queries: list[str] = Field(description="1-3 product search queries an agent should use")
    budget: Budget
    quantity_max: int = Field(default=1, description="Max units per purchase")
    max_purchases: int = Field(default=1, description="How many separate purchases are allowed")
    merchants_allow: list[str] = Field(default_factory=list, description="Allowed retailer domains; empty = any reputable")
    merchants_deny: list[str] = Field(default_factory=list)
    must_have: list[str] = Field(default_factory=list, description="Hard product requirements")
    avoid: list[str] = Field(default_factory=list, description="Things the user does not want")
    expires_in_days: int = Field(default=7, ge=1, le=90)
    escalate_above: float | None = Field(
        default=None, description="Ask the human before any single purchase above this amount"
    )
    trigger: str | None = Field(default=None, description="For standing mandates: condition to buy, e.g. 'price below $20'")
    trigger_max_price: float | None = Field(
        default=None, description="For standing mandates with a price condition: buy only at or below this unit price"
    )
    summary: str = Field(description="One plain-English sentence describing exactly what the agent may do")


COMPILER_SYSTEM = """You compile a user's shopping wish into a strict spending mandate for an AI agent.
Principles (least privilege):
- Never invent a budget larger than the user said. If no budget is given, pick a conservative one and say so in summary.
- per-item cap <= total budget. quantity_max defaults to 1 unless the user asked for more.
- Only include merchants_allow if the user named stores; otherwise leave it empty.
- escalate_above: set to ~75% of max_per_item unless the user asked for full autonomy.
- Standing mandates are for recurring or conditional buys ("whenever", "every month", "if price drops").
- search_queries must be concrete product searches.
The user's ship-to address is NOT part of your output; it is locked separately from their profile."""


async def compile_mandate(text: str) -> MandatePolicy:
    return await llm.structured("compiler", COMPILER_SYSTEM, text, MandatePolicy)


def _canonical(doc: dict) -> bytes:
    return json.dumps(doc, sort_keys=True, separators=(",", ":"), default=str).encode()


def signable(mandate: dict) -> dict:
    keys = ("id", "policy", "ship_to", "created_at", "expires_at", "user")
    return {k: mandate.get(k) for k in keys}


def sign(mandate: dict) -> str:
    secret = get_settings().mandate_signing_secret.encode()
    return hmac.new(secret, _canonical(signable(mandate)), hashlib.sha256).hexdigest()


def verify(mandate: dict) -> bool:
    return hmac.compare_digest(mandate.get("signature", ""), sign(mandate))


def new_mandate(policy: MandatePolicy, ship_to: dict, user: str = "demo-user") -> dict:
    from uuid import uuid4

    now = datetime.now(timezone.utc)
    m = {
        "id": f"mdt_{uuid4().hex[:10]}",
        "user": user,
        "policy": policy.model_dump(),
        "ship_to": ship_to,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=policy.expires_in_days)).isoformat(),
        "status": "pending_funding",
        "spent": 0.0,
        "purchases": 0,
        "paypal": {},
    }
    m["signature"] = sign(m)
    return m

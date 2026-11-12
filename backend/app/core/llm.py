"""Provider-agnostic LLM layer.

Gemini and Groq both expose OpenAI-compatible endpoints, so one client type
covers both. Each *role* in the system is routed to a provider:

- planner   : privileged shopping agent (tool calling)      -> Gemini
- compiler  : natural language -> mandate policy JSON       -> Gemini
- extractor : quarantined reader of untrusted listings      -> Groq (fallback Gemini)
- judge     : intent-alignment second opinion in gateway    -> Groq (fallback Gemini)
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any, Literal

from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError

from app.config import get_settings

log = logging.getLogger(__name__)

Role = Literal["planner", "compiler", "extractor", "judge", "reranker", "studio"]

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/"
GROQ_BASE = "https://api.groq.com/openai/v1"

# Rate limits are per model on both providers, so each role gets its own model
# (its own quota bucket) and a shared cooldown map routes around 429s.
_cooldown: dict[str, float] = {}
_sems: dict[str, asyncio.Semaphore] = {}


class LLMNotConfigured(RuntimeError):
    pass


def _sem(provider: str) -> asyncio.Semaphore:
    if provider not in _sems:
        _sems[provider] = asyncio.Semaphore(4 if provider == "gemini" else 3)
    return _sems[provider]


def _candidates(role: Role) -> list[tuple[AsyncOpenAI, str, str]]:
    """Ordered provider/model chain for a role; later entries are fallbacks."""
    s = get_settings()
    gem: list = []
    groq: list = []
    if s.gemini_api_key:
        gc = AsyncOpenAI(api_key=s.gemini_api_key, base_url=GEMINI_BASE, max_retries=0, timeout=40)
        models = [s.gemini_model] + [m.strip() for m in s.gemini_fallbacks.split(",") if m.strip() and m.strip() != s.gemini_model]
        gem = [(gc, m, "gemini") for m in models]
    if s.groq_api_key:
        qc = AsyncOpenAI(api_key=s.groq_api_key, base_url=GROQ_BASE, max_retries=0, timeout=45)
        first = {"judge": s.groq_judge_model, "reranker": s.groq_rerank_model}.get(role, s.groq_model)
        order = [first] + [m for m in (s.groq_model, s.groq_judge_model, s.groq_rerank_model) if m != first]
        groq = [(qc, m, "groq") for m in dict.fromkeys(order)]
    chain = (groq + gem) if role in ("extractor", "judge", "reranker", "studio") else (gem + groq)
    if not chain:
        raise LLMNotConfigured("Set GEMINI_API_KEY and/or GROQ_API_KEY")
    return chain


def model_label(role: Role) -> str:
    try:
        _, model, provider = _candidates(role)[0]
        return f"{provider}:{model}"
    except LLMNotConfigured:
        return "unconfigured"


SKIP_SIG = {"google": {"thought_signature": "skip_thought_signature_validator"}}


def _for_provider(messages: list[dict[str, Any]], provider: str) -> list[dict[str, Any]]:
    """gemini         -> keep real thought signatures, add Google's documented bypass where missing
       gemini-other   -> signatures from another model are invalid: replace all with the bypass
       anything else  -> strip Gemini-only fields"""
    out = []
    for m in messages:
        m = {k: v for k, v in m.items() if k != "extra_content"} if provider != "gemini" else dict(m)
        if "tool_calls" in m:
            calls = []
            for tc in m["tool_calls"]:
                tc = {k: v for k, v in tc.items() if k != "extra_content"} if provider != "gemini" else dict(tc)
                if provider.startswith("gemini") and not tc.get("extra_content"):
                    tc["extra_content"] = SKIP_SIG
                calls.append(tc)
            m["tool_calls"] = calls
        out.append(m)
    return out


def _pinned(spec: str) -> list[tuple[AsyncOpenAI, str, str]]:
    """'groq:openai/gpt-oss-20b' or 'gemini:gemini-3.1-flash-lite' -> a single fixed candidate."""
    s = get_settings()
    provider, _, model = spec.partition(":")
    if provider == "groq" and s.groq_api_key:
        return [(AsyncOpenAI(api_key=s.groq_api_key, base_url=GROQ_BASE, max_retries=0, timeout=60), model, "groq")]
    if provider == "gemini" and s.gemini_api_key:
        return [(AsyncOpenAI(api_key=s.gemini_api_key, base_url=GEMINI_BASE, max_retries=0, timeout=60), model, "gemini")]
    raise LLMNotConfigured(f"cannot pin {spec}")


def _retry_after(e: Exception) -> float:
    """Seconds to wait from a 429 (header or 'try again in 780ms' text)."""
    resp = getattr(e, "response", None)
    try:
        if resp is not None and resp.headers.get("retry-after"):
            return float(resp.headers["retry-after"])
    except ValueError:
        pass
    m = re.search(r"try again in ([\d.]+)(ms|s)", str(e))
    if m:
        v = float(m.group(1))
        return v / 1000 if m.group(2) == "ms" else v
    return 4.0


async def _create(role: Role, model_override: str | None = None, **kwargs):
    chain = _pinned(model_override) if model_override else _candidates(role)
    last: Exception | None = None
    for attempt in range(7):
        now = time.monotonic()
        ready = [(i, c) for i, c in enumerate(chain) if _cooldown.get(f"{c[2]}:{c[1]}", 0) <= now]
        if not ready:  # everything is cooling down: wait for the soonest one instead of failing
            wait = min(_cooldown.get(f"{c[2]}:{c[1]}", 0) for c in chain) - now
            await asyncio.sleep(min(max(wait, 0.5), 20))
            continue
        for i, (client, model, provider) in ready:
            key = f"{provider}:{model}"
            try:
                # thought signatures are model-specific: only the primary model may receive them
                mode = provider if i == 0 else ("gemini-other" if provider == "gemini" else "other")
                msgs = _for_provider(kwargs["messages"], mode)
                async with _sem(provider):
                    return await client.chat.completions.create(**{**kwargs, "messages": msgs, "model": model})
            except Exception as e:
                status = getattr(e, "status_code", None)
                if status == 429 and ("per day" in str(e) or "PerDay" in str(e)):
                    _cooldown[key] = time.monotonic() + 3600  # daily quota gone: stop trying this model
                elif status == 429 or status == 503:
                    _cooldown[key] = time.monotonic() + min(_retry_after(e) + 0.5, 30)
                elif status in (400, 404):
                    _cooldown[key] = time.monotonic() + 300  # model/payload incompatible: skip it for a while
                log.warning("LLM %s failed for %s (%s): %s", key, role, status, str(e)[:160])
                last = e
    raise RuntimeError(f"all LLM candidates failed: {last}")


async def chat(role: Role, messages: list[dict[str, Any]], tools: list[dict] | None = None, temperature: float = 0.2,
               model_override: str | None = None):
    kwargs: dict[str, Any] = {"messages": messages, "temperature": temperature}
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"
    resp = await _create(role, model_override=model_override, **kwargs)
    return resp.choices[0].message


def _extract_json(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model output")
    return json.loads(text[start : end + 1])


async def structured[T: BaseModel](role: Role, system: str, user: str, schema: type[T], retries: int = 2) -> T:
    """Ask for JSON matching a pydantic schema; validate and retry with the error."""
    schema_json = json.dumps(schema.model_json_schema())
    messages = [
        {"role": "system", "content": f"{system}\n\nRespond ONLY with a JSON object matching this JSON Schema:\n{schema_json}"},
        {"role": "user", "content": user},
    ]
    last_err: Exception | None = None
    for _ in range(retries + 1):
        resp = await _create(role, messages=messages, temperature=0.1, response_format={"type": "json_object"})
        content = resp.choices[0].message.content or ""
        try:
            return schema.model_validate(_extract_json(content))
        except (ValueError, ValidationError) as e:
            last_err = e
            messages.append({"role": "assistant", "content": content})
            messages.append({"role": "user", "content": f"That JSON was invalid: {e}. Return corrected JSON only."})
    raise RuntimeError(f"structured output failed: {last_err}")

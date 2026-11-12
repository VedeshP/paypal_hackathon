# Mandate: spending guardrails for AI agents

**Tell your agent what it may spend in plain English. Mandate compiles that into a signed, enforceable spending policy, backs it with a PayPal authorization hold, and checks every purchase through a gateway that prompt injection can't talk its way past.**

Agents are getting wallets (AP2, ACP, PayPal agentic commerce). A shopping agent with a wallet that reads untrusted product pages has all three parts of the "lethal trifecta". Mandate is the seatbelt.

**Live demo:** https://mandate-gateway-4g7x.onrender.com (PayPal sandbox; sign in with PayPal or "Continue as demo judge"; sandbox buyer credentials are shown on the login page). MCP endpoint: `https://mandate-gateway-4g7x.onrender.com/mcp/`

## What it does
1. **Mandate Studio.** Natural language goes to an LLM compiler, which produces a least-privilege policy (budget, per-item cap, quantity, stores, expiry, ask-me-above threshold). The policy is HMAC-signed, like AP2 intent mandates.
2. **PayPal-backed budget.** Signing creates a PayPal **AUTHORIZE** order for the budget. The buyer approves once; agents can later **capture only what the gateway allows**, and revoking **voids the hold and refunds the captures**.
3. **Mandate Gateway (MCP server, FastMCP).** The only money interface an agent gets. Every `propose_purchase` passes these checks:
   - signature, expiry, purchase count
   - budget, per-item cap and quantity, with the price taken from catalog ground truth, never from the agent
   - merchant allow/deny lists
   - **provenance (CaMeL-lite):** the ship-to address must come from the signed mandate, and tainted values from listings are blocked
   - **listing integrity:** sellers that try to instruct AI agents are rejected
   - **threat memory:** semantic search over past blocks in Elastic
   - **verify-before-pay:** a KERNEL cloud browser opens the real retailer page
   - **intent-alignment judge:** a second LLM from a different provider
   - human escalation threshold

   The result is ALLOW, ESCALATE or BLOCK.
4. **Quarantined extraction.** The planner never sees raw listing text. A separate LLM with no tools turns listings into typed fields and red flags.
5. **Attack Lab.** AgentDojo-style evaluation runs 4 injection scenarios, each with and without the gateway, and reports **Attack Success Rate** and **Utility**.
6. **Control Tower.** Dashboard, live run trace (SSE), approvals inbox, AG Grid audit log, and a "connect any agent via MCP" page.

## Architecture
```
React (Vite) ──► FastAPI ──► Shopping agent (Gemini, tool calling) ──MCP──► Mandate Gateway (FastMCP)
                   │                                                   │
                   │                       ┌───────────┬──────────────┼────────────┬───────────┐
                   │                    Channel3     Groq judge +    PayPal REST   Elastic     KERNEL
                   │                    (catalog)    Q-LLM extractor  (auth/capture (audit +    (verify
                   └── /mcp/  ◄── external agents (Claude Desktop, Cursor, ChatGPT)    /refund)    memory)    before pay)
```
**Why REST to PayPal while agents use MCP:** agents talk MCP to *our* gateway (the standard agent boundary). The gateway talks REST to PayPal (the standard service boundary). It needs AUTHORIZE, partial capture, void and idempotency keys, which PayPal's MCP tool surface doesn't expose, and it authenticates server-to-server with client credentials.

## Sponsor tools used
| Tool | How |
|---|---|
| **PayPal** | Orders v2 (AUTHORIZE / CAPTURE), Payments v2 (authorization capture, void, refund), sandbox |
| **Render** | Docker web service hosting |
| **Channel3** | Product search; mandate limits compiled into Channel3 filters |
| **Elastic** | `mandate-events` index with `semantic_text` for the audit trail and threat-memory retrieval |
| **KERNEL** | Cloud browser verify-before-pay with an embedded live view |
| **AG Grid** | Audit log grid |
| **AI** | Google Gemini (planner, mandate compiler) + Groq (quarantined extractor, judge) via OpenAI-compatible APIs |

## Run locally (Docker)
```bash
cp .env.example .env   # fill in keys
docker compose up --build
# open http://localhost:8000
```
Dev mode: `cd backend && uvicorn app.main:app --reload` and `cd frontend && npm run dev` (port 5173, proxies /api).

## Research behind it
AP2 mandates (Google, 2025) · CaMeL "Defeating Prompt Injections by Design" (arXiv 2503.18813) · AgentDojo (arXiv 2406.13352) · Progent (arXiv 2504.11703) · Magentic Marketplace (arXiv 2510.25779) · "What Is Your AI Agent Buying?" (arXiv 2508.02630). See [RESEARCH.md](RESEARCH.md).

## License
MIT

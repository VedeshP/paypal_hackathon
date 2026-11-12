import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import router
from app.integrations import elastic
from app.mcp.server import mcp
from app.auth import router as auth_router
from app.studio import router as studio_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

mcp_app = mcp.http_app(path="/")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    from app.core import watcher

    from app.store import store

    for r in store.list("runs", limit=5000):  # tasks don't survive a restart: close orphaned runs
        if r.get("status") in ("queued", "running"):
            r["status"] = "interrupted"
            store.put("runs", r, ref=r.get("mandate_id") or ("lab" if r.get("kind") == "lab" else None))
    from app.auth import upsert_user
    from app.core import mandate as M

    upsert_user("demo_judge", provider="demo", name="Demo Judge")
    for m in store.list("mandates", limit=5000):  # migrations
        if m.get("user") == "demo-user":  # pre-sign-in mandates belong to the demo account
            m["user"] = "demo_judge"
            m["signature"] = M.sign(m)
            store.put("mandates", m, ref="demo_judge")
        pp = m.get("paypal") or {}
        if pp.get("order_id") and not pp.get("approve_url"):
            pp["approve_url"] = f"https://www.sandbox.paypal.com/checkoutnow?token={pp['order_id']}"
            m["paypal"] = pp
            store.put("mandates", m, ref=m.get("user"))
    await elastic.ensure_index()
    w = asyncio.create_task(watcher.loop())
    async with mcp_app.lifespan(app):
        yield
    w.cancel()


app = FastAPI(title="Mandate Gateway", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
app.include_router(studio_router)
app.include_router(auth_router)
app.mount("/mcp", mcp_app)

STATIC = Path(__file__).resolve().parent.parent / "static"
if STATIC.exists():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        f = STATIC / path
        return FileResponse(f if path and f.is_file() else STATIC / "index.html")

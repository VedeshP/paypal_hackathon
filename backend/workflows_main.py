"""Render Workflows service: distributed Attack Lab.

`attack_lab` fans out one `run_scenario` task per (scenario x gateway on/off);
Render runs each on its own instance in parallel. Each scenario runs against a
throwaway local store and returns its result plus the event trace, which the
web service ingests into its own database.

Start command on Render:  python workflows_main.py
"""
from __future__ import annotations

import asyncio
import os
import tempfile

os.environ.setdefault("DB_PATH", os.path.join(tempfile.mkdtemp(), "wf.db"))

from render import TaskContext, Workflows  # noqa: E402

app = Workflows()


@app.task(timeout_seconds=600)
async def run_scenario(ctx: TaskContext, scenario_id: str, protected: bool, planner_model: str | None = None) -> dict:
    from app.agent import attacklab, scenarios
    from app.store import store

    lab = store.put("runs", {"kind": "lab", "status": "running"}, ref="lab")
    res = await attacklab._one(lab["id"], scenarios.BY_ID[scenario_id], protected, asyncio.Semaphore(1), planner_model)
    run = store.get("runs", res["run_id"])
    mandate = store.get("mandates", run["mandate_id"])
    events = sorted(store.list("events", ref=res["run_id"], limit=1000), key=lambda e: e["ts"])
    return {"result": res, "run": run, "mandate": mandate, "events": events}


@app.task(timeout_seconds=1200)
async def attack_lab(ctx: TaskContext, scenario_ids: list[str], planner_model: str | None = None) -> list[dict]:
    jobs = [ctx.run(run_scenario, sid, prot, planner_model) for sid in scenario_ids for prot in (False, True)]
    return list(await asyncio.gather(*jobs))


if __name__ == "__main__":
    app.start()

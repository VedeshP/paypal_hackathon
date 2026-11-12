"""python -m scripts.lab_one <scenario> : run one Attack Lab scenario both ways."""
import asyncio, json, sys, time
from app.agent import attacklab, scenarios
from app.store import store

async def main(sid, model=None):
    sc = scenarios.BY_ID[sid]
    lab = store.put("runs", {"kind": "lab", "status": "running"}, ref="lab")
    sem = asyncio.Semaphore(2)
    t = time.time()
    res = await asyncio.gather(attacklab._one(lab["id"], sc, False, sem, model), attacklab._one(lab["id"], sc, True, sem, model))
    for r in res:
        print(("PROTECTED" if r["protected"] else "BASELINE "), "attack_success=", r["attack_success"], "utility=", r["utility"], r["status"])
        for p in r["proposals"]:
            print("   ", p["decision"], p["product_id"], "qty", p["quantity"], "$", p.get("amount"), "|", p["ship_to"][:40], "|", "; ".join(p["reasons"])[:200])
    print("secs", round(time.time() - t))

asyncio.run(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))

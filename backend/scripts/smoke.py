"""Quick integration smoke test: python -m scripts.smoke (from backend/)."""
import asyncio

from app.integrations import channel3
from app.integrations.paypal import paypal


async def main():
    o = await paypal.create_order(
        intent="AUTHORIZE", amount=80, currency="USD", description="Mandate test", custom_id="mdt_test",
        return_url="http://localhost:8000/api/paypal/return?kind=mandate&mandate_id=x", cancel_url="http://localhost:8000/",
    )
    print("PAYPAL ORDER", o["id"], o["status"], paypal.approve_link(o))
    ps = await channel3.search("fishing gift for dad", 80, [], [])
    print("CHANNEL3", len(ps), [(p["title"][:50], p["price"], p["merchant"], p["source"]) for p in ps[:4]])


asyncio.run(main())

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { api, ago, usd } from "../api";
import { Empty } from "../components/ui";

export default function Approvals() {
  const [list, setList] = useState<any[]>([]);
  const [holds, setHolds] = useState<any[]>([]);
  const load = () => { api("/approvals").then(setList); api("/mandates").then((ms) => setHolds(ms.filter((m: any) => m.status === "pending_funding"))); };
  useEffect(() => { load(); }, []);
  const decide = async (id: string, approve: boolean) => { await api(`/approvals/${id}`, { json: { approve } }); load(); };

  return (
    <div className="space-y-5">
    {holds.length > 0 && (
      <div className="card">
        <div className="h-title mb-1">Budget holds awaiting your PayPal approval</div>
        <div className="text-xs text-ink-muted mb-3">Signing a mandate creates a PayPal authorization. Approve it once; agents can then spend only within it.</div>
        {holds.map((m) => (
          <div key={m.id} className="flex items-center gap-4 py-3 border-t border-slate-100">
            <div className="flex-1 min-w-0">
              <Link to={`/mandates/${m.id}`} className="font-semibold truncate block">{m.policy.goal}</Link>
              <div className="text-xs text-ink-muted">{m.id} · {m.policy.type}</div>
            </div>
            <div className="text-lg font-extrabold">{usd(m.policy.budget.max_total)}</div>
            {m.paypal?.approve_url && <a href={m.paypal.approve_url} className="btn bg-[#FFC439] text-[#003087]">Approve in PayPal</a>}
          </div>
        ))}
      </div>
    )}
    <div className="card">
      <div className="h-title mb-1">Purchases escalated by the gateway</div>
      <div className="divide-y divide-slate-100">
        {list.map((a) => (
          <div key={a.id} className="flex items-center gap-4 py-4">
            {a.product?.image && <img src={a.product.image} className="h-14 w-14 rounded-xl object-cover" />}
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{a.product?.title}</div>
              <div className="text-xs text-ink-muted">{a.product?.merchant} · qty {a.proposal.quantity} · {ago(a.ts)} ·{" "}
                <Link className="text-brand" to={`/runs/${a.run_id}`}>run</Link></div>
              <div className="text-xs text-amber-700 mt-1">{a.reasons.join(" · ")}</div>
            </div>
            <div className="text-lg font-extrabold">{usd(a.proposal.amount)}</div>
            {a.status === "pending" ? (
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => decide(a.id, true)}><Check size={16} /> Approve</button>
                <button className="btn-ghost" onClick={() => decide(a.id, false)}><X size={16} /> Reject</button>
              </div>
            ) : <span className="pill bg-slate-100 text-slate-600">{a.status}</span>}
          </div>
        ))}
        {!list.length && <Empty>No escalated purchases.</Empty>}
      </div>
    </div>
    </div>
  );
}

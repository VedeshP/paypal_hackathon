import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Bot, Loader2, ShieldCheck, ShieldOff, Undo2, BadgeCheck, FileJson } from "lucide-react";
import { api, ago, usd } from "../api";
import { BudgetBar, Empty } from "../components/ui";

export default function MandateDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [showJson, setShowJson] = useState(false);
  const load = () => api(`/mandates/${id}`).then(setData);
  useEffect(() => { load(); }, [id]);
  if (!data) return null;
  const m = data.mandate;

  const run = async (prot: boolean) => {
    setBusy(prot ? "run" : "raw"); setErr("");
    try { const r = await api("/runs", { json: { mandate_id: id, protected: prot } }); nav(`/runs/${r.id}`); }
    catch (e: any) { setErr(e.message); setBusy(""); }
  };
  const revoke = async () => {
    if (!confirm("Revoke this mandate? Captured payments are refunded and the PayPal hold is voided.")) return;
    setBusy("revoke"); await api(`/mandates/${id}/revoke`, { method: "POST" }); await load(); setBusy("");
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="xl:col-span-2 space-y-5">
        <div className="card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="label">{m.id} · {m.policy.type === "standing" ? "Standing mandate" : "One-time mandate"}</div>
              <div className="text-xl font-extrabold mt-1">{m.policy.goal}</div>
              <p className="text-sm text-ink-muted mt-1">“{m.policy.summary}”</p>
            </div>
            <span className={`pill ${data.verified ? "bg-pine-soft text-pine" : "bg-rose-50 text-rose-700"}`}>
              <BadgeCheck size={12} /> {data.verified ? "signature valid" : "signature INVALID"}
            </span>
          </div>
          <div className="mt-5"><BudgetBar spent={m.spent} total={m.policy.budget.max_total} /></div>
          <div className="grid sm:grid-cols-4 gap-3 mt-5 text-sm">
            <Info k="Per item" v={usd(m.policy.budget.max_per_item)} />
            <Info k="Quantity" v={`≤ ${m.policy.quantity_max}`} />
            <Info k="Purchases" v={`${m.purchases}/${m.policy.max_purchases}`} />
            <Info k="Expires" v={new Date(m.expires_at).toLocaleDateString()} />
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-5 pt-4 border-t border-slate-100">
            <button className="btn-primary" disabled={m.status !== "active" || !!busy} onClick={() => run(true)}>
              {busy === "run" ? <Loader2 className="animate-spin" size={16} /> : <Bot size={16} />} Run agent (protected)
            </button>
            <button className="btn-danger" disabled={m.status === "revoked" || !!busy} onClick={revoke}>
              <Undo2 size={16} /> Revoke & refund
            </button>
            <button className="btn-ghost" onClick={() => setShowJson(!showJson)}><FileJson size={16} /> Signed JSON</button>
            {m.status === "pending_funding" && m.paypal?.approve_url && (
              <a href={m.paypal.approve_url} className="btn bg-[#FFC439] text-[#003087] hover:brightness-95">Approve {usd(m.policy.budget.max_total)} hold in PayPal</a>
            )}
            {m.status === "fulfilled" && <span className="pill bg-lime-soft text-pine">fulfilled · remaining hold released</span>}
          </div>
          {err && <div className="text-sm text-rose-600 mt-2">{err}</div>}
          {showJson && <pre className="mt-4 text-[11px] bg-ink text-lime rounded-xl p-4 overflow-auto max-h-80">{JSON.stringify(m, null, 2)}</pre>}
        </div>

        <div className="card">
          <div className="h-title mb-3">Agent runs</div>
          <div className="divide-y divide-slate-100">
            {data.runs.map((r: any) => (
              <Link key={r.id} to={`/runs/${r.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50 rounded-lg px-2">
                {r.protected ? <ShieldCheck size={16} className="text-pine" /> : <ShieldOff size={16} className="text-rose-500" />}
                <div className="flex-1 text-sm font-medium">{r.id}</div>
                <span className="pill bg-slate-100 text-slate-600">{r.status}</span>
                <span className="text-[11px] text-ink-muted w-16 text-right">{ago(r.ts)}</span>
              </Link>
            ))}
            {!data.runs.length && <Empty>No runs yet.</Empty>}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="card">
          <div className="h-title mb-3">PayPal</div>
          <div className="space-y-2 text-sm">
            <Row k="Mode" v={m.paypal?.mode ?? "approve each purchase"} />
            <Row k="Order" v={m.paypal?.order_id ?? "—"} />
            <Row k="Authorization" v={m.paypal?.authorization_id ?? "—"} />
            <Row k="Auth status" v={m.paypal?.authorization_status ?? m.status} />
            {m.paypal?.error && <div className="text-xs text-rose-600 break-all">{m.paypal.error}</div>}
          </div>
        </div>
        <div className="card">
          <div className="h-title mb-3">Purchases</div>
          {data.purchases.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 py-2">
              {p.product.image && <img src={p.product.image} className="h-10 w-10 rounded-lg object-cover" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.product.title}</div>
                <div className="text-[11px] text-ink-muted">{p.product.merchant} · {p.payment.status}</div>
              </div>
              <div className="text-sm font-bold">{usd(p.amount)}</div>
            </div>
          ))}
          {!data.purchases.length && <Empty>No purchases.</Empty>}
        </div>
      </div>
    </div>
  );
}

const Info = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-xl bg-canvas p-3"><div className="label">{k}</div><div className="font-bold mt-0.5">{v}</div></div>
);
const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-3"><span className="text-ink-muted">{k}</span><span className="font-medium truncate max-w-[60%]">{v}</span></div>
);

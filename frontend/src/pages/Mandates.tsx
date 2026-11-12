import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, PenLine, Loader2, Lock, CalendarClock, Store, Package, ShieldCheck } from "lucide-react";
import { api, usd } from "../api";
import { BudgetBar, Empty } from "../components/ui";

const EXAMPLES: { label: string; outcome: string; tone: string; text: string }[] = [
  { label: "16kg kettlebell", outcome: "auto-buy · KERNEL verified", tone: "bg-lime-soft text-pine",
    text: "Buy me one 16kg (35 lb) cast iron kettlebell for home workouts. Max $80. You don't need to ask me - just buy it if it fits." },
  { label: "Fishing gift for dad", outcome: "escalates to you", tone: "bg-amber-50 text-amber-700",
    text: "Buy a birthday gift for my dad, he loves fishing. Max $80, one item, arrives this week." },
  { label: "Coffee when cheap", outcome: "standing · buys only at ≤ $9", tone: "bg-rose-50 text-rose-700",
    text: "Keep me stocked on whole-bean medium roast coffee: buy a 12oz bag only when one costs $9 or less. Max $30 a month, at most 3 bags." },
  { label: "Shoes from 3 stores", outcome: "store allowlist", tone: "bg-brand-soft text-brand",
    text: "Find me neutral running shoes for daily training under $120. Only from nike.com, asics.com or brooksrunning.com. Ask me before paying more than $90." },
  { label: "Yoga mat, tiny budget", outcome: "hard $15 cap · search pre-filtered", tone: "bg-slate-100 text-slate-700",
    text: "Buy a non-slip yoga mat, at least 6mm thick. Hard limit $15 - don't go over it." },
];

export default function Mandates() {
  const nav = useNavigate();
  const [text, setText] = useState(EXAMPLES[0].text);
  const [draft, setDraft] = useState<any>(null);
  const [busy, setBusy] = useState<"" | "compile" | "sign">("");
  const [err, setErr] = useState("");
  const [list, setList] = useState<any[]>([]);

  useEffect(() => { api("/mandates").then(setList); }, []);

  const compile = async () => {
    setErr(""); setBusy("compile");
    try { setDraft(await api("/mandates/compile", { json: { text } })); } catch (e: any) { setErr(e.message); }
    setBusy("");
  };
  const sign = async () => {
    setBusy("sign"); setErr("");
    try {
      const r = await api("/mandates", { json: { policy: draft, fund_with_paypal: true } });
      if (r.approve_url) window.location.href = r.approve_url;
      else nav(`/mandates/${r.mandate.id}`);
    } catch (e: any) { setErr(e.message); setBusy(""); }
  };
  const upd = (path: string, v: any) => {
    const d = structuredClone(draft); const ks = path.split("."); let o = d;
    ks.slice(0, -1).forEach((k) => (o = o[k])); o[ks.at(-1)!] = v; setDraft(d);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
      <div className="xl:col-span-3 space-y-5">
        <div className="card">
          <div className="flex items-center gap-2 h-title"><PenLine size={16} /> What should your agent buy?</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-canvas p-3 text-sm outline-none focus:ring-2 focus:ring-brand/30" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
            {EXAMPLES.map((e) => (
              <button key={e.label} onClick={() => setText(e.text)} title={e.text}
                className={`text-left rounded-xl border px-3 py-2 transition ${text === e.text ? "border-brand bg-brand-soft" : "border-slate-200 bg-white hover:border-brand/40"}`}>
                <div className="text-xs font-semibold">{e.label}</div>
                <span className={`pill mt-1 !text-[10px] ${e.tone}`}>{e.outcome}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={compile} disabled={!!busy} className="btn-primary">
              {busy === "compile" ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />} Compile mandate
            </button>
            <span className="text-xs text-ink-muted">AI turns your words into a least-privilege spending policy. You review before signing.</span>
          </div>
          {err && <div className="mt-3 text-sm text-rose-600">{err}</div>}
        </div>

        {draft && (
          <div className="card border-brand/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 h-title"><ShieldCheck size={16} className="text-brand" /> Mandate contract</div>
              <span className="pill bg-brand-soft text-brand">{draft.type === "standing" ? "Standing · human not present" : "One-time · human present"}</span>
            </div>
            <p className="mt-3 text-[15px] font-medium leading-relaxed">“{draft.summary}”</p>
            <div className="grid sm:grid-cols-3 gap-3 mt-4">
              <Field icon={Lock} label="Total budget">
                <input type="number" value={draft.budget.max_total} onChange={(e) => upd("budget.max_total", +e.target.value)} className="w-full bg-transparent font-bold text-lg outline-none" />
              </Field>
              <Field icon={Package} label="Per item cap">
                <input type="number" value={draft.budget.max_per_item} onChange={(e) => upd("budget.max_per_item", +e.target.value)} className="w-full bg-transparent font-bold text-lg outline-none" />
              </Field>
              <Field icon={CalendarClock} label="Expires in (days)">
                <input type="number" value={draft.expires_in_days} onChange={(e) => upd("expires_in_days", +e.target.value)} className="w-full bg-transparent font-bold text-lg outline-none" />
              </Field>
              <Field icon={Package} label="Qty / purchases"><div className="font-bold text-lg">{draft.quantity_max} / {draft.max_purchases}</div></Field>
              <Field icon={Store} label="Allowed stores"><div className="text-sm font-semibold">{draft.merchants_allow.length ? draft.merchants_allow.join(", ") : "Any reputable"}</div></Field>
              <Field icon={ShieldCheck} label="Ask me above"><div className="font-bold text-lg">{draft.escalate_above ? usd(draft.escalate_above) : "never"}</div></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mt-3 text-xs">
              <div><span className="label">Must have: </span>{draft.must_have.join(", ") || "—"}</div>
              <div><span className="label">Avoid: </span>{draft.avoid.join(", ") || "—"}</div>
              <div><span className="label">Search plan: </span>{draft.search_queries.join(" · ")}</div>
              <div><span className="label">Ship to: </span>locked to your profile address</div>
            </div>
            <div className="flex items-center gap-3 mt-5 pt-4 border-t border-slate-100">
              <button onClick={sign} disabled={!!busy} className="btn bg-[#FFC439] text-[#003087] hover:brightness-95">
                {busy === "sign" ? <Loader2 className="animate-spin" size={16} /> : <Lock size={16} />} Sign & hold {usd(draft.budget.max_total)} with PayPal
              </button>
              <span className="text-xs text-ink-muted">Creates a PayPal authorization for the budget. Agents can capture only what the gateway allows; the rest is voided.</span>
            </div>
          </div>
        )}
      </div>

      <div className="xl:col-span-2 card">
        <div className="h-title mb-4">Your mandates</div>
        <div className="space-y-3">
          {list.map((m) => (
            <Link key={m.id} to={`/mandates/${m.id}`} className="block rounded-xl border border-slate-100 p-3 hover:border-brand/30 transition">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold truncate pr-2">{m.policy.goal}</div>
                <span className={`pill ${m.status === "active" ? "bg-pine-soft text-pine" : m.status === "revoked" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>{m.status.replace("_", " ")}</span>
              </div>
              <div className="text-[11px] text-ink-muted my-1.5">{m.id} · {m.policy.type}</div>
              <BudgetBar spent={m.spent} total={m.policy.budget.max_total} />
            </Link>
          ))}
          {!list.length && <Empty>No mandates yet.</Empty>}
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, children }: any) {
  return (
    <div className="rounded-xl bg-canvas p-3">
      <div className="flex items-center gap-1.5 label mb-1"><Icon size={12} />{label}</div>
      {children}
    </div>
  );
}

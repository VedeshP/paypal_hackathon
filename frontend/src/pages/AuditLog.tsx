import { useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);
const gridTheme = themeQuartz.withParams({ fontFamily: "Plus Jakarta Sans, Inter, sans-serif", headerBackgroundColor: "#F4F6F3", accentColor: "#1E6B45", borderRadius: 10 });
import { Loader2, MessageSquareText, Send } from "lucide-react";
import { api } from "../api";

const Badge = (p: any) => {
  const v = p.value;
  if (!v) return null;
  const cls = v === "ALLOW" ? "bg-pine-soft text-pine" : v === "BLOCK" ? "bg-rose-50 text-rose-700" : v === "ESCALATE" ? "bg-amber-50 text-amber-700" : "bg-brand-soft text-brand";
  return <span className={`pill ${cls}`}>{v}</span>;
};

const QUESTIONS = [
  "Which merchants were blocked most, and what was the total value blocked?",
  "Summarise the most recent blocked purchases and why they were blocked.",
  "Compare decisions with the gateway on versus off.",
];

export default function AuditLog() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState(QUESTIONS[0]);
  const [chat, setChat] = useState<{ q: string; a?: string; steps?: any[]; err?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [conv, setConv] = useState<string | undefined>();

  useEffect(() => {
    api("/events?limit=1000&include_lab=true").then((evs) =>
      setRows(evs.filter((e: any) => ["decision", "mandate", "payment", "approval", "notify"].includes(e.kind)).map((e: any) => ({
        time: new Date(e.ts * 1000).toLocaleString(), kind: e.kind, decision: e.decision ?? e.status,
        protected: e.protected, product: e.product?.title, merchant: e.merchant ?? e.product?.merchant,
        amount: e.amount, reasons: (e.reasons ?? []).join(" · "), mandate: e.mandate_id, run: e.run_id,
      }))));
  }, []);

  const ask = async () => {
    setBusy(true);
    const entry: any = { q };
    setChat((c) => [...c, entry]);
    try {
      const r = await api("/auditor/ask", { json: { question: q, conversation_id: conv } });
      if (r.error) entry.err = r.error; else { entry.a = r.answer; entry.steps = r.steps; setConv(r.conversation_id); }
    } catch (e: any) { entry.err = e.message; }
    setChat((c) => [...c.slice(0, -1), entry]);
    setBusy(false);
  };

  const cols = useMemo(() => [
    { field: "time", width: 170 }, { field: "kind", width: 110, filter: true }, { field: "decision", width: 130, cellRenderer: Badge, filter: true },
    { field: "protected", width: 110, filter: true }, { field: "product", flex: 1, minWidth: 200 }, { field: "merchant", width: 160, filter: true },
    { field: "amount", width: 110, valueFormatter: (p: any) => (p.value ? `$${p.value.toFixed(2)}` : "") },
    { field: "reasons", flex: 1.4, minWidth: 260, tooltipField: "reasons" }, { field: "mandate", width: 150 }, { field: "run", width: 150 },
  ], []);

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-4 gap-5">
      <div className="card !p-3 2xl:col-span-3">
        <div style={{ height: "72vh" }}>
          <AgGridReact theme={gridTheme} rowData={rows} columnDefs={cols as any} defaultColDef={{ sortable: true, resizable: true }} pagination paginationPageSize={50} />
        </div>
      </div>
      <div className="card flex flex-col" style={{ maxHeight: "76vh" }}>
        <div className="flex items-center gap-2 h-title"><MessageSquareText size={16} /> Ask the auditor</div>
        <div className="text-[11px] text-ink-muted mt-1">Elastic Agent Builder agent with ES|QL tools over the <code>mandate-events</code> index.</div>
        <div className="flex-1 overflow-auto mt-3 space-y-3">
          {chat.map((c, i) => (
            <div key={i} className="text-sm">
              <div className="font-semibold">{c.q}</div>
              {c.a && <div className="mt-1 whitespace-pre-wrap text-ink/90 bg-canvas rounded-xl p-3">{c.a}</div>}
              {c.steps?.length ? <div className="text-[11px] text-ink-muted mt-1">tools: {c.steps.filter((s) => s.tool).map((s) => s.tool).join(", ")}</div> : null}
              {c.err && <div className="text-xs text-rose-600 mt-1 break-all">{c.err}</div>}
              {!c.a && !c.err && <div className="text-xs text-ink-muted mt-1 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> querying Elastic…</div>}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 mt-3">
          {QUESTIONS.map((x) => <button key={x} onClick={() => setQ(x)} className="pill bg-slate-100 text-slate-600 !font-medium">{x.slice(0, 34)}…</button>)}
        </div>
        <div className="flex gap-2 mt-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 rounded-xl border border-slate-200 bg-canvas px-3 text-sm outline-none" />
          <button disabled={busy} onClick={ask} className="btn-primary !px-3"><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}

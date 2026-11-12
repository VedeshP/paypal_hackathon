import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { api, ago, usd } from "../api";
import { Decision, Empty } from "../components/ui";

const TABS = [["all", "All runs"], ["live", "Live & standing"], ["lab", "Attack Lab"]] as const;

export default function Runs() {
  const [tab, setTab] = useState<string>("all");
  const [runs, setRuns] = useState<any[]>([]);
  useEffect(() => {
    const load = () => api(`/runs?kind=${tab}`).then(setRuns);
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [tab]);

  return (
    <div className="card">
      <div className="flex gap-2 mb-4">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`pill !px-3 !py-1.5 ${tab === k ? "bg-brand-dark text-white" : "bg-slate-100 text-slate-600"}`}>{l}</button>
        ))}
        <span className="ml-auto text-xs text-ink-muted self-center">{runs.length} runs · stored in SQLite, decisions mirrored to Elastic</span>
      </div>
      <div className="grid grid-cols-12 label pb-2 border-b border-slate-100 gap-2">
        <div className="col-span-3">Run / goal</div><div className="col-span-1">Type</div><div className="col-span-1">Gateway</div>
        <div className="col-span-2">Decisions</div><div className="col-span-1">Spent</div><div className="col-span-3">Agent output</div><div className="col-span-1 text-right">When</div>
      </div>
      {runs.map((r) => (
        <Link key={r.id} to={`/runs/${r.id}`} className="grid grid-cols-12 gap-2 items-center py-3 border-b border-slate-50 hover:bg-slate-50 rounded-lg">
          <div className="col-span-3 min-w-0">
            <div className="text-sm font-semibold truncate">{r.goal ?? r.mandate_id}</div>
            <div className="text-[11px] text-ink-muted">{r.id} · <span className={r.status === "completed" ? "text-pine" : r.status === "failed" ? "text-rose-600" : ""}>{r.status}</span>{r.duration ? ` · ${r.duration}s` : ""}</div>
          </div>
          <div className="col-span-1"><span className="pill bg-slate-100 text-slate-600">{r.kind}{r.scenario ? `: ${r.scenario}` : ""}</span></div>
          <div className="col-span-1">{r.protected ? <ShieldCheck size={16} className="text-pine" /> : <ShieldOff size={16} className="text-rose-500" />}</div>
          <div className="col-span-2 flex flex-wrap gap-1">{r.decisions.map((d: string, i: number) => <Decision key={i} d={d} />)}{!r.decisions.length && <span className="text-xs text-ink-muted">none</span>}</div>
          <div className="col-span-1 text-sm font-bold">{r.spent ? usd(r.spent) : "—"}</div>
          <div className="col-span-3 text-xs text-ink-muted line-clamp-2">{r.summary || "—"}</div>
          <div className="col-span-1 text-[11px] text-ink-muted text-right">{ago(r.ts)}</div>
        </Link>
      ))}
      {!runs.length && <Empty>No runs yet.</Empty>}
    </div>
  );
}

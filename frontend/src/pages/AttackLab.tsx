import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, Loader2, Play, ShieldCheck, ShieldOff, Skull, Target } from "lucide-react";
import { api } from "../api";

export default function AttackLab() {
  const [scen, setScen] = useState<any[]>([]);
  const [lab, setLab] = useState<any>(null);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    api("/lab/scenarios").then(setScen);
    api("/lab").then((l) => l[0] && setLab(l[0]));
    return () => esRef.current?.close();
  }, []);

  const start = async () => {
    setProgress({});
    const l = await api("/lab", { json: {} });
    setLab(l);
    esRef.current?.close();
    const es = new EventSource(`/api/runs/${l.id}/stream`);
    esRef.current = es;
    es.onmessage = (m) => {
      const e = JSON.parse(m.data);
      if (e.kind === "lab_progress") setProgress((p) => ({ ...p, [`${e.scenario}:${e.protected}`]: e }));
      if (e.kind === "lab_done") { api(`/lab/${l.id}`).then(setLab); es.close(); }
    };
  };

  const running = lab?.status === "running";
  const results: any[] = lab?.results ?? Object.values(progress).filter((p: any) => p.state === "done");
  const cell = (sid: string, prot: boolean) => results.find((r) => r.scenario === sid && r.protected === prot) ?? progress[`${sid}:${prot}`];
  const sum = lab?.summary;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card lg:col-span-1">
          <div className="flex items-center gap-2 h-title"><FlaskConical size={16} /> Red-team suite</div>
          <p className="text-sm text-ink-muted mt-2">
            Same agent, same task (“fishing gift for dad, max $80”). Each scenario plants a prompt injection in an
            untrusted product listing. We run it <b>without</b> and <b>with</b> the Mandate Gateway and measure, like AgentDojo:
          </p>
          <ul className="text-sm mt-2 space-y-1">
            <li>• <b>Attack success rate</b> — did the attacker’s goal execute?</li>
            <li>• <b>Utility</b> — did the user still get a valid gift?</li>
          </ul>
          <button onClick={start} disabled={running} className="btn-primary mt-4 w-full justify-center">
            {running ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />} {running ? "Running agents…" : `Run ${scen.length * 2} agent runs`}
          </button>
          <div className="text-[11px] text-ink-muted mt-2">Dry-run: payments simulated, no sandbox money moves.</div>
        </div>
        <Score title="Without gateway" icon={ShieldOff} tone="rose" s={sum?.baseline} />
        <Score title="With Mandate Gateway" icon={ShieldCheck} tone="pine" s={sum?.protected} />
      </div>

      <div className="card">
        <div className="grid grid-cols-12 label pb-2 border-b border-slate-100">
          <div className="col-span-5">Scenario</div><div className="col-span-3">Baseline agent</div><div className="col-span-3">Mandate Gateway</div><div className="col-span-1" />
        </div>
        {scen.map((s) => (
          <div key={s.id} className="grid grid-cols-12 items-center py-3 border-b border-slate-50 gap-2">
            <div className="col-span-5">
              <div className="flex items-center gap-2 font-semibold text-sm"><Target size={14} className="text-rose-500" />{s.name}</div>
              <div className="text-[11px] text-ink-muted">{s.research}</div>
            </div>
            <div className="col-span-3"><Cell r={cell(s.id, false)} running={running} /></div>
            <div className="col-span-3"><Cell r={cell(s.id, true)} running={running} /></div>
            <div className="col-span-1 text-right text-xs space-x-2">
              {cell(s.id, false)?.run_id && <Link className="text-brand" to={`/runs/${cell(s.id, false).run_id}`}>A</Link>}
              {cell(s.id, true)?.run_id && <Link className="text-brand" to={`/runs/${cell(s.id, true).run_id}`}>B</Link>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Score({ title, icon: Icon, tone, s }: any) {
  const c = tone === "rose" ? "text-rose-600" : "text-pine";
  return (
    <div className="card">
      <div className={`flex items-center gap-2 h-title ${c}`}><Icon size={16} /> {title}</div>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-xl bg-canvas p-4">
          <div className="label">Attack success</div>
          <div className={`text-4xl font-extrabold mt-1 ${c}`}>{s ? `${Math.round(s.asr * 100)}%` : "—"}</div>
        </div>
        <div className="rounded-xl bg-canvas p-4">
          <div className="label">Utility</div>
          <div className="text-4xl font-extrabold mt-1">{s ? `${Math.round(s.utility * 100)}%` : "—"}</div>
        </div>
      </div>
      <div className="rounded-xl bg-canvas p-4 mt-3 flex items-center justify-between">
        <div className="label">Poisoned listings caught by gateway</div>
        <div className={`text-2xl font-extrabold ${c}`}>{s ? `${Math.round((s.detection ?? 0) * 100)}%` : "—"}</div>
      </div>
      <div className="text-[11px] text-ink-muted mt-2">{s ? `${s.n} runs` : "run the suite to measure"}</div>
    </div>
  );
}

function Cell({ r, running }: { r: any; running: boolean }) {
  if (!r) return <span className="text-xs text-ink-muted">{running ? "queued…" : "—"}</span>;
  if (r.status === "failed") return <span className="pill bg-slate-100 text-slate-600" title={r.summary}>LLM error · retry</span>;
  if (r.state === "started") return <span className="pill bg-brand-soft text-brand"><Loader2 size={12} className="animate-spin" /> running</span>;
  if (r.attack_success) return <span className="pill bg-rose-50 text-rose-700"><Skull size={12} /> attacker won</span>;
  const blocked = (r.proposals ?? []).some((p: any) => p.decision === "BLOCK") || r.detected;
  return (
    <div className="flex flex-wrap gap-1">
      <span className="pill bg-pine-soft text-pine"><ShieldCheck size={12} /> attack failed</span>
      {blocked && <span className="pill bg-rose-50 text-rose-700">poison caught</span>}
      <span className={`pill ${r.utility ? "bg-lime-soft text-pine" : "bg-slate-100 text-slate-500"}`}>{r.utility ? "gift bought" : "no purchase"}</span>
    </div>
  );
}

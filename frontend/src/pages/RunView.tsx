import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Brain, Wrench, Search, AlertOctagon, CreditCard, MonitorPlay, CircleCheck, ShieldCheck, ShieldOff } from "lucide-react";
import { api, usd } from "../api";
import { Checks, Decision } from "../components/ui";

export default function RunView() {
  const { id } = useParams();
  const [run, setRun] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    seen.current = new Set();
    api(`/runs/${id}`).then((d) => {
      setRun(d.run);
      d.events.forEach((e: any) => seen.current.add(e.id));
      setEvents(d.events);
    });
    const es = new EventSource(`/api/runs/${id}/stream`);
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data);
      if (seen.current.has(e.id)) return;
      seen.current.add(e.id);
      setEvents((xs) => [...xs, e]);
      if (e.kind === "status") api(`/runs/${id}`).then((d) => setRun(d.run));
    };
    return () => es.close();
  }, [id]);

  const browserEvs = events.filter((e) => e.kind === "browser");
  const live = [...browserEvs].reverse().find((e) => e.live_view_url);
  const replay = [...browserEvs].reverse().find((e) => e.replay_view_url);
  const status = run?.status;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="xl:col-span-2 card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {run?.protected ? <span className="pill bg-pine-soft text-pine"><ShieldCheck size={12} /> Gateway ON</span>
              : <span className="pill bg-rose-50 text-rose-700"><ShieldOff size={12} /> Gateway OFF (baseline)</span>}
            {run?.scenario && <span className="pill bg-amber-50 text-amber-700">attack: {run.scenario}</span>}
          </div>
          <span className="pill bg-slate-100 text-slate-700">
            {status === "running" && <span className="h-1.5 w-1.5 rounded-full bg-brand live-dot" />} {status}
          </span>
        </div>
        <ol className="relative border-l-2 border-slate-100 ml-3 space-y-4">
          {events.map((e) => <Event key={e.id} e={e} />)}
        </ol>
        {run?.summary && (
          <div className="mt-5 rounded-xl bg-brand-soft p-4 text-sm"><span className="font-semibold">Agent: </span>{run.summary}</div>
        )}
      </div>

      <div className="space-y-5">
        <div className="card">
          <div className="flex items-center gap-2 h-title mb-3"><MonitorPlay size={16} /> Verify-before-pay (KERNEL)</div>
          {replay?.replay_view_url ? (
            <>
              <div className="label mb-1">Recording of the check (KERNEL replay)</div>
              <iframe src={replay.replay_view_url} className="w-full aspect-video rounded-xl border" allow="autoplay; fullscreen" />
            </>
          ) : live?.live_view_url && run?.status === "running" ? (
            <>
              <div className="label mb-1 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-500 live-dot" /> Live cloud browser</div>
              <iframe src={`${live.live_view_url}${live.live_view_url.includes("?") ? "&" : "?"}readOnly=true`} className="w-full aspect-video rounded-xl border" allow="autoplay" />
            </>
          ) : live ? (
            <div className="text-xs text-ink-muted">The cloud browser session has closed{run?.verification?.final_url ? <> after visiting <a className="text-brand break-all" href={run.verification.final_url} target="_blank">{run.verification.final_url}</a></> : null}.</div>
          ) : <div className="text-xs text-ink-muted">A cloud browser opens the real retailer page before any payment to confirm price and stock independently of the listing.</div>}
          {run?.verification?.title && <div className="text-[11px] text-ink-muted mt-2 truncate">page: {run.verification.title}</div>}
          {run?.verification && <div className="text-xs mt-2"><b>{run.verification.status}</b> — {run.verification.reason}</div>}
        </div>
        <div className="card">
          <div className="h-title mb-2">Proposals</div>
          {(run?.proposals ?? []).map((p: any, i: number) => (
            <div key={i} className="flex items-center gap-2 py-1.5 text-sm">
              <Decision d={p.decision} /><span className="flex-1 truncate">{p.product_id}</span><b>{usd(p.amount)}</b>
            </div>
          ))}
          {run?.mandate_id && <Link to={`/mandates/${run.mandate_id}`} className="text-xs text-brand font-semibold mt-3 inline-block">← back to mandate</Link>}
        </div>
      </div>
    </div>
  );
}

function Dot({ icon: Icon, cls }: any) {
  return <span className={`absolute -left-[13px] grid place-items-center h-6 w-6 rounded-full ring-4 ring-white ${cls}`}><Icon size={12} /></span>;
}

function Event({ e }: { e: any }) {
  const wrap = (icon: any, cls: string, body: React.ReactNode) => (
    <li className="pl-6 relative"><Dot icon={icon} cls={cls} />{body}</li>
  );
  switch (e.kind) {
    case "status":
      return wrap(CircleCheck, "bg-slate-100 text-slate-600", <div className="text-xs text-ink-muted">
        run {e.status}{e.planner ? ` · planner ${e.planner} · extractor ${e.extractor}` : ""}</div>);
    case "thought":
      return wrap(Brain, "bg-brand-soft text-brand", <div className="text-sm whitespace-pre-wrap">{e.text}</div>);
    case "call":
      return wrap(Wrench, "bg-slate-100 text-slate-700", <div className="text-xs"><span className="font-mono font-semibold">{e.tool}</span>
        <span className="text-ink-muted font-mono"> {JSON.stringify(e.args).slice(0, 220)}</span></div>);
    case "tool":
      return wrap(Search, "bg-slate-100 text-slate-700", <div className="text-xs text-ink-muted">Channel3 “{e.query}” → {e.count} products
        {e.filters?.max_price ? ` (≤ ${usd(e.filters.max_price)}, filtered by mandate)` : " (unfiltered)"}</div>);
    case "taint":
      return wrap(AlertOctagon, "bg-amber-100 text-amber-700", <div className="text-xs">
        <div className="font-semibold text-amber-700">Quarantined extractor flagged manipulated listings</div>
        {e.products.map((p: any) => <div key={p.id} className="text-ink-muted">• {p.title}: {p.red_flags.join(", ")}</div>)}</div>);
    case "decision":
      return wrap(e.decision === "ALLOW" ? ShieldCheck : AlertOctagon,
        e.decision === "ALLOW" ? "bg-pine-soft text-pine" : e.decision === "BLOCK" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700",
        <div className={`rounded-xl border p-3 ${e.decision === "BLOCK" ? "border-rose-200 bg-rose-50/40" : e.decision === "ESCALATE" ? "border-amber-200 bg-amber-50/40" : "border-slate-100"}`}>
          <div className="flex items-center gap-2">
            <Decision d={e.decision} />
            <span className="text-sm font-semibold truncate">{e.product?.title ?? e.proposal?.product_id}</span>
            <span className="ml-auto text-sm font-bold">{usd(e.amount)}</span>
          </div>
          <div className="text-xs text-ink-muted mt-1">qty {e.proposal?.quantity} · ship to {e.proposal?.ship_to}</div>
          {e.decision !== "ALLOW" && <div className="text-xs mt-1.5 font-medium">{e.reasons.join(" · ")}</div>}
          <Checks checks={e.checks} />
        </div>);
    case "payment":
      return wrap(CreditCard, "bg-[#FFC439] text-[#003087]", <div className="text-sm">PayPal <b>{e.status}</b> {e.amount ? usd(e.amount) : ""}
        {e.capture_id && <span className="text-xs text-ink-muted"> · capture {e.capture_id}</span>}
        {e.approve_url && <a href={e.approve_url} className="ml-2 btn-primary !py-1 !px-2 text-xs">Approve in PayPal</a>}
        {e.error && <div className="text-xs text-rose-600 break-all">{e.error}</div>}</div>);
    case "browser":
      return wrap(MonitorPlay, "bg-slate-100 text-slate-700", <div className="text-xs">
        {e.status === "browsing" ? "KERNEL cloud browser opened the retailer page" : <>KERNEL verification: <b>{e.status}</b> — {e.reason}</>}
        {e.url && <span className="text-ink-muted"> · {String(e.url).slice(0, 60)}</span>}</div>);
    default:
      return null;
  }
}

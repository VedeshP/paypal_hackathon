import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, FlaskConical, Plus } from "lucide-react";
import { api, ago, usd } from "../api";
import { BudgetBar, Decision, Empty, Stat } from "../components/ui";

export default function Overview() {
  const [stats, setStats] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [mandates, setMandates] = useState<any[]>([]);

  const load = () => {
    api("/stats").then(setStats);
    api("/events?limit=60").then((e) => setEvents(e.filter((x: any) => ["decision", "mandate", "payment", "approval"].includes(x.kind))));
    api("/mandates").then(setMandates);
  };
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const d = stats?.decisions ?? { ALLOW: 0, BLOCK: 0, ESCALATE: 0 };
  const chart = [
    { name: "Allowed", v: d.ALLOW, c: "#C4F042" },
    { name: "Escalated", v: d.ESCALATE, c: "#1E6B45" },
    { name: "Blocked", v: d.BLOCK, c: "#0E2E1F" },
  ];
  const lab = stats?.latest_lab;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <Stat label="Authorized by you" value={usd(stats?.authorized_total ?? 0)} sub={`${stats?.mandates_active ?? 0} active mandates · PayPal holds`} />
        <Stat label="Spent by agents" value={usd(stats?.spent_total ?? 0)} sub="captured in PayPal sandbox" />
        <Stat label="Blocked before payment" value={usd(stats?.blocked_value ?? 0)} accent="text-rose-600" sub={`${d.BLOCK} attempts stopped`} />
        <Stat label="Waiting on you" value={String(stats?.pending_approvals ?? 0)} accent="text-amber-600"
          sub={<Link to="/approvals" className="text-brand font-semibold">Review approvals →</Link>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="h-title">Gateway decisions</div>
            <span className="label">all protected runs</span>
          </div>
          <div className="h-56 mt-4">
            <ResponsiveContainer>
              <BarChart data={chart} barSize={56}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} fontSize={12} width={28} />
                <Tooltip cursor={{ fill: "#F1F5F9" }} contentStyle={{ borderRadius: 12, border: "none", background: "#0F172A", color: "white" }} />
                <Bar dataKey="v" radius={[10, 10, 10, 10]}>{chart.map((c) => <Cell key={c.name} fill={c.c} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-brand-dark to-brand text-white border-0">
          <div className="flex items-center gap-2 text-sm font-semibold"><FlaskConical size={16} /> Attack Lab scorecard</div>
          {lab ? (
            <>
              <div className="grid grid-cols-2 gap-3 mt-5">
                <div className="rounded-xl bg-white/10 p-3">
                  <div className="text-[11px] opacity-70">Attack success · baseline</div>
                  <div className="text-3xl font-extrabold text-rose-300">{Math.round(lab.baseline.asr * 100)}%</div>
                </div>
                <div className="rounded-xl bg-white/10 p-3">
                  <div className="text-[11px] opacity-70">Attack success · Mandate</div>
                  <div className="text-3xl font-extrabold text-lime">{Math.round(lab.protected.asr * 100)}%</div>
                </div>
              </div>
              <div className="mt-4 text-xs opacity-80">Task utility: {Math.round(lab.baseline.utility * 100)}% → {Math.round(lab.protected.utility * 100)}% with gateway</div>
            </>
          ) : <div className="text-sm opacity-70 mt-6">No lab run yet.</div>}
          <Link to="/lab" className="btn bg-lime text-ink mt-5 w-full justify-center">Run red-team suite <ArrowUpRight size={16} /></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="h-title">Active mandates</div>
            <Link to="/mandates" className="btn-ghost !py-1.5 !px-2.5 text-xs"><Plus size={14} /> New</Link>
          </div>
          <div className="space-y-4">
            {mandates.filter((m) => m.status === "active").slice(0, 4).map((m) => (
              <Link key={m.id} to={`/mandates/${m.id}`} className="block">
                <div className="text-sm font-semibold truncate">{m.policy.goal}</div>
                <div className="text-[11px] text-ink-muted mb-1.5">{m.policy.type === "standing" ? "Standing" : "One-time"} · expires {new Date(m.expires_at).toLocaleDateString()}</div>
                <BudgetBar spent={m.spent} total={m.policy.budget.max_total} />
              </Link>
            ))}
            {!mandates.some((m) => m.status === "active") && <Empty>No active mandates.</Empty>}
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="h-title mb-3">Recent activity</div>
          <div className="divide-y divide-slate-100">
            {events.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2.5">
                <Decision d={e.decision ?? (e.kind === "payment" ? "ALLOW" : undefined)} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {e.product?.title ?? (e.kind === "payment" ? `PayPal ${e.status}` : e.kind === "mandate" ? `Mandate ${e.action}` : e.kind)}
                  </div>
                  <div className="text-[11px] text-ink-muted truncate">{(e.reasons ?? []).join(" · ")}</div>
                </div>
                <div className="text-sm font-semibold">{e.amount ? usd(e.amount) : ""}</div>
                <div className="text-[11px] text-ink-muted w-14 text-right">{ago(e.ts)}</div>
                {e.run_id && <Link to={`/runs/${e.run_id}`} className="text-brand text-xs font-semibold">view</Link>}
              </div>
            ))}
            {!events.length && <Empty>Nothing yet — create a mandate to get started.</Empty>}
          </div>
        </div>
      </div>
    </div>
  );
}

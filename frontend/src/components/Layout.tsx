import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { useEffect, useState } from "react";
import {
  LayoutGrid, LogOut, BadgeCheck, Bot, TowerControl, FileSignature, ShieldCheck, Bell, FlaskConical, ScrollText, Plug, Search, CircleDot,
} from "lucide-react";
import { api } from "../api";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutGrid },
  { to: "/mandates", label: "Mandates", icon: FileSignature },
  { to: "/runs", label: "Agent Runs", icon: Bot },
  { to: "/tower", label: "Control Tower", icon: TowerControl },
  { to: "/approvals", label: "Approvals", icon: Bell, badge: "approvals" },
  { to: "/lab", label: "Attack Lab", icon: FlaskConical },
  { to: "/audit", label: "Audit Log", icon: ScrollText },
];

const TITLES: Record<string, [string, string]> = {
  "": ["Overview", "Every dollar your agents move, checked against what you signed."],
  mandates: ["Mandates", "Tell your agent what it may spend — we turn it into a signed, enforceable policy."],
  runs: ["Agent Runs", "Every agent run with its live trace, gateway decisions and output - stored and replayable."],
  approvals: ["Approvals", "Purchases the gateway escalated to you."],
  lab: ["Attack Lab", "Red-team your agent with prompt-injection attacks, with and without the gateway."],
  audit: ["Audit Log", "Append-only record of every action, mirrored to Elastic."],
  tower: ["Control Tower", "AG Studio dashboards over live gateway data - ask the built-in agents to build views for you."],
  connect: ["Connect any agent", "Use the Mandate Gateway as an MCP server from Claude, ChatGPT or Cursor."],
};

export default function Layout() {
  const { user, loading, logout } = useAuth();
  const loc = useLocation();
  const seg = loc.pathname.split("/")[1] ?? "";
  const [title, sub] = TITLES[seg] ?? TITLES[""];
  const [health, setHealth] = useState<any>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    api("/health").then(setHealth).catch(() => {});
    const t = setInterval(() => api("/stats").then((s) => setPending(s.pending_approvals)).catch(() => {}), 4000);
    api("/stats").then((s) => setPending(s.pending_approvals)).catch(() => {});
    return () => clearInterval(t);
  }, []);

  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-ink-muted">Loading…</div>;
  if (!user) return <Navigate to={loc.pathname === "/" ? "/home" : "/login"} replace />;
  const initials = (user.name || user.email || "U").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("");

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 bg-white border-r border-slate-100 flex flex-col p-5 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="h-9 w-9 rounded-xl bg-lime grid place-items-center text-brand-dark">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="font-extrabold text-lg leading-none">Mandate</div>
            <div className="text-[11px] text-ink-muted">guardrails for agent payments</div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-canvas rounded-xl px-3 py-2 text-sm text-ink-muted mb-5">
          <Search size={15} /> Search <span className="ml-auto text-[11px] bg-white rounded px-1.5">⌘K</span>
        </div>
        <div className="label uppercase tracking-wider mb-2">Menu</div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, badge }) => (
            <NavLink key={to} to={to} end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? "bg-brand-soft text-brand" : "text-slate-600 hover:bg-slate-50"}`}>
              <Icon size={18} /> {label}
              {badge && pending > 0 && (
                <span className="ml-auto bg-rose-500 text-white text-[11px] rounded-full px-1.5">{pending}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="label uppercase tracking-wider mt-6 mb-2">Tools</div>
        <NavLink to="/connect" className={({ isActive }) =>
          `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${isActive ? "bg-brand-soft text-brand" : "text-slate-600 hover:bg-slate-50"}`}>
          <Plug size={18} /> Connect via MCP
        </NavLink>

        <div className="mt-auto rounded-xl2 bg-gradient-to-br from-brand-dark to-brand p-4 text-white">
          <div className="text-sm font-bold mb-2">Integrations</div>
          <div className="space-y-1 text-[11px]">
            {health && Object.entries(health.integrations).map(([k, v]: any) => (
              <div key={k} className="flex items-center gap-1.5">
                <CircleDot size={10} className={String(v).includes("not") || v === "unconfigured" ? "text-amber-300" : "text-lime"} />
                <span className="capitalize w-16 opacity-80">{k}</span>
                <span className="truncate opacity-95">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="flex items-center justify-between px-8 pt-7 pb-5">
          <div>
            <h1 className="text-2xl font-extrabold">{title}</h1>
            <p className="text-sm text-ink-muted mt-0.5">{sub}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="pill bg-lime-soft text-pine"><span className="h-1.5 w-1.5 rounded-full bg-pine live-dot" /> PayPal Sandbox</span>
            <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-1.5 shadow-card">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand to-lime grid place-items-center text-white text-xs font-bold">{initials}</div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">{user.name || "User"}</div>
                <div className="text-[11px] text-ink-muted flex items-center gap-1">
                  {user.payer_id ? <><BadgeCheck size={11} className="text-pine" /> PayPal linked · {user.email || user.payer_id}</> : "PayPal not linked yet"}
                </div>
              </div>
              <button onClick={logout} title="Sign out" className="ml-2 text-ink-muted hover:text-ink"><LogOut size={16} /></button>
            </div>
          </div>
        </header>
        <div className="px-8 pb-10"><Outlet /></div>
      </main>
    </div>
  );
}

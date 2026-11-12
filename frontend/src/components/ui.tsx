import { ShieldCheck, ShieldX, ShieldAlert, Check, X, AlertTriangle, Info } from "lucide-react";
import { usd } from "../api";

export function Decision({ d }: { d?: string }) {
  if (!d) return null;
  const map: Record<string, string> = {
    ALLOW: "bg-pine-soft text-pine", BLOCK: "bg-rose-50 text-rose-700", ESCALATE: "bg-amber-50 text-amber-700",
    SIGNED: "bg-brand-soft text-brand", FUNDED: "bg-brand-soft text-brand", APPROVED: "bg-pine-soft text-pine",
    REJECTED: "bg-rose-50 text-rose-700", REVOKED: "bg-slate-100 text-slate-600",
  };
  const Icon = d === "ALLOW" ? ShieldCheck : d === "BLOCK" ? ShieldX : d === "ESCALATE" ? ShieldAlert : ShieldCheck;
  return <span className={`pill ${map[d] ?? "bg-slate-100 text-slate-600"}`}><Icon size={12} />{d}</span>;
}

export function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: React.ReactNode; accent?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`text-3xl font-extrabold mt-3 tracking-tight ${accent ?? ""}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

export function BudgetBar({ spent, total }: { spent: number; total: number }) {
  const pct = Math.min(100, total ? (spent / total) * 100 : 0);
  return (
    <div>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-brand to-lime" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-ink-muted mt-1">
        <span>{usd(spent)} spent</span><span>{usd(total)} authorized</span>
      </div>
    </div>
  );
}

export function Checks({ checks }: { checks: any[] }) {
  if (!checks?.length) return null;
  return (
    <div className="grid sm:grid-cols-2 gap-1.5 mt-3">
      {checks.map((c, i) => {
        const Icon = c.ok ? Check : c.severity === "escalate" ? AlertTriangle : c.severity === "info" ? Info : X;
        const color = c.ok ? "text-pine bg-pine-soft" : c.severity === "escalate" ? "text-amber-700 bg-amber-50" : c.severity === "info" ? "text-slate-600 bg-slate-100" : "text-rose-700 bg-rose-50";
        return (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 rounded-md p-0.5 ${color}`}><Icon size={12} /></span>
            <div><span className="font-semibold">{c.name.replaceAll("_", " ")}</span>
              <span className="text-ink-muted"> — {c.detail}</span></div>
          </div>
        );
      })}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-ink-muted py-8 text-center">{children}</div>;
}

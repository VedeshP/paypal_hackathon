// Custom AG Studio widgets for the Mandate Control Tower.
import { useEffect, useState } from "react";
import { createWidgets } from "ag-studio-react";
import { api, usd } from "../api";

function useLive<T>(path: string, ms = 5000): T | null {
  const [d, setD] = useState<T | null>(null);
  useEffect(() => {
    const load = () => api<T>(path).then(setD).catch(() => {});
    load();
    const t = setInterval(load, ms);
    return () => clearInterval(t);
  }, [path]);
  return d;
}

const box: React.CSSProperties = { height: "100%", overflow: "auto", padding: 14, fontFamily: "Plus Jakarta Sans, sans-serif" };

function BudgetGauges() {
  const ms = useLive<any[]>("/mandates") ?? [];
  return (
    <div style={box}>
      {ms.filter((m) => m.status !== "revoked").slice(0, 6).map((m) => {
        const pct = Math.min(100, (m.spent / m.policy.budget.max_total) * 100);
        return (
          <div key={m.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{m.policy.goal}</span>
              <span>{usd(m.spent)} / {usd(m.policy.budget.max_total)}</span>
            </div>
            <div style={{ height: 10, borderRadius: 99, background: "#EEF1EE", marginTop: 4 }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#1E6B45,#C4F042)" }} />
            </div>
          </div>
        );
      })}
      {!ms.length && <div style={{ fontSize: 12, color: "#6B756F" }}>No mandates yet.</div>}
    </div>
  );
}

function ThreatFeed() {
  const evs = useLive<any[]>("/events?limit=300") ?? [];
  const blocks = evs.filter((e) => e.kind === "decision" && e.decision === "BLOCK").slice(0, 8);
  return (
    <div style={box}>
      {blocks.map((e) => (
        <div key={e.id} style={{ borderLeft: "3px solid #E11D48", paddingLeft: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{e.product?.title ?? e.proposal?.product_id} · {usd(e.amount)}</div>
          <div style={{ fontSize: 11, color: "#6B756F" }}>{(e.reasons ?? []).join(" · ").slice(0, 160)}</div>
        </div>
      ))}
      {!blocks.length && <div style={{ fontSize: 12, color: "#6B756F" }}>No blocked attempts yet.</div>}
    </div>
  );
}

function LabScorecard() {
  const s = useLive<any>("/stats");
  const lab = s?.latest_lab;
  const tile = (label: string, v: number | undefined, color: string) => (
    <div style={{ flex: 1, background: "#F1F3F1", borderRadius: 12, padding: 10 }}>
      <div style={{ fontSize: 11, color: "#6B756F" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{v == null ? "—" : `${Math.round(v * 100)}%`}</div>
    </div>
  );
  return (
    <div style={box}>
      <div style={{ display: "flex", gap: 8 }}>
        {tile("Attack success · baseline", lab?.baseline.asr, "#E11D48")}
        {tile("Attack success · Mandate", lab?.protected.asr, "#1E6B45")}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {tile("Utility · baseline", lab?.baseline.utility, "#111814")}
        {tile("Utility · Mandate", lab?.protected.utility, "#111814")}
      </div>
    </div>
  );
}

const def = (id: string, label: string, comp: any, description: string) => ({
  id, label, comp,
  form: (p: any) => p.createDefaults({}),
  defaultSize: { width: 6, height: 5 },
  minSize: { width: 3, height: 3 },
  ai: { description },
});

export const mandateWidgets = createWidgets({
  additionalTypes: [
    def("mandateBudgets", "Mandate budgets", BudgetGauges, "Live spend vs PayPal-authorized budget for each mandate"),
    def("threatFeed", "Threat feed", ThreatFeed, "Latest purchases the Mandate Gateway blocked, with reasons"),
    def("labScorecard", "Attack Lab scorecard", LabScorecard, "Attack success rate and utility with vs without the gateway"),
  ],
  menu: [{ label: "Mandate", widgetIds: ["mandateBudgets", "threatFeed", "labScorecard"] }],
} as any);

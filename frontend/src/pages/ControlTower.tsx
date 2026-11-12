import { useEffect, useMemo, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { AgStudioAiModule, createAiHarness } from "ag-studio";
import { api } from "../api";
import { mandateAdapter } from "../studio/adapter";
import { mandateWidgets } from "../studio/widgets";

const USE_WIDGETS = new URLSearchParams(location.search).get("widgets") !== "0";

const PROMPTS = [
  { label: "Blocked by merchant", prompt: "Build a bar chart of BLOCK decisions by merchant from the decisions source." },
  { label: "Why blocks happen", prompt: "Add a chart of decision counts by failed_check, protected runs only." },
  { label: "Spend vs budget", prompt: "Show each mandate's budget vs spent as a bar chart and add a KPI for total remaining." },
  { label: "Add my widgets", prompt: "Add the Mandate budgets, Threat feed and Attack Lab scorecard widgets to the page." },
];

export default function ControlTower() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api("/studio/data").then(setData); }, []);

  const studioData = useMemo(() => data && ({
    sources: [
      { id: "decisions", data: data.decisions },
      { id: "mandates", data: data.mandates },
      { id: "purchases", data: data.purchases },
    ],
  }), [data]);

  const ai = useMemo(() => ({ api }: any) => createAiHarness(api, { adapter: mandateAdapter, promptStarters: PROMPTS } as any), []);

  if (!studioData) return <div className="card">Loading Control Tower…</div>;
  return (
    <div className="card !p-0 overflow-hidden" style={{ height: "calc(100vh - 150px)" }}>
      <AgStudioProvider licenseKey={(import.meta as any).env?.VITE_AG_STUDIO_LICENSE} modules={[AgStudioAiModule]}>
        <AgStudio data={studioData as any} mode="edit" {...(USE_WIDGETS ? { widgets: mandateWidgets as any } : {})} ai={ai as any} style={{ height: "100%" }} />
      </AgStudioProvider>
    </div>
  );
}

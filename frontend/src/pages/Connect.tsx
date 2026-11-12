import { useState } from "react";
import { Check, Copy, KeyRound, Plug } from "lucide-react";
import { useAuth } from "../auth";

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="btn-ghost !py-1.5 !px-2.5 text-xs" onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
      setOk(true); setTimeout(() => setOk(false), 1500);
    }}>{ok ? <Check size={14} /> : <Copy size={14} />}{ok ? "Copied" : "Copy"}</button>
  );
}

export default function Connect() {
  const { user } = useAuth();
  const url = `${window.location.origin}/mcp/`;
  const token = user?.mcp_token ?? "";
  const cfg = JSON.stringify({ mcpServers: { mandate: { command: "npx", args: ["-y", "mcp-remote", url, "--header", `Authorization: Bearer ${token}`] } } }, null, 2);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="card">
        <div className="flex items-center gap-2 h-title"><Plug size={16} /> MCP endpoint (Streamable HTTP)</div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-canvas p-2 pl-3">
          <code className="flex-1 text-sm break-all">{url}</code><CopyBtn text={url} />
        </div>
        <p className="text-sm text-ink-muted mt-3">
          Any MCP-capable agent gets the same seatbelt: it can search products and propose purchases, but money only moves
          if the purchase fits a mandate you signed. Tools: <code>get_mandate</code>, <code>search_products</code>,{" "}
          <code>propose_purchase</code>, <code>list_purchases</code>, plus <code>list_my_mandates</code> and <code>open_run</code> for external agents.
        </p>
        <div className="flex items-center gap-2 h-title mt-5"><KeyRound size={16} /> Your agent token</div>
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-canvas p-2 pl-3">
          <code className="flex-1 text-sm break-all">{token}</code><CopyBtn text={token} />
        </div>
        <p className="text-xs text-ink-muted mt-2">Agents using this token can act only on <b>your</b> mandates. Send it as <code>Authorization: Bearer …</code>.</p>
        <div className="flex items-center gap-2 h-title mt-5">Claude.ai custom connector URL</div>
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-canvas p-2 pl-3">
          <code className="flex-1 text-xs break-all">{`${url}?token=${token}`}</code><CopyBtn text={`${url}?token=${token}`} />
        </div>
        <p className="text-xs text-ink-muted mt-2">claude.ai → Settings → Connectors → Add custom connector → paste this URL (needs the public HTTPS deployment, not localhost).
          Then ask Claude: “Use Mandate to buy me a 16kg kettlebell.”</p>
      </div>
      <div className="card">
        <div className="flex items-center justify-between"><div className="h-title">Claude Desktop / Cursor config</div><CopyBtn text={cfg} /></div>
        <pre className="mt-3 rounded-xl bg-ink text-lime p-4 text-xs overflow-auto">{cfg}</pre>
      </div>
    </div>
  );
}

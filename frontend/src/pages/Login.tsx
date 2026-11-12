import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, UserRound, Copy, Check, Lock, Bot, FlaskConical } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";

function Copyable({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm">
      <span className="label w-16">{label}</span><code className="flex-1 truncate">{value}</code>
      <button onClick={() => { navigator.clipboard?.writeText(value); setOk(true); setTimeout(() => setOk(false), 1200); }} className="text-ink-muted hover:text-ink">
        {ok ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export default function Login() {
  const [cfg, setCfg] = useState<any>(null);
  const [params] = useSearchParams();
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  useEffect(() => { api("/auth/config").then(setCfg); }, []);
  useEffect(() => { if (user) nav("/"); }, [user]);
  const demo = async () => { await api("/auth/demo", { method: "POST" }); await refresh(); nav("/"); };
  const err = params.get("error");

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-brand-dark via-brand to-pine p-12 text-white">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-lime grid place-items-center text-brand-dark"><ShieldCheck size={22} /></div>
          <div className="font-extrabold text-xl">Mandate</div>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Let AI agents shop for you<br /><span className="text-lime">without handing them your wallet.</span></h1>
          <div className="mt-8 space-y-4 text-sm text-white/85 max-w-md">
            <div className="flex gap-3"><Lock size={18} className="text-lime shrink-0" /> Say what an agent may spend. We turn it into a signed mandate backed by a PayPal authorization hold.</div>
            <div className="flex gap-3"><Bot size={18} className="text-lime shrink-0" /> Every purchase passes a gateway that prompt injection can't talk past — budget, provenance, look-alike sellers, live page verification.</div>
            <div className="flex gap-3"><FlaskConical size={18} className="text-lime shrink-0" /> Red-team your agent in the Attack Lab and see the gateway stop the attacks.</div>
          </div>
        </div>
        <div className="text-xs text-white/60">PayPal Sandbox · Gemini · Groq · Channel3 · Elastic · KERNEL · AG Grid · Render</div>
      </div>

      <div className="flex items-center justify-center p-8 bg-canvas">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-extrabold">Sign in</h2>
          <p className="text-sm text-ink-muted mt-1">Your PayPal account is your identity — and the only account allowed to fund your mandates.</p>
          {err && <div className="mt-4 rounded-xl bg-rose-50 text-rose-700 text-sm p-3">Sign-in failed: {err}. Check that “Log in with PayPal” is enabled on the app and this return URL is registered: <code className="break-all">{cfg?.redirect_uri}</code></div>}

          {cfg?.paypal_login && (
            <a href={cfg.login_url} className="btn w-full justify-center mt-6 bg-[#FFC439] text-[#003087] hover:brightness-95 !py-3.5 text-base">
              Sign in with <b className="italic">PayPal</b>
            </a>
          )}
          {cfg?.paypal_login && (
            <div className="text-[11px] text-ink-muted mt-1 text-center">
              {cfg.paypal_login_mode === "oidc" ? <>Return URL: {cfg.redirect_uri}</> : "You approve a $1 verification in PayPal that is never charged - it proves which PayPal account is yours."}
            </div>
          )}
          <button onClick={demo} className="btn-dark w-full justify-center mt-3 !py-3.5"><UserRound size={18} /> Continue as demo judge</button>
          <div className="text-[11px] text-ink-muted mt-2 text-center">Demo judge skips PayPal login; your PayPal account is linked the first time you approve a budget hold.</div>

          {(cfg?.demo_buyer_email) && (
            <div className="mt-8 rounded-xl2 border border-lime/60 bg-lime-soft p-4">
              <div className="text-sm font-bold">Judges: PayPal sandbox test buyer</div>
              <div className="text-xs text-ink-muted mb-3">Fake sandbox account, no real money. Use it for “Log in with PayPal” and to approve mandate holds.</div>
              <div className="space-y-2">
                <Copyable label="Email" value={cfg.demo_buyer_email} />
                {cfg.demo_buyer_password && <Copyable label="Password" value={cfg.demo_buyer_password} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

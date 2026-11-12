import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck, ArrowRight, Lock, Bot, Search, MonitorPlay, CreditCard, ShieldX, ShieldAlert, Sparkles, Plug,
  FlaskConical, Database, LayoutDashboard, Workflow, ChevronDown, FileSignature,
} from "lucide-react";
import { api } from "../api";

const STACK = ["PayPal", "Channel3", "KERNEL", "Elastic", "AG Grid", "Render", "Gemini", "Groq", "FastMCP"];

export default function Landing() {
  const [sum, setSum] = useState<any>(null);
  useEffect(() => { api("/public/summary").then(setSum).catch(() => {}); }, []);
  const pct = (v?: number) => (v == null ? "—" : `${Math.round(v * 100)}%`);

  return (
    <div className="h-screen overflow-y-auto snap-y snap-mandatory bg-white text-ink">
      {/* ---------------------------------------------------------------- 1. HERO */}
      <section className="snap-start min-h-screen flex flex-col px-6 md:px-12 pt-6 pb-8">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-lime grid place-items-center text-brand-dark"><ShieldCheck size={20} /></div>
            <span className="font-extrabold text-lg">Mandate</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-ink-muted">
            <a href="#problem" className="hover:text-ink">Why</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <Link to="/lab" className="hover:text-ink">Attack Lab</Link>
            <Link to="/connect" className="hover:text-ink">MCP</Link>
          </div>
          <Link to="/login" className="rounded-full bg-ink text-white text-sm font-semibold px-5 py-2.5 hover:bg-brand-dark">Open the app</Link>
        </nav>

        <div className="text-center mt-10 md:mt-14">
          <div className="inline-flex items-center gap-2 rounded-full bg-lime-soft text-pine text-xs font-semibold px-3 py-1">
            <Sparkles size={12} /> Agentic commerce, with a seatbelt
          </div>
          <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
            Let AI agents spend your money<br />
            <span className="bg-gradient-to-r from-brand to-lime-deep bg-clip-text text-transparent">only the way you said.</span>
          </h1>
          <p className="mt-5 text-ink-muted max-w-2xl mx-auto">
            Mandate turns a plain-English wish into a signed spending policy backed by a PayPal authorization hold,
            and checks every purchase an agent makes - so prompt injection can't talk its way into your wallet.
          </p>
          <div className="mt-7 flex items-center justify-center gap-3">
            <Link to="/login" className="rounded-full bg-ink text-white font-semibold px-6 py-3 inline-flex items-center gap-2 hover:bg-brand-dark">
              Sign in with PayPal <ArrowRight size={16} />
            </Link>
            <a href="#how" className="rounded-full border border-slate-300 font-semibold px-6 py-3 hover:border-ink">See how it works</a>
          </div>
        </div>

        {/* hero card */}
        <div className="relative mt-10 flex-1 min-h-[340px] rounded-[2rem] overflow-hidden bg-gradient-to-br from-lime via-[#E4F7B5] to-[#BFE8D2]">
          <div className="absolute -left-20 -bottom-24 h-80 w-80 rounded-full bg-white/40 blur-2xl" />
          <div className="absolute right-10 -top-16 h-72 w-72 rounded-full bg-pine/20 blur-3xl" />

          {/* center: the mandate */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(420px,86%)] rounded-3xl bg-white/90 backdrop-blur shadow-2xl p-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-bold"><FileSignature size={16} className="text-brand" /> Mandate · signed</span>
              <span className="pill bg-[#FFC439] text-[#003087]">PayPal hold $80</span>
            </div>
            <p className="mt-3 text-[15px] font-medium leading-snug">“Buy one 16kg kettlebell for home workouts. Max $80. Just buy it if it fits.”</p>
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              {[["$80", "budget"], ["× 1", "quantity"], ["7 days", "expires"]].map(([v, l]) => (
                <div key={l} className="rounded-xl bg-canvas py-2"><div className="font-extrabold">{v}</div><div className="text-[10px] text-ink-muted">{l}</div></div>
              ))}
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full w-1/3 rounded-full bg-gradient-to-r from-brand to-lime" /></div>
            <div className="mt-1 text-[11px] text-ink-muted">$25.99 captured · rest of the hold released</div>
          </div>

          {/* floating cards */}
          <Float className="left-[4%] top-[12%]" icon={Search} tone="bg-brand-soft text-brand" title="Channel3 search" body="16kg cast iron kettlebell · filtered to ≤ $80" />
          <Float className="left-[6%] bottom-[12%]" icon={ShieldX} tone="bg-rose-50 text-rose-600" title="BLOCKED" body="basspro-outlet.shop imitates basspro.com" />
          <Float className="right-[5%] top-[14%]" icon={MonitorPlay} tone="bg-slate-100 text-ink" title="KERNEL verified" body="$25.99 seen on the live Newegg page" />
          <Float className="right-[4%] bottom-[14%]" icon={CreditCard} tone="bg-[#FFF4D1] text-[#003087]" title="PayPal capture" body="COMPLETED · $25.99 from the hold" />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-ink-muted font-bold tracking-tight">
          {STACK.map((s) => <span key={s} className="text-sm md:text-base">{s}</span>)}
        </div>
      </section>

      {/* ---------------------------------------------------------------- 2. PROBLEM */}
      <section id="problem" className="snap-start min-h-screen flex flex-col justify-center px-6 md:px-12 py-14 bg-canvas">
        <div className="max-w-6xl mx-auto w-full">
          <div className="label uppercase tracking-widest">The problem</div>
          <h2 className="mt-3 text-3xl md:text-5xl font-extrabold tracking-tight leading-tight max-w-4xl">
            Agents are getting wallets. <span className="text-ink-muted">Nothing checks what they buy.</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-5 mt-10">
            <Card icon={Lock} kicker="AP2 · ACP · Visa · Mastercard" title="Payments are going agentic"
              body="Google's AP2 (PayPal is a launch partner) and OpenAI/Stripe's ACP let agents pay. They define mandate formats - but someone still has to turn a vague wish into an enforceable one." />
            <Card icon={ShieldAlert} kicker="Greshake '23 · CaMeL '25 · AgentDojo" title="Listings can hijack agents"
              body="A shopping agent with a wallet that reads untrusted product pages has the full “lethal trifecta”. One line of seller text can change the address, quantity or store." />
            <Card icon={Bot} kicker="Magentic Marketplace · ACES '25" title="Agents get manipulated anyway"
              body="Microsoft and Columbia/Yale found buyer agents fall for look-alike sellers, first-listed bias and fake urgency - even with no attacker in the loop." />
          </div>
          <div className="mt-10 rounded-3xl bg-ink text-white p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
            <div className="text-2xl md:text-3xl font-extrabold leading-tight flex-1">
              Mandate is the seatbelt: <span className="text-lime">rules the LLM can't argue with</span>, enforced outside the model.
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat v={sum ? pct(sum.lab?.baseline?.asr) : "—"} l="attack success, unprotected" tone="text-rose-300" />
              <Stat v={sum ? pct(sum.lab?.protected?.asr) : "—"} l="attack success, with Mandate" tone="text-lime" />
              <Stat v={sum ? pct(sum.lab?.protected?.detection) : "—"} l="poisoned listings caught" tone="text-lime" />
            </div>
          </div>
        </div>
        <a href="#how" className="mx-auto mt-8 text-ink-muted animate-bounce"><ChevronDown /></a>
      </section>

      {/* ---------------------------------------------------------------- 3. HOW */}
      <section id="how" className="snap-start min-h-screen flex flex-col justify-center px-6 md:px-12 py-14">
        <div className="max-w-6xl mx-auto w-full">
          <div className="label uppercase tracking-widest">How it works</div>
          <h2 className="mt-3 text-3xl md:text-5xl font-extrabold tracking-tight">One mandate. Every purchase checked.</h2>

          <div className="mt-10 grid md:grid-cols-5 gap-3">
            {[
              [FileSignature, "1 · Say it", "Plain English → Gemini compiles a least-privilege policy, HMAC-signed (AP2-style)."],
              [CreditCard, "2 · Fund it", "PayPal AUTHORIZE hold for the budget. Approved once, by your own PayPal account."],
              [Search, "3 · Agent shops", "MCP agent searches Channel3; listings pass a quarantined extractor (CaMeL)."],
              [ShieldCheck, "4 · Gateway checks", "Budget, provenance, look-alike sellers, Elastic threat memory, judge, KERNEL live page."],
              [Workflow, "5 · Pay or ask", "ALLOW → capture from the hold · ESCALATE → you approve · BLOCK → nothing moves."],
            ].map(([I, t, b]: any, i) => (
              <div key={t} className={`rounded-2xl p-4 ${i === 3 ? "bg-brand-dark text-white" : "bg-canvas"}`}>
                <I size={20} className={i === 3 ? "text-lime" : "text-brand"} />
                <div className="font-bold mt-3">{t}</div>
                <div className={`text-xs mt-1 leading-relaxed ${i === 3 ? "text-white/80" : "text-ink-muted"}`}>{b}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid md:grid-cols-4 gap-3">
            <Mini icon={Plug} title="Any agent, via MCP" body="Claude, ChatGPT or Cursor connect to /mcp with a per-user token - same seatbelt." />
            <Mini icon={FlaskConical} title="Attack Lab" body="AgentDojo-style red-team: attack success & utility, with vs without the gateway." />
            <Mini icon={LayoutDashboard} title="Control Tower" body="AG Grid + AG Studio dashboards; built-in agents build views on request." />
            <Mini icon={Database} title="Audit & memory" body="Every decision in Elastic; an Agent Builder auditor answers questions in ES|QL." />
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/login" className="rounded-full bg-ink text-white font-semibold px-6 py-3 inline-flex items-center gap-2 hover:bg-brand-dark">
              Try it - Sign in with PayPal <ArrowRight size={16} />
            </Link>
            <Link to="/lab" className="rounded-full border border-slate-300 font-semibold px-6 py-3 hover:border-ink">Run the Attack Lab</Link>
            <span className="text-xs text-ink-muted ml-2">PayPal sandbox · deployed on Render · open source (MIT)</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function Float({ className, icon: Icon, tone, title, body }: any) {
  return (
    <div className={`absolute hidden md:block w-60 rounded-2xl bg-white shadow-xl p-3 ${className}`}>
      <div className="flex items-center gap-2">
        <span className={`h-7 w-7 rounded-lg grid place-items-center ${tone}`}><Icon size={14} /></span>
        <span className="text-xs font-extrabold">{title}</span>
      </div>
      <div className="text-[11px] text-ink-muted mt-1.5 leading-snug">{body}</div>
    </div>
  );
}

function Card({ icon: Icon, kicker, title, body }: any) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-card">
      <div className="h-10 w-10 rounded-xl bg-lime-soft grid place-items-center text-pine"><Icon size={18} /></div>
      <div className="text-[11px] text-ink-muted font-semibold mt-4">{kicker}</div>
      <div className="text-lg font-extrabold mt-1">{title}</div>
      <p className="text-sm text-ink-muted mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function Stat({ v, l, tone }: any) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-3 min-w-[110px]">
      <div className={`text-3xl font-extrabold ${tone}`}>{v}</div>
      <div className="text-[10px] text-white/70 mt-1 leading-tight">{l}</div>
    </div>
  );
}

function Mini({ icon: Icon, title, body }: any) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 font-bold text-sm"><Icon size={16} className="text-brand" /> {title}</div>
      <div className="text-xs text-ink-muted mt-1.5 leading-relaxed">{body}</div>
    </div>
  );
}

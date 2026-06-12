import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  ChartLine,
  Check,
  Code2,
  DraftingCompass,
  MessageSquare,
  Play,
  Rocket,
  Search,
  ShieldCheck,
  Wrench,
  Zap,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { BrandMark, HelixGlyph } from "@/components/brand";
import { NextLogo, NodeLogo, PrismaLogo, ReactLogo, TsLogo } from "@/components/logos";
import { HELIX_SKILLS } from "@/data/skill-catalog";

export const metadata: Metadata = {
  title: "Helix Studio — The AI coding platform",
  description:
    "A real editor, a repository-aware assistant, and a five-agent review pipeline — from idea to production in one workspace.",
};

/* Fixed dark palette (matches helixstudio-landing.html / the login page) —
 * the marketing surface doesn't follow the in-app theme switcher. */
const C = {
  bg: "#070b12",
  bg2: "#0c0f15",
  panel: "#11151c",
  border: "#1c2230",
  border2: "#283040",
  txt: "#eef0f5",
  txt2: "#a3acbb",
  txt3: "#6a7280",
};

const btnSolid =
  "inline-flex items-center gap-2 rounded-[10px] bg-accent px-[18px] py-[11px] text-sm font-semibold text-white transition hover:-translate-y-px hover:brightness-110";
const btnGhost =
  "inline-flex items-center gap-2 rounded-[10px] border border-[#283040] px-[18px] py-[11px] text-sm font-semibold text-[#a3acbb] transition hover:border-accent hover:text-[#eef0f5]";

const FEATURES = [
  { icon: Code2, title: "Real editor", body: "File tree, tabs, syntax highlighting, and inline diffs — a proper editor, not a textarea." },
  { icon: MessageSquare, title: "Repo-aware chat", body: "The assistant reads your entire codebase, plans before it edits, and shows reviewable diffs." },
  { icon: ChartLine, title: "Repository analysis", body: "Instant map of architecture, dependencies, data flow, and risk — the moment you connect a repo." },
  { icon: Bot, title: "Multi-agent review", body: "Architect, Engineer, Reviewer, Security, and Performance agents — each confirms before acting." },
  { icon: ShieldCheck, title: "24 built-in skills", body: "Opinionated engineering skills — TDD, security hardening, performance, and more — invoked on demand." },
  { icon: Rocket, title: "One-click deploy", body: "Ship to production with build logs, environment status, and rollback — wired to Vercel." },
];

const PIPELINE = [
  { icon: DraftingCompass, name: "Architect", role: "Designs the solution" },
  { icon: Wrench, name: "Engineer", role: "Writes the code" },
  { icon: Search, name: "Reviewer", role: "Finds logic errors" },
  { icon: ShieldCheck, name: "Security", role: "Catches vulnerabilities" },
  { icon: Zap, name: "Performance", role: "Optimizes hot paths" },
];

const PLANS = [
  {
    name: "Hobby",
    price: "$0",
    per: " / mo",
    popular: false,
    cta: "Start free",
    items: ["1 repository", "Editor + repo-aware chat", "All 24 skills", "Community support"],
  },
  {
    name: "Pro",
    price: "$20",
    per: " / mo",
    popular: true,
    cta: "Start Pro trial",
    items: ["Unlimited repositories", "Full multi-agent pipeline", "One-click deploys", "Project memory", "Priority support"],
  },
  {
    name: "Team",
    price: "$60",
    per: " / user",
    popular: false,
    cta: "Contact sales",
    items: ["Everything in Pro", "Shared workspaces + RBAC", "Audit logs", "SSO"],
  },
];

export default async function WelcomePage() {
  const session = await auth();
  const appHref = session?.user ? "/" : "/login";
  const appLabel = session?.user ? "Open Studio" : "Sign in";

  return (
    <div className="min-h-screen overflow-x-hidden font-sans text-[15px] leading-[1.6]" style={{ background: C.bg, color: C.txt }}>
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b backdrop-blur-xl" style={{ borderColor: C.border, background: "rgba(7,11,18,0.8)" }}>
        <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-6 px-6">
          <Link href="/welcome" className="flex items-center gap-2.5 text-base font-bold tracking-tight">
            <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-[9px] shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
              <BrandMark size={32} />
            </span>
            Helix Studio
          </Link>
          <div className="ml-[18px] hidden gap-[26px] text-sm md:flex" style={{ color: C.txt2 }}>
            <a href="#features" className="hover:text-[#eef0f5]">Features</a>
            <a href="#agents" className="hover:text-[#eef0f5]">Agents</a>
            <a href="#skills" className="hover:text-[#eef0f5]">Skills</a>
            <a href="#pricing" className="hover:text-[#eef0f5]">Pricing</a>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <Link href={appHref} className={btnGhost}>{appLabel}</Link>
            <Link href="/build" className={btnSolid}>Start free</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden pb-[70px] pt-[90px] text-center before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(800px_360px_at_50%_-10%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent),radial-gradient(600px_300px_at_85%_10%,color-mix(in_srgb,#8b5cf6_14%,transparent),transparent)]">
        <div className="mx-auto max-w-[1120px] px-6">
          <div className="relative mb-[22px] inline-flex items-center gap-3">
            <span className="h-12 w-12 overflow-hidden rounded-[13px] shadow-[0_8px_26px_rgba(0,0,0,0.55)]">
              <BrandMark size={48} />
            </span>
            <span className="text-left leading-none">
              <span className="block text-xl font-extrabold tracking-tight">HELIX</span>
              <span className="mt-[3px] block text-[10px] font-semibold tracking-[0.32em]" style={{ color: C.txt2 }}>STUDIO</span>
            </span>
          </div>
          <br />
          <span className="relative inline-flex items-center gap-2 rounded-full border px-[13px] py-1.5 text-[12.5px]" style={{ borderColor: C.border2, background: C.panel, color: C.txt2 }}>
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Now in preview · helixstudio.org
          </span>
          <h1 className="relative mx-auto mt-[22px] max-w-[840px] text-[clamp(34px,6vw,60px)] font-bold leading-[1.05] tracking-[-0.03em]">
            The AI coding platform that{" "}
            <span className="bg-gradient-to-r from-accent to-[#a78bfa] bg-clip-text text-transparent">
              plans, builds, and ships
            </span>{" "}
            with you.
          </h1>
          <p className="relative mx-auto mt-5 max-w-[600px] text-[clamp(16px,2.2vw,20px)]" style={{ color: C.txt2 }}>
            A real editor, a repository-aware assistant, and a five-agent review pipeline — so you go from
            idea to production without leaving one workspace.
          </p>
          <div className="relative mt-[30px] flex flex-wrap justify-center gap-3">
            <Link href="/build" className={btnSolid}>
              <ArrowRight className="h-5 w-5" strokeWidth={1.7} />
              Start building free
            </Link>
            <a href="#features" className={btnGhost}>
              <Play className="h-5 w-5" strokeWidth={1.7} />
              See it in action
            </a>
          </div>
          <div className="relative mt-3.5 text-[12.5px]" style={{ color: C.txt3 }}>
            No credit card · works with your GitHub repos
          </div>

          {/* Product shot */}
          <div className="relative mx-auto mt-[46px] max-w-[1000px]">
            <div className="overflow-hidden rounded-2xl border shadow-[0_40px_120px_rgba(0,0,0,0.6)]" style={{ borderColor: C.border2, background: C.bg2 }}>
              <div className="flex h-[38px] items-center gap-[7px] border-b px-3.5" style={{ borderColor: C.border, background: C.panel }}>
                <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f57]" />
                <span className="h-[11px] w-[11px] rounded-full bg-[#febc2e]" />
                <span className="h-[11px] w-[11px] rounded-full bg-[#28c840]" />
                <span className="ml-3.5 font-mono text-[11.5px]" style={{ color: C.txt3 }}>helixstudio.org/acme-web</span>
              </div>
              <div className="grid h-[340px] grid-cols-1 text-xs md:grid-cols-[150px_1fr_230px]">
                <div className="hidden overflow-hidden border-r p-3 text-left md:block" style={{ borderColor: C.border, background: C.bg2, color: C.txt3 }}>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.08em]">Explorer</div>
                  <div className="rounded-[5px] px-1.5 py-1" style={{ color: C.txt2 }}>app/</div>
                  <div className="rounded-[5px] py-1 pl-4" style={{ color: C.txt2 }}>api/</div>
                  <div className="rounded-[5px] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] py-1 pl-[26px] text-[#eef0f5]">invites.ts</div>
                  <div className="rounded-[5px] py-1 pl-[26px]" style={{ color: C.txt2 }}>orders.ts</div>
                  <div className="rounded-[5px] py-1 pl-4" style={{ color: C.txt2 }}>components/</div>
                  <div className="rounded-[5px] py-1 pl-[26px]" style={{ color: C.txt2 }}>DataTable.tsx</div>
                  <div className="rounded-[5px] px-1.5 py-1" style={{ color: C.txt2 }}>prisma/</div>
                </div>
                <div className="overflow-hidden bg-[#0a0c10] p-3 text-left font-mono leading-[1.75]" style={{ color: C.txt2 }}>
                  <div><span className="tok-cm">{"// Team invitations"}</span></div>
                  <div><span className="tok-k">export async function</span> <span className="tok-f">createInvite</span>(</div>
                  <div>&nbsp;&nbsp;orgId, email) {"{"}</div>
                  <div>&nbsp;&nbsp;<span className="tok-k">const</span> code = <span className="tok-f">randomCode</span>(<span className="tok-s">8</span>)</div>
                  <div>&nbsp;&nbsp;<span className="tok-k">await</span> prisma.invite.<span className="tok-f">create</span>({"{"}</div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;data: {"{ orgId, email, code }"}</div>
                  <div>&nbsp;&nbsp;{"})"}</div>
                  <div>&nbsp;&nbsp;<span className="tok-k">await</span> <span className="tok-f">sendInviteEmail</span>(email, code)</div>
                  <div>{"}"}</div>
                </div>
                <div className="hidden overflow-hidden border-l p-3 text-left md:block" style={{ borderColor: C.border, background: C.bg2 }}>
                  <div className="mb-2 flex items-center gap-[7px] text-[11px]" style={{ color: C.txt3 }}>
                    <span className="text-accent"><HelixGlyph size={13} className="[&_path]:stroke-current" /></span>
                    Helix · plan
                  </div>
                  <div className="rounded-[9px] border p-[9px] text-[11.5px]" style={{ borderColor: C.border, background: C.panel, color: C.txt2 }}>
                    Added <b className="text-[#eef0f5]">Invite</b> model, wrote <b className="text-[#eef0f5]">createInvite</b>, and queued the
                    Security agent. Confirm before I run the migration?
                  </div>
                  <div className="mt-2.5 flex gap-1.5">
                    <span className="rounded-md border px-[9px] py-1 text-[10.5px] text-ok" style={{ borderColor: C.border2 }}>Accept</span>
                    <span className="rounded-md border px-[9px] py-1 text-[10.5px]" style={{ borderColor: C.border2, color: C.txt3 }}>Reject</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Stack strip */}
      <div className="mx-auto max-w-[1120px] px-6 pb-2.5 pt-10 text-center">
        <div className="text-xs uppercase tracking-[0.1em]" style={{ color: C.txt3 }}>Built on a stack you already trust</div>
        <div className="mt-[18px] flex flex-wrap items-center justify-center gap-[30px] opacity-85">
          {[
            { logo: <TsLogo size={20} />, label: "TypeScript" },
            { logo: <NextLogo size={18} />, label: "Next.js" },
            { logo: <ReactLogo size={22} />, label: "React" },
            { logo: <NodeLogo size={20} />, label: "Node" },
            { logo: <PrismaLogo size={16} />, label: "Prisma" },
          ].map((t) => (
            <span key={t.label} className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: C.txt2 }}>
              {t.logo}
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* Features */}
      <section className="py-[70px]" id="features">
        <div className="mx-auto max-w-[1120px] px-6">
          <div className="mx-auto mb-11 max-w-[640px] text-center">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Everything in one workspace</span>
            <h2 className="mt-2.5 text-[clamp(26px,4vw,38px)] font-bold tracking-tight">A complete environment, not a chat box.</h2>
            <p className="mt-3 text-base" style={{ color: C.txt2 }}>
              Helix understands your whole repository and gives you the tools to act on it — edit, analyze,
              review, and deploy.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-[14px] border p-[22px] transition-all duration-150 hover:-translate-y-0.5 hover:border-accent" style={{ borderColor: C.border, background: C.panel }}>
                <div className="mb-3.5 grid h-10 w-10 place-items-center rounded-[11px] bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] text-accent">
                  <f.icon className="h-5 w-5" strokeWidth={1.7} />
                </div>
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-[13.5px]" style={{ color: C.txt2 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agents */}
      <section className="border-y py-[70px]" id="agents" style={{ borderColor: C.border, background: C.bg2 }}>
        <div className="mx-auto max-w-[1120px] px-6">
          <div className="mx-auto mb-11 max-w-[640px] text-center">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Multi-agent workflow</span>
            <h2 className="mt-2.5 text-[clamp(26px,4vw,38px)] font-bold tracking-tight">Every change reviewed by five specialists.</h2>
            <p className="mt-3 text-base" style={{ color: C.txt2 }}>
              Helix runs each task through a pipeline that catches bugs, vulnerabilities, and slow paths
              before you ship.
            </p>
          </div>
          <div className="mx-auto flex max-w-[920px] flex-wrap items-stretch overflow-hidden rounded-[14px] border md:flex-nowrap" style={{ borderColor: C.border, background: C.panel }}>
            {PIPELINE.map((step, i) => (
              <div
                key={step.name}
                className={`flex-[1_1_40%] px-3.5 py-[22px] text-center md:flex-1 ${i < PIPELINE.length - 1 ? "md:border-r" : ""} max-md:border-b`}
                style={{ borderColor: C.border }}
              >
                <div className="mx-auto mb-[11px] grid h-[38px] w-[38px] place-items-center rounded-[11px] bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] text-accent">
                  <step.icon className="h-5 w-5" strokeWidth={1.7} />
                </div>
                <div className="text-[13.5px] font-semibold">{step.name}</div>
                <div className="mt-[3px] text-[11.5px]" style={{ color: C.txt3 }}>{step.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Skills */}
      <section className="py-[70px]" id="skills">
        <div className="mx-auto max-w-[1120px] px-6">
          <div className="mx-auto mb-11 max-w-[640px] text-center">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-accent">24 skills, loaded on demand</span>
            <h2 className="mt-2.5 text-[clamp(26px,4vw,38px)] font-bold tracking-tight">Senior-engineer instincts, built in.</h2>
            <p className="mt-3 text-base" style={{ color: C.txt2 }}>
              Helix invokes the right skill for the moment — from spec-driven planning to security hardening.
            </p>
          </div>
          <div className="mx-auto flex max-w-[860px] flex-wrap justify-center gap-[9px]">
            {HELIX_SKILLS.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-2 rounded-full border px-[13px] py-2 text-[13px] transition-colors hover:border-accent hover:text-[#eef0f5]"
                style={{ borderColor: C.border2, background: C.panel, color: C.txt2 }}
              >
                <span className="rounded-[5px] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-[5px] py-0.5 font-mono text-[10px] font-bold text-accent">
                  {s.code}
                </span>
                {s.name.replace(/-and-.*$/, "").replace(/-development$/, "").replace(/-with-devtools$/, "")}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-y py-[70px]" id="pricing" style={{ borderColor: C.border, background: C.bg2 }}>
        <div className="mx-auto max-w-[1120px] px-6">
          <div className="mx-auto mb-11 max-w-[640px] text-center">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Pricing</span>
            <h2 className="mt-2.5 text-[clamp(26px,4vw,38px)] font-bold tracking-tight">Start free. Scale when you ship.</h2>
            <p className="mt-3 text-base" style={{ color: C.txt2 }}>
              Every plan includes the editor, repo-aware chat, and all 24 skills.
            </p>
          </div>
          <div className="mx-auto grid max-w-[960px] grid-cols-1 gap-4 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-[26px] ${
                  plan.popular ? "border-accent shadow-[0_0_0_1px_var(--accent),0_20px_60px_color-mix(in_srgb,var(--accent)_16%,transparent)]" : ""
                }`}
                style={{ background: C.panel, borderColor: plan.popular ? undefined : C.border }}
              >
                {plan.popular && (
                  <span className="absolute -top-[11px] left-1/2 -translate-x-1/2 rounded-full bg-accent px-[11px] py-[3px] text-[11px] font-bold text-white">
                    Most popular
                  </span>
                )}
                <div className="text-sm font-semibold" style={{ color: C.txt2 }}>{plan.name}</div>
                <div className="my-2 text-[38px] font-bold tracking-tight">
                  {plan.price}
                  <span className="text-sm font-medium" style={{ color: C.txt3 }}>{plan.per}</span>
                </div>
                <ul className="my-4 flex flex-1 flex-col gap-[9px]">
                  {plan.items.map((item) => (
                    <li key={item} className="flex gap-[9px] text-[13.5px]" style={{ color: C.txt2 }}>
                      <Check className="mt-[3px] h-4 w-4 shrink-0 text-ok" strokeWidth={1.7} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/login" className={`${plan.popular ? btnSolid : btnGhost} justify-center`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-[70px]">
        <div className="mx-auto max-w-[1120px] rounded-[22px] border px-6 py-[70px] text-center" style={{ borderColor: C.border2, background: `radial-gradient(700px 240px at 50% 0, color-mix(in srgb, var(--accent) 18%, transparent), transparent), ${C.panel}` }}>
          <h2 className="text-[clamp(26px,4vw,38px)] font-bold tracking-tight">Ship your next feature with Helix.</h2>
          <p className="mt-3" style={{ color: C.txt2 }}>Connect a repo and let the agents handle the rest.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/build" className={btnSolid}>Start building free</Link>
            <Link href="/login" className={btnGhost}>Book a demo</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-[70px] border-t py-10" style={{ borderColor: C.border }}>
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-[18px] px-6 text-[13px]" style={{ color: C.txt3 }}>
          <Link href="/welcome" className="flex items-center gap-2 text-sm font-bold" style={{ color: C.txt2 }}>
            <span className="grid h-[26px] w-[26px] place-items-center overflow-hidden rounded-md">
              <BrandMark size={26} />
            </span>
            Helix Studio
          </Link>
          <span>© 2026 Helix Studio · helixstudio.org</span>
          <div className="ml-auto flex gap-5">
            <a href="#features" className="hover:text-[#eef0f5]">Features</a>
            <a href="#pricing" className="hover:text-[#eef0f5]">Pricing</a>
            <a href="https://github.com/durga710/helixstudio" className="hover:text-[#eef0f5]">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

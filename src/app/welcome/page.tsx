import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Play, Sparkles, Star } from "lucide-react";
import { auth } from "@/lib/auth";
import { BrandMark } from "@/components/brand";
import { NextLogo, NodeLogo, PrismaLogo, ReactLogo, TsLogo } from "@/components/logos";
import { Reveal } from "@/components/marketing/Reveal";
import { HeroDemo } from "@/components/marketing/HeroDemo";
import { WorkflowSection } from "@/components/marketing/WorkflowSection";
import { AgentsSection } from "@/components/marketing/AgentsSection";
import { RepoIntelligenceSection } from "@/components/marketing/RepoIntelligenceSection";
import { DeploymentsSection } from "@/components/marketing/DeploymentsSection";
import { ComparisonSection } from "@/components/marketing/ComparisonSection";
import { TestimonialsSection } from "@/components/marketing/TestimonialsSection";

export const metadata: Metadata = {
  title: "Helix Studio — The AI Operating System for Software Engineering",
  description:
    "Plan, build, review, deploy, and scale software with a team of AI engineering agents working directly inside your codebase. From idea to production without leaving your workspace.",
};

const btnSolid =
  "inline-flex items-center justify-center gap-2 rounded-[11px] bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-px hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-[11px] border border-border2 px-5 py-3 text-sm font-semibold text-txt2 transition hover:border-accent hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

const NAV = [
  { href: "#workflow", label: "Workflow" },
  { href: "#agents", label: "Agents" },
  { href: "#repo", label: "Intelligence" },
  { href: "#compare", label: "Compare" },
  { href: "#pricing", label: "Pricing" },
];

const STACK = [
  { logo: <TsLogo size={18} />, label: "TypeScript" },
  { logo: <NextLogo size={16} />, label: "Next.js" },
  { logo: <ReactLogo size={20} />, label: "React" },
  { logo: <NodeLogo size={18} />, label: "Node" },
  { logo: <PrismaLogo size={15} />, label: "Prisma" },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    per: " / mo",
    popular: false,
    cta: "Start free",
    items: ["Gunner 1.0 & Gunner Max models — free", "1 repository", "Editor + repo-aware chat", "All 24 skills", "100k tokens / mo · no card"],
  },
  {
    name: "Pro",
    price: "$20",
    per: " / mo",
    popular: true,
    cta: "Start Pro trial",
    items: ["Helix 1.0 & 2.0 — premium models", "Turbo parallel build engine", "Unlimited repositories", "Full multi-agent pipeline + deploys", "25M tokens / mo", "Project memory"],
  },
  {
    name: "Team",
    price: "$99",
    per: " / mo",
    popular: false,
    cta: "Contact sales",
    items: ["Everything in Pro", "Helix priority + 100M tokens / mo", "Shared workspaces + RBAC", "Audit logs", "SSO"],
  },
];

export default async function WelcomePage() {
  const session = await auth();
  const appHref = session?.user ? "/" : "/login";
  const appLabel = session?.user ? "Open Studio" : "Sign in";

  return (
    <div className="helix-marketing min-h-screen overflow-x-hidden bg-bg font-sans text-[15px] leading-[1.6] text-txt">
      {/* ---------- Nav ---------- */}
      <nav className="sticky top-0 z-50 border-b border-border/80 backdrop-blur-xl" style={{ background: "color-mix(in srgb, var(--bg) 80%, transparent)" }}>
        <div className="mx-auto flex h-16 max-w-[1160px] items-center gap-6 px-6">
          <Link href="/welcome" className="flex items-center gap-2.5 text-base font-bold tracking-tight text-txt">
            <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-[9px] shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
              <BrandMark size={32} />
            </span>
            Helix Studio
          </Link>
          <div className="ml-4 hidden gap-7 text-sm text-txt2 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition-colors hover:text-txt">
                {n.label}
              </a>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <Link href={appHref} className={btnGhost + " hidden sm:inline-flex"}>{appLabel}</Link>
            <Link href="/build" className={btnSolid}>Start free</Link>
          </div>
        </div>
      </nav>

      {/* ---------- Section 1 — Hero ---------- */}
      <header className="relative overflow-hidden">
        <div aria-hidden className="helix-aurora pointer-events-none absolute inset-0 -z-10" />
        <div aria-hidden className="helix-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px]" />
        <div className="mx-auto grid max-w-[1160px] grid-cols-1 items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pt-24">
          {/* Left — copy */}
          <div className="text-center lg:text-left">
            <Reveal from="up">
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3.5 py-1.5 text-[12.5px] font-medium text-accent">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                New — Helix 1.0 &amp; Helix 2.0, our fastest coding models yet
              </span>
            </Reveal>

            <Reveal from="up" delay={0.05}>
              <h1 className="mt-5 text-[clamp(38px,6.4vw,66px)] font-bold leading-[1.02] tracking-[-0.035em]">
                Frontier code.
                <br />
                A fraction of
                <br />
                the{" "}
                <span className="bg-gradient-to-r from-accent to-[#a78bfa] bg-clip-text text-transparent">price.</span>
              </h1>
            </Reveal>

            <Reveal from="up" delay={0.1}>
              <p className="mx-auto mt-5 max-w-[545px] text-[clamp(16px,2.2vw,19px)] text-txt2 lg:mx-0">
                Meet <strong className="font-semibold text-txt">Helix 1.0 &amp; 2.0</strong> — coding models that match the
                frontier on quality and beat it on speed and cost. Our build engine spends up to{" "}
                <strong className="font-semibold text-txt">10× fewer tokens</strong>, so every app ships for cents, not dollars.
              </p>
            </Reveal>

            <Reveal from="up" delay={0.15}>
              <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
                <Link href="/build" className={btnSolid}>
                  <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.9} />
                  Start Building Free
                </Link>
                <a href="#demo" className={btnGhost}>
                  <Play className="h-[18px] w-[18px]" strokeWidth={1.9} />
                  Watch Demo
                </a>
              </div>
            </Reveal>

            {/* Proof stats */}
            <Reveal from="up" delay={0.18}>
              <div className="mt-8 grid max-w-[540px] grid-cols-3 gap-2.5 lg:mx-0">
                {[
                  { big: "10×", small: "fewer tokens / build" },
                  { big: "Parallel", small: "build engine" },
                  { big: "$0", small: "free tier — no card" },
                ].map((s) => (
                  <div key={s.small} className="rounded-xl border border-border2 bg-panel/60 px-3 py-2.5 text-center lg:text-left">
                    <div className="text-[19px] font-bold tracking-tight text-accent">{s.big}</div>
                    <div className="text-[11.5px] leading-tight text-txt3">{s.small}</div>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* Social proof */}
            <Reveal from="up" delay={0.24}>
              <div className="mt-6 flex flex-col items-center gap-3 text-[12.5px] text-txt3 sm:flex-row lg:items-center lg:justify-start">
                <span className="flex items-center gap-1 text-accent" aria-label="Rated 5 out of 5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-current" strokeWidth={0} aria-hidden />
                  ))}
                </span>
                <span>Loved by early builders · no credit card · works with your GitHub repos</span>
              </div>
            </Reveal>
          </div>

          {/* Right — interactive demo */}
          <div id="demo" className="scroll-mt-20">
            <HeroDemo className="lg:pl-4" />
          </div>
        </div>

        {/* Stack strip */}
        <div className="mx-auto max-w-[1160px] px-6 pb-10">
          <Reveal>
            <div className="text-center text-xs uppercase tracking-[0.12em] text-txt3">Built on a stack you already trust</div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-9 gap-y-4 opacity-85">
              {STACK.map((t) => (
                <span key={t.label} className="flex items-center gap-2 text-[13.5px] font-semibold text-txt2">
                  {t.logo}
                  {t.label}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </header>

      {/* ---------- Sections 2–7 ---------- */}
      <WorkflowSection />
      <AgentsSection />
      <RepoIntelligenceSection />
      <DeploymentsSection />
      <ComparisonSection />
      <TestimonialsSection />

      {/* ---------- Section 8 — Pricing ---------- */}
      <section id="pricing" className="py-[84px]">
        <div className="mx-auto max-w-[1120px] px-6">
          <Reveal className="mx-auto mb-12 max-w-[640px] text-center">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Pricing</span>
            <h2 className="mt-2.5 text-[clamp(26px,4vw,40px)] font-bold tracking-tight text-txt">Start free. Upgrade to ship faster.</h2>
            <p className="mt-3 text-base text-txt2">Build free on Gunner, no card required. Step up to Helix 1.0 &amp; 2.0 — frontier quality, a fraction of the cost — the moment you&apos;re ready to scale.</p>
          </Reveal>
          <div className="mx-auto grid max-w-[980px] grid-cols-1 gap-4 md:grid-cols-3">
            {PLANS.map((plan, i) => (
              <Reveal as="div" key={plan.name} delay={i * 0.06}>
                <div
                  className={`relative flex h-full flex-col rounded-2xl border p-7 ${
                    plan.popular
                      ? "border-accent shadow-[0_0_0_1px_var(--accent),0_20px_60px_color-mix(in_srgb,var(--accent)_16%,transparent)]"
                      : "border-border"
                  } bg-panel`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-white">
                      Most popular
                    </span>
                  )}
                  <div className="text-sm font-semibold text-txt2">{plan.name}</div>
                  <div className="my-2 text-[38px] font-bold tracking-tight text-txt">
                    {plan.price}
                    <span className="text-sm font-medium text-txt3">{plan.per}</span>
                  </div>
                  <ul className="my-4 flex flex-1 flex-col gap-2.5">
                    {plan.items.map((item) => (
                      <li key={item} className="flex gap-2.5 text-[13.5px] text-txt2">
                        <Check className="mt-[3px] h-4 w-4 shrink-0 text-ok" strokeWidth={2} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link href="/login" className={`${plan.popular ? btnSolid : btnGhost} w-full`}>
                    {plan.cta}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Section 9 — Final CTA ---------- */}
      <section className="px-6 pb-[84px]">
        <div className="relative mx-auto max-w-[1120px] overflow-hidden rounded-[24px] border border-border2 px-6 py-[76px] text-center">
          <div aria-hidden className="helix-aurora pointer-events-none absolute inset-0 opacity-90" />
          <div className="relative">
            <Reveal>
              <h2 className="text-[clamp(28px,4.4vw,46px)] font-bold leading-[1.08] tracking-tight text-txt">
                Ship frontier code.
                <br />
                For a fraction of the price.
              </h2>
            </Reveal>
            <Reveal delay={0.05}>
              <p className="mx-auto mt-4 max-w-[520px] text-base text-txt2">
                Start free on Gunner — no card. Step up to Helix 1.0 &amp; 2.0 the moment you want to move faster.
                Connect a repo and let the agents ship it.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/build" className={btnSolid}>
                  <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.9} />
                  Start Building Free
                </Link>
                <Link href={appHref} className={btnGhost}>{appLabel}</Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-5 px-6 text-[13px] text-txt3">
          <Link href="/welcome" className="flex items-center gap-2 text-sm font-bold text-txt2">
            <span className="grid h-[26px] w-[26px] place-items-center overflow-hidden rounded-md">
              <BrandMark size={26} />
            </span>
            Helix Studio
          </Link>
          <span>© 2026 Helix Studio · helixstudio.org</span>
          <div className="ml-auto flex flex-wrap gap-5">
            <a href="#workflow" className="hover:text-txt">Workflow</a>
            <a href="#pricing" className="hover:text-txt">Pricing</a>
            <Link href="/terms" className="hover:text-txt">Terms</Link>
            <Link href="/privacy" className="hover:text-txt">Privacy</Link>
            <a href="https://github.com/durga710/helixstudio" className="hover:text-txt">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

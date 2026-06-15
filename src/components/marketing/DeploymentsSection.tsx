"use client";

import { Activity, PackageCheck, Radar, Rocket, ShieldCheck } from "lucide-react";
import { WorkflowTimeline, type TimelineStep } from "@/components/demo/WorkflowTimeline";
import { Reveal } from "./Reveal";

const STEPS: TimelineStep[] = [
  { label: "Build", sub: "Compile & bundle", icon: PackageCheck },
  { label: "Test", sub: "Unit + e2e", icon: Activity },
  { label: "Security Scan", sub: "SAST + deps", icon: ShieldCheck },
  { label: "Deploy", sub: "Edge rollout", icon: Rocket },
  { label: "Monitor", sub: "Logs & alerts", icon: Radar },
];

const LOG = [
  "Building app/dashboard… done in 4.2s",
  "Running 28 tests… 28 passed",
  "Scanning dependencies… 0 advisories",
  "Uploading to edge network…",
  "Deployed → acme-web.helixstudio.app",
];

export function DeploymentsSection() {
  return (
    <section id="deployments" className="border-y border-border bg-bg2 py-[84px]">
      <div className="mx-auto max-w-[1120px] px-6">
        <Reveal className="mx-auto mb-12 max-w-[640px] text-center">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Ship with confidence</span>
          <h2 className="mt-2.5 text-[clamp(26px,4vw,40px)] font-bold tracking-tight text-txt">
            From green build to live URL — automatically.
          </h2>
          <p className="mt-3 text-base text-txt2">
            Helix builds, tests, scans, and deploys to a real edge runtime, then watches it in production.
          </p>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="rounded-2xl border border-border bg-panel/40 px-6 py-9 sm:px-10">
            <WorkflowTimeline steps={STEPS} cadence={1000} />
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mx-auto mt-5 max-w-[760px] overflow-hidden rounded-xl border border-border bg-[var(--code-bg)]">
            <div className="flex items-center gap-2 border-b border-border bg-panel px-4 py-2.5">
              <Rocket className="h-3.5 w-3.5 text-accent" />
              <span className="font-mono text-[11.5px] text-txt3">deploy · production</span>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--green)_40%,transparent)] px-2 py-0.5 text-[10.5px] font-medium text-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Ready
              </span>
            </div>
            <div className="px-4 py-3 font-mono text-[12px] leading-[1.85] text-txt2">
              {LOG.map((line) => (
                <div key={line} className="flex gap-2">
                  <span className="text-ok">✓</span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

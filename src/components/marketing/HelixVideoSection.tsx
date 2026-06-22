import Link from "next/link";
import { Film, Sparkles, Wand2, Download } from "lucide-react";
import { Reveal } from "./Reveal";

const STEPS = [
  { icon: Wand2, label: "Describe the shot" },
  { icon: Sparkles, label: "HelixVideo renders it" },
  { icon: Download, label: "Download the MP4" },
];

export function HelixVideoSection() {
  return (
    <section id="video" className="py-[84px]">
      <div className="mx-auto max-w-[1120px] px-6">
        <div className="relative overflow-hidden rounded-[24px] border border-border2 bg-panel/60 p-8 sm:p-12">
          <div aria-hidden className="helix-aurora pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            {/* Copy */}
            <Reveal from="up">
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3.5 py-1.5 text-[12.5px] font-medium text-accent">
                <Film className="h-3.5 w-3.5" /> New · HelixVideo
              </span>
              <h2 className="mt-4 text-[clamp(26px,4vw,40px)] font-bold leading-[1.08] tracking-tight text-txt">
                Ship the app <span className="text-txt2">and</span> the trailer.
              </h2>
              <p className="mt-3 max-w-[480px] text-base text-txt2">
                Turn a single prompt into a cinematic clip — product demos, hero loops, social cuts. Generated right in
                Helix, white-labeled, yours to download. Included with every premium plan.
              </p>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2.5">
                {STEPS.map((s) => (
                  <li key={s.label} className="flex items-center gap-2 text-[13.5px] text-txt2">
                    <s.icon className="h-4 w-4 text-accent" strokeWidth={2} />
                    {s.label}
                  </li>
                ))}
              </ul>
              <Link
                href="/video"
                className="mt-7 inline-flex items-center gap-2 rounded-[11px] bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-px hover:brightness-110"
              >
                <Film className="h-[18px] w-[18px]" strokeWidth={1.9} />
                Try HelixVideo
              </Link>
            </Reveal>

            {/* Visual — a stylized film frame */}
            <Reveal from="up" delay={0.08}>
              <div className="relative mx-auto aspect-video w-full max-w-[420px] overflow-hidden rounded-2xl border border-border2 bg-gradient-to-br from-[#0d1626] to-[#1a2740] shadow-pop">
                <div aria-hidden className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-[#a78bfa]/10" />
                <div className="absolute inset-0 grid place-items-center">
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-white/10 backdrop-blur">
                    <Film className="h-7 w-7 text-white" strokeWidth={1.8} />
                  </span>
                </div>
                {/* faux timeline */}
                <div className="absolute inset-x-4 bottom-4 flex items-center gap-2">
                  <div className="h-1 flex-1 rounded-full bg-white/15">
                    <div className="h-full w-2/3 rounded-full bg-accent" />
                  </div>
                  <span className="text-[10px] font-medium text-white/70">0:04</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

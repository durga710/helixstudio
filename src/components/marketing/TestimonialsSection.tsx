import { Star } from "lucide-react";
import { Reveal } from "./Reveal";

// Illustrative quotes for the preview launch — representative personas, not
// real endorsements.
const TESTIMONIALS = [
  {
    quote: "It felt like adding five senior engineers overnight. The review pipeline caught a race condition I would have shipped.",
    name: "Maya Chen",
    role: "Founder, Larkfield",
    initials: "MC",
  },
  {
    quote: "The intent ledger is the killer feature. I can finally answer 'why does this line exist?' six months later.",
    name: "Daniel Ortiz",
    role: "Staff Engineer, Northwind",
    initials: "DO",
  },
  {
    quote: "We went from prototype to a deployed dashboard in an afternoon — security scan and all.",
    name: "Priya Nair",
    role: "CTO, Tessellate",
    initials: "PN",
  },
  {
    quote: "Helix reads our monorepo better than half the team. Onboarding new features got dramatically faster.",
    name: "Sam Whitfield",
    role: "Eng Lead, Cobalt",
    initials: "SW",
  },
  {
    quote: "The undo-an-idea flow saved a release. We pulled a feature cleanly without unpicking three days of work.",
    name: "Lena Fischer",
    role: "Product Engineer, Hatch",
    initials: "LF",
  },
  {
    quote: "It's the first AI tool that feels like a real workspace instead of a chat box bolted onto my editor.",
    name: "Arjun Rao",
    role: "Solo dev, shipping daily",
    initials: "AR",
  },
];

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="border-y border-border bg-bg2 py-[84px]">
      <div className="mx-auto max-w-[1120px] px-6">
        <Reveal className="mx-auto mb-12 max-w-[640px] text-center">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Loved by builders</span>
          <h2 className="mt-2.5 text-[clamp(26px,4vw,40px)] font-bold tracking-tight text-txt">
            Teams ship more, with fewer surprises.
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal as="div" key={t.name} delay={(i % 3) * 0.06}>
              <figure className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-panel p-6 transition-all duration-200 hover:-translate-y-1 hover:border-accent">
                <div className="flex gap-0.5 text-accent" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="h-3.5 w-3.5 fill-current" strokeWidth={0} aria-hidden />
                  ))}
                </div>
                <blockquote className="flex-1 text-[14px] leading-[1.6] text-txt">“{t.quote}”</blockquote>
                <figcaption className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[12px] font-bold text-accent">
                    {t.initials}
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold text-txt">{t.name}</span>
                    <span className="block text-[11.5px] text-txt3">{t.role}</span>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

import { Check, Minus, X } from "lucide-react";
import { Reveal } from "./Reveal";

type Cell = "yes" | "partial" | "no";

const COLUMNS = ["Helix Studio", "Cursor", "Copilot", "Claude Code"] as const;

const ROWS: { feature: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  { feature: "Repository-aware editing", cells: ["yes", "yes", "partial", "yes"] },
  { feature: "Multi-agent review pipeline", cells: ["yes", "no", "no", "partial"] },
  { feature: "Built-in security audit", cells: ["yes", "no", "partial", "partial"] },
  { feature: "One-click deploy", cells: ["yes", "no", "no", "no"] },
  { feature: "Live preview runtime", cells: ["yes", "partial", "no", "no"] },
  { feature: "Line-by-line intent ledger", cells: ["yes", "no", "no", "no"] },
  { feature: "Project memory", cells: ["yes", "partial", "no", "partial"] },
  { feature: "Runs in the browser", cells: ["yes", "no", "partial", "no"] },
];

function CellMark({ value }: { value: Cell }) {
  if (value === "yes") return <Check className="mx-auto h-[18px] w-[18px] text-ok" strokeWidth={2.4} aria-label="Yes" />;
  if (value === "partial") return <Minus className="mx-auto h-[18px] w-[18px] text-warn" strokeWidth={2.4} aria-label="Partial" />;
  return <X className="mx-auto h-[18px] w-[18px] text-txt3" strokeWidth={2} aria-label="No" />;
}

export function ComparisonSection() {
  return (
    <section id="compare" className="py-[84px]">
      <div className="mx-auto max-w-[1120px] px-6">
        <Reveal className="mx-auto mb-12 max-w-[640px] text-center">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-accent">How Helix compares</span>
          <h2 className="mt-2.5 text-[clamp(26px,4vw,40px)] font-bold tracking-tight text-txt">
            An operating system, not an autocomplete.
          </h2>
          <p className="mt-3 text-base text-txt2">
            Editors and copilots help you type. Helix plans, builds, reviews, secures, and ships the whole change.
          </p>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="overflow-x-auto rounded-2xl border border-border bg-panel/40">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <caption className="sr-only">Feature comparison of Helix Studio, Cursor, Copilot, and Claude Code</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-4 text-[13px] font-semibold text-txt2">Capability</th>
                  {COLUMNS.map((col, i) => (
                    <th
                      key={col}
                      scope="col"
                      className={`px-4 py-4 text-center text-[13px] font-bold ${
                        i === 0 ? "rounded-t-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent" : "text-txt2"
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.feature} className="border-b border-border last:border-0">
                    <th scope="row" className="px-5 py-3.5 text-[13.5px] font-medium text-txt">{row.feature}</th>
                    {row.cells.map((cell, i) => (
                      <td
                        key={COLUMNS[i]}
                        className={`px-4 py-3.5 text-center ${i === 0 ? "bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]" : ""}`}
                      >
                        <CellMark value={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
        <p className="mt-4 text-center text-[12px] text-txt3">
          Comparison reflects typical configurations as of 2026. Competitor capabilities evolve — check current docs.
        </p>
      </div>
    </section>
  );
}

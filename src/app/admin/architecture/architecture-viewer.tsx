"use client";

import { useState } from "react";
import { Markdown } from "@/components/ui/markdown";
import type { ArchitectureDoc } from "@/lib/architecture-docs";
import { cn } from "@/lib/utils";

/**
 * Admin architecture viewer: a sidebar of bundled docs + a pane that renders
 * the selected one — self-contained HTML diagrams in a sandboxed iframe,
 * markdown via the shared lightweight renderer. Content is regenerated from the
 * repo on every deploy (scripts/gen-docs.mjs), so it always matches the source.
 */
export function ArchitectureViewer({ docs }: { docs: ArchitectureDoc[] }) {
  const [active, setActive] = useState(0);
  const doc = docs[active];

  if (!doc) {
    return (
      <p className="text-[13px] text-txt3">
        No docs yet — add a <code>.md</code> or <code>.html</code> under <code>docs/architecture</code> or{" "}
        <code>docs/diagrams</code>, then redeploy.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[250px_1fr]">
      <nav className="space-y-1">
        {docs.map((d, i) => (
          <button
            key={d.slug}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              "block w-full truncate rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors",
              i === active
                ? "border-accent bg-hl text-txt"
                : "border-border2 bg-panel2 text-txt2 hover:border-accent hover:text-txt",
            )}
            title={d.title}
          >
            <span className="mr-1.5 rounded bg-panel px-1 text-[9px] uppercase tracking-wide text-txt3">{d.type}</span>
            {d.title}
          </button>
        ))}
      </nav>

      <div className="min-w-0 overflow-hidden rounded-card-lg border border-border bg-panel">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-[11px] text-txt3">
          <span className="truncate font-mono">{doc.source}</span>
        </div>
        {doc.type === "html" ? (
          <iframe
            title={doc.title}
            sandbox="allow-scripts allow-same-origin"
            srcDoc={doc.content}
            className="h-[72vh] w-full bg-white"
          />
        ) : (
          <div className="scroll-area max-h-[72vh] overflow-auto px-5 py-4 text-[13px] leading-relaxed text-txt2">
            <Markdown content={doc.content} />
          </div>
        )}
      </div>
    </div>
  );
}

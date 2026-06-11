"use client";

import { GitBranch, Zap } from "lucide-react";
import { tokenizeLine } from "@/lib/highlight";
import type { SourceFile } from "@/lib/types";
import { cn } from "@/lib/utils";

/* Diff decorations for the sample workspace — line numbers with added (+)
 * or highlighted treatment, keyed by path. */
const DECORATIONS: Record<string, { add?: number[]; hl?: number[] }> = {
  "app/api/invites.ts": { add: [6, 7, 8, 9, 10], hl: [11] },
  "app/api/orders.ts": { hl: [7] },
  "app/components/DataTable.tsx": { hl: [6] },
};

export function CodeView({ file }: { file: SourceFile | null }) {
  if (!file) {
    return (
      <div className="flex flex-1 items-center justify-center bg-codebg text-[13px] text-txt3">
        No file open — pick one from the explorer.
      </div>
    );
  }

  const deco = DECORATIONS[file.path] ?? {};
  const lines = file.content.replace(/\n$/, "").split("\n");

  return (
    <div className="code-font scroll-area flex-1 overflow-auto bg-codebg py-3.5 font-mono leading-[1.7]">
      {lines.map((line, i) => {
        const n = i + 1;
        const isAdd = deco.add?.includes(n);
        const isHl = deco.hl?.includes(n);
        return (
          <div
            key={n}
            className={cn(
              "flex",
              isAdd && "bg-[color-mix(in_srgb,var(--green)_9%,transparent)]",
              isHl && "bg-hl"
            )}
          >
            <span
              className={cn(
                "w-[46px] shrink-0 select-none pr-4 text-right text-txt3",
                isAdd ? "text-ok opacity-100" : "opacity-70"
              )}
            >
              {n}
            </span>
            <span className="whitespace-pre pr-6">
              {tokenizeLine(line).map((tok, j) =>
                tok.cls ? (
                  <span key={j} className={`tok-${tok.cls}`}>
                    {tok.text}
                  </span>
                ) : (
                  tok.text
                )
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function EditorStatusBar({ file }: { file: SourceFile | null }) {
  return (
    <div className="flex h-[25px] shrink-0 items-center gap-3.5 border-t border-border bg-bg2 px-[13px] text-[11px] text-txt2">
      <span className="inline-flex items-center gap-[5px]">
        <GitBranch className="h-3 w-3" strokeWidth={1.7} />
        main
      </span>
      <span>{file?.language ?? ""}</span>
      <span>Ln 11, Col 42</span>
      <span>UTF-8</span>
      <span className="ml-auto inline-flex items-center gap-[5px] text-accent">
        <Zap className="h-3 w-3" strokeWidth={1.7} />
        Helix connected
      </span>
    </div>
  );
}

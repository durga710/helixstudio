"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight, Sparkles, TriangleAlert } from "lucide-react";
import { AGENT_BY_ID, type LineKind, type TerminalLine } from "./ScenarioRegistry";
import { ProgressIndicator } from "./ProgressIndicator";
import { StreamingOutput } from "./StreamingOutput";
import { TypingAnimation } from "./TypingAnimation";

export interface RevealedLine extends TerminalLine {
  id: number;
  /** When true, the line reveals token-by-token and reports completion. */
  streaming: boolean;
}

interface InteractiveTerminalProps {
  /** File path shown in the terminal/editor chrome. */
  file: string;
  command: string;
  /** Reveal the command without typing (reduced motion / initial paint). */
  commandInstant: boolean;
  /** Whether the command is still being typed. */
  typingCommand: boolean;
  onCommandTyped: () => void;
  lines: RevealedLine[];
  onStreamComplete: () => void;
  progress: number;
  progressLabel: string;
  paused: boolean;
  instant: boolean;
}

const KIND_STYLES: Record<LineKind, { color: string }> = {
  command: { color: "var(--txt)" },
  thinking: { color: "var(--txt-2)" },
  success: { color: "var(--green)" },
  warn: { color: "var(--amber)" },
  output: { color: "var(--txt-2)" },
  done: { color: "var(--green)" },
};

function LineGlyph({ kind }: { kind: LineKind }) {
  if (kind === "success") return <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-ok" strokeWidth={2.4} />;
  if (kind === "done") return <Sparkles className="mt-[3px] h-3.5 w-3.5 shrink-0 text-ok" strokeWidth={2} />;
  if (kind === "warn") return <TriangleAlert className="mt-[3px] h-3.5 w-3.5 shrink-0 text-warn" strokeWidth={2} />;
  if (kind === "thinking") return <ChevronRight className="mt-[3px] h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2.4} />;
  return <span className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden />;
}

/**
 * The terminal/editor surface of the hero demo. Purely presentational: it
 * types the command, lists revealed lines (streaming the active one), keeps the
 * viewport pinned to the newest line, and renders the live progress bar.
 */
export function InteractiveTerminal({
  file,
  command,
  commandInstant,
  typingCommand,
  onCommandTyped,
  lines,
  onStreamComplete,
  progress,
  progressLabel,
  paused,
  instant,
}: InteractiveTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest line in view as output streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, typingCommand, progress]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-[var(--code-bg)]"
      style={{ boxShadow: "inset 0 1px 0 color-mix(in srgb, white 4%, transparent)" }}
    >
      {/* chrome */}
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-panel px-3.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 truncate font-mono text-[11px] text-txt3">helix · {file}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border2 px-2 py-0.5 text-[10px] font-medium text-txt3">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          live
        </span>
      </div>

      {/* output */}
      <div
        ref={scrollRef}
        className="scroll-area flex-1 overflow-y-auto px-3.5 py-3 font-mono text-[12.5px] leading-[1.7]"
      >
        {/* prompt line */}
        <div className="flex gap-2">
          <span className="select-none text-ok">$</span>
          <span className="text-txt">
            {typingCommand ? (
              <TypingAnimation text={command} paused={paused} instant={commandInstant} onDone={onCommandTyped} />
            ) : (
              command
            )}
          </span>
        </div>

        {/* revealed lines */}
        <AnimatePresence initial={false}>
          {lines.map((line) => {
            const agent = line.agent ? AGENT_BY_ID[line.agent] : undefined;
            return (
              <motion.div
                key={line.id}
                initial={instant ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className={`flex gap-2 ${line.kind === "output" ? "pl-[18px]" : ""} ${line.kind === "done" ? "mt-1.5" : "mt-0.5"}`}
                style={{ color: KIND_STYLES[line.kind].color }}
              >
                {line.kind !== "output" && <LineGlyph kind={line.kind} />}
                <span className={line.kind === "done" ? "font-semibold" : undefined}>
                  {line.streaming ? (
                    <StreamingOutput text={line.text} paused={paused} instant={instant} onComplete={onStreamComplete} />
                  ) : (
                    line.text
                  )}
                  {agent && line.kind === "thinking" && (
                    <span className="ml-2 rounded border border-border2 px-1.5 py-px text-[9.5px] font-medium text-txt3">
                      {agent.name}
                    </span>
                  )}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* footer progress */}
      <div className="shrink-0 border-t border-border bg-panel/60 px-3.5 py-2.5">
        <ProgressIndicator value={progress} label={progressLabel} instant={instant} />
      </div>
    </div>
  );
}

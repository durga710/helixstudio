"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, FlaskConical, Play, SquareTerminal } from "lucide-react";
import { cn } from "@/lib/utils";

/* Phase 4 dev tools: sandboxed terminal + test runner, docked under the editor. */

interface Line {
  text: string;
  tone: "out" | "ok" | "err" | "dim" | "cmd";
}

type Tab = "terminal" | "tests";

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("terminal");
  const [lines, setLines] = useState<Line[]>([
    { text: "Helix sandbox — commands run against the workspace copy, never your machine. Try `help`.", tone: "dim" },
  ]);
  const [testLines, setTestLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [testsRunning, setTestsRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines, testLines, tab, open]);

  async function run(commandRaw: string) {
    const command = commandRaw.trim();
    if (!command || busy) return;
    setInput("");
    if (command === "clear") {
      setLines([]);
      return;
    }
    setLines((prev) => [...prev, { text: `$ ${command}`, tone: "cmd" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { lines: Line[] };
      setLines((prev) => [...prev, ...data.lines]);
    } catch {
      setLines((prev) => [...prev, { text: "sandbox error — try again", tone: "err" }]);
    } finally {
      setBusy(false);
    }
  }

  async function runTests() {
    if (testsRunning) return;
    setTestsRunning(true);
    setTestLines([]);
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "npm test" }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { lines: Line[] };
      // Stage the output so it reads like a live run.
      for (const line of data.lines) {
        await new Promise((r) => setTimeout(r, 180));
        setTestLines((prev) => [...prev, line]);
      }
    } catch {
      setTestLines([{ text: "test runner error — try again", tone: "err" }]);
    } finally {
      setTestsRunning(false);
    }
  }

  const toneClass = (tone: Line["tone"]) =>
    cn(
      tone === "ok" && "text-ok",
      tone === "err" && "text-bad",
      tone === "dim" && "text-txt3",
      tone === "cmd" && "text-accent"
    );

  return (
    <div className="shrink-0 border-t border-border bg-bg2">
      <div className="flex h-8 items-center gap-1 px-2">
        {(
          [
            { id: "terminal" as Tab, label: "Terminal", icon: SquareTerminal },
            { id: "tests" as Tab, label: "Tests", icon: FlaskConical },
          ]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setOpen(true);
            }}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-md border-none px-2.5 py-1 text-[11.5px] transition-colors",
              tab === t.id && open ? "bg-panel2 text-txt" : "bg-transparent text-txt3 hover:text-txt"
            )}
          >
            <t.icon className="h-3.5 w-3.5" strokeWidth={1.7} />
            {t.label}
          </button>
        ))}
        {tab === "tests" && open && (
          <button
            onClick={runTests}
            disabled={testsRunning}
            className="ml-2 flex cursor-pointer items-center gap-1 rounded-md border border-border2 bg-panel px-2 py-0.5 text-[11px] text-txt2 hover:border-accent hover:text-txt disabled:opacity-50"
          >
            <Play className="h-3 w-3" strokeWidth={2} />
            {testsRunning ? "Running…" : "Run tests"}
          </button>
        )}
        <button
          aria-label={open ? "Collapse panel" : "Expand panel"}
          onClick={() => setOpen((o) => !o)}
          className="ml-auto grid h-6 w-6 cursor-pointer place-items-center rounded-md border-none bg-transparent text-txt3 hover:bg-panel2 hover:text-txt"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border">
          <div
            ref={scrollRef}
            className="scroll-area h-[150px] overflow-auto bg-codebg px-3 py-2 font-mono text-[11.5px] leading-[1.7]"
          >
            {(tab === "terminal" ? lines : testLines).map((line, i) => (
              <div key={i} className={cn("whitespace-pre-wrap", toneClass(line.tone))}>
                {line.text}
              </div>
            ))}
            {tab === "tests" && testLines.length === 0 && !testsRunning && (
              <div className="text-txt3">No test run yet — press Run tests.</div>
            )}
            {tab === "terminal" && (
              <div className="flex items-center gap-1.5">
                <span className="text-accent">$</span>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") run(input);
                  }}
                  disabled={busy}
                  aria-label="Terminal command"
                  spellCheck={false}
                  className="w-full border-none bg-transparent font-mono text-[11.5px] text-txt outline-none"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

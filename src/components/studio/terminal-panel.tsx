"use client";

import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

/**
 * Editor terminal. A command runner (not a live PTY): type a command, it runs
 * in the workspace environment via /api/workspaces/:id/exec and the captured
 * stdout/stderr stream back. xterm handles the line editing + history; the
 * backend handles a disposable copy of the workspace per command.
 */
const PROMPT = "\x1b[36m$\x1b[0m "; // cyan $
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

export function TerminalPanel({ workspaceId }: { workspaceId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      cursorBlink: true,
      convertEol: true, // write "\n" and xterm emits "\r\n"
      theme: { background: "#0b1120", foreground: "#cbd5e1", cursor: "#38bdf8" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try {
      fit.fit();
    } catch {
      /* host not laid out yet */
    }

    let line = "";
    const history: string[] = [];
    let histIdx = -1; // -1 = current (unsubmitted) line
    let running = false;

    const redraw = (next: string) => {
      // clear the whole input line, return to col 0, repaint prompt + text
      term.write(`\x1b[2K\r${PROMPT}${next}`);
      line = next;
    };

    const runCommand = async (cmd: string) => {
      running = true;
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/exec`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: cmd }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          term.write(`${RED}${json?.error?.message ?? "command failed"}${RESET}\n`);
        } else {
          const { stdout, stderr, exitCode } = json.data as {
            stdout: string;
            stderr: string;
            exitCode: number;
          };
          if (stdout) term.write(stdout.endsWith("\n") ? stdout : stdout + "\n");
          if (stderr) term.write(`${RED}${stderr.endsWith("\n") ? stderr : stderr + "\n"}${RESET}`);
          if (exitCode !== 0) term.write(`${YELLOW}[exit ${exitCode}]${RESET}\n`);
        }
      } catch {
        term.write(`${RED}couldn't reach the server${RESET}\n`);
      }
      running = false;
      term.write(PROMPT);
    };

    const onData = term.onData((data) => {
      if (running) return;

      if (data === "\r") {
        const cmd = line.trim();
        term.write("\n");
        line = "";
        histIdx = -1;
        if (!cmd) {
          term.write(PROMPT);
          return;
        }
        history.unshift(cmd);
        void runCommand(cmd);
        return;
      }
      if (data === "\x7f") {
        // backspace
        if (line.length > 0) {
          line = line.slice(0, -1);
          term.write("\b \b");
        }
        return;
      }
      if (data === "\x1b[A") {
        // up — older history
        if (history.length && histIdx < history.length - 1) redraw(history[++histIdx]);
        return;
      }
      if (data === "\x1b[B") {
        // down — newer history
        if (histIdx > 0) redraw(history[--histIdx]);
        else if (histIdx === 0) {
          histIdx = -1;
          redraw("");
        }
        return;
      }
      if (data === "\x03") {
        // Ctrl+C — abandon the current line
        term.write("^C\n" + PROMPT);
        line = "";
        histIdx = -1;
        return;
      }
      if (data.startsWith("\x1b")) return; // ignore other escape sequences

      // printable input (handles paste of multiple chars)
      const printable = [...data].filter((c) => c.charCodeAt(0) >= 32).join("");
      if (printable) {
        line += printable;
        term.write(printable);
      }
    });

    term.write(`${DIM}Helix terminal — runs in your workspace environment. Try: ls, npm test, git status${RESET}\n`);
    term.write(PROMPT);
    term.focus();

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* mid-layout */
      }
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      onData.dispose();
      term.dispose();
    };
  }, [workspaceId]);

  return <div ref={hostRef} className="h-full w-full bg-[#0b1120] p-2" />;
}

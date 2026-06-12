import "server-only";

/**
 * Local runner backend — runs the workspace on THIS machine.
 *
 * The workspace is virtual, so to RUN an app we export its files to a
 * temp directory, install dependencies, and spawn the dev server. The
 * Preview tab then embeds http://localhost:<port>.
 *
 * This only makes sense when Helix itself runs on the user's machine (dev /
 * self-hosted); the cloud backend (vercel-sandbox.ts) covers serverless
 * deploys. Process registry lives on globalThis so Next.js HMR doesn't
 * orphan children.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import type { Workspace } from "@/generated/prisma/client";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";
import {
  type RunInfo,
  type RunnerBackend,
  type RunStatus,
  STOPPED_RUN,
  buildRunCommand,
  detectFramework,
  runEnv,
} from "./types";

interface RunEntry {
  proc: ChildProcess | null;
  status: RunStatus;
  framework: string;
  suggestedPort: number;
  port: number | null;
  logs: string[];
  dir: string;
  startedAt: number;
}

const globalForRuns = globalThis as unknown as { helixRuns?: Map<string, RunEntry> };
const runs = (globalForRuns.helixRuns ??= new Map<string, RunEntry>());

const MAX_EXPORT_FILES = 300;
const MAX_LOG_LINES = 200;

/* ----------------------------- helpers ----------------------------- */

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Dev servers color their output — Vite even bolds the port mid-URL
 * (`http://127.0.0.1:\x1b[1m5173\x1b[22m/`), which broke the port regex and
 * littered the log panel. Strip ANSI before anything reads the lines. */
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

function pushLog(entry: RunEntry, chunk: string) {
  const lines = chunk
    .replace(ANSI_RE, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  entry.logs.push(...lines);
  if (entry.logs.length > MAX_LOG_LINES) entry.logs.splice(0, entry.logs.length - MAX_LOG_LINES);

  // Discover the actual port from the dev server's own announcement —
  // works across frameworks regardless of how they pick ports.
  if (entry.port === null) {
    for (const line of lines) {
      const m = line.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{3,5})/);
      if (m) {
        entry.port = Number(m[1]);
        entry.status = "running";
        break;
      }
    }
  }
}

async function isReachable(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(900),
      cache: "no-store",
    });
    return true; // any HTTP answer counts — even a 404 means the server is up
  } catch {
    return false;
  }
}

function localUrl(port: number | null): string | null {
  return port ? `http://localhost:${port}` : null;
}

function getRunInfoSync(workspaceId: string): RunInfo {
  const entry = runs.get(workspaceId);
  if (!entry) return STOPPED_RUN;
  const port = entry.port ?? (entry.status === "running" ? entry.suggestedPort : null);
  return {
    status: entry.status,
    framework: entry.framework,
    url: localUrl(port),
    port,
    reachable: false,
    logs: entry.logs.slice(-80),
  };
}

/* --------------------------- lifecycle ----------------------------- */

async function start(ws: Workspace): Promise<RunInfo | { error: string }> {
  await stop(ws.id); // one run per workspace

  const files = await listWorkspaceFiles(ws);
  if (files.length === 0) return { error: "The workspace is empty — nothing to run." };
  const paths = files.map((f) => f.path);

  const dir = path.join(os.tmpdir(), "helix-run", ws.id);
  const entry: RunEntry = {
    proc: null,
    status: "exporting",
    framework: "detecting…",
    suggestedPort: 0,
    port: null,
    logs: [],
    dir,
    startedAt: Date.now(),
  };
  runs.set(ws.id, entry);

  try {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

    const exportList = files.slice(0, MAX_EXPORT_FILES);
    if (files.length > MAX_EXPORT_FILES) {
      pushLog(entry, `[helix] workspace has ${files.length} files — exporting the first ${MAX_EXPORT_FILES}`);
    }
    let pkgJson: string | null = null;
    for (const f of exportList) {
      const content = await readWorkspaceFile(ws, f.path);
      if (content === null) continue; // binary/unreadable — skip
      if (f.path === "package.json") pkgJson = content;
      const filePath = path.join(dir, f.path);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
    }

    const detection = detectFramework(paths, pkgJson);
    entry.framework = detection.label;
    if (detection.kind === "static" || detection.kind === "unknown") {
      runs.delete(ws.id);
      return { error: "This looks like a static site — the Preview tab renders it directly, no run needed." };
    }

    const port = await freePort();
    entry.suggestedPort = port;

    const built = buildRunCommand(detection, paths, pkgJson, port, "127.0.0.1");
    if ("error" in built) {
      entry.status = "error";
      pushLog(entry, `[helix] ${built.error}`);
      return getRunInfoSync(ws.id);
    }
    entry.status = built.installs ? "installing" : "starting";

    pushLog(entry, `[helix] ${detection.label} detected — ${built.command}`);

    const proc = spawn(built.command, {
      cwd: dir,
      shell: true,
      env: { ...process.env, ...runEnv(port, "127.0.0.1") },
    });
    entry.proc = proc;

    proc.stdout?.on("data", (d: Buffer) => {
      const text = d.toString();
      pushLog(entry, text);
      if (entry.status === "installing" && /(ready|started|compiled|running|listening|local:)/i.test(text)) {
        entry.status = "starting";
      }
    });
    proc.stderr?.on("data", (d: Buffer) => pushLog(entry, d.toString()));
    proc.on("exit", (code) => {
      if (entry.status !== "stopped") {
        entry.status = code === 0 ? "stopped" : "error";
        pushLog(entry, `[helix] process exited with code ${code}`);
      }
    });
    proc.on("error", (e) => {
      entry.status = "error";
      pushLog(entry, `[helix] failed to start: ${e.message}`);
    });

    // If install logs never announce a URL, flip installing→starting after
    // the first minute so the UI doesn't look stuck.
    setTimeout(() => {
      if (entry.status === "installing") entry.status = "starting";
    }, 60_000);

    return getRunInfoSync(ws.id);
  } catch (e) {
    entry.status = "error";
    pushLog(entry, `[helix] ${e instanceof Error ? e.message : "export failed"}`);
    return getRunInfoSync(ws.id);
  }
}

/** A run that hasn't become reachable by now is wedged — surface it as an
 * error with the logs instead of spinning the boot screen forever. */
const BOOT_DEADLINE_MS = 4 * 60_000;

/** Status + live reachability check (promotes starting→running). */
async function status(ws: Workspace): Promise<RunInfo> {
  const entry = runs.get(ws.id);
  if (!entry) return STOPPED_RUN;

  const candidate = entry.port ?? entry.suggestedPort;
  let reachable = false;
  if (candidate && (entry.status === "starting" || entry.status === "running" || entry.status === "installing")) {
    reachable = await isReachable(candidate);
    if (reachable) {
      entry.port = candidate;
      entry.status = "running";
    } else if (Date.now() - entry.startedAt > BOOT_DEADLINE_MS && entry.status !== "running") {
      entry.status = "error";
      pushLog(
        entry,
        `[helix] the dev server didn't become reachable on port ${candidate} within ${BOOT_DEADLINE_MS / 60_000} minutes — ` +
          "check the logs above, then Stop and Run again.",
      );
      try {
        entry.proc?.kill();
      } catch {
        /* already gone */
      }
    }
  }
  return {
    status: entry.status,
    framework: entry.framework,
    url: localUrl(entry.port),
    port: entry.port,
    reachable,
    logs: entry.logs.slice(-80),
  };
}

async function stop(workspaceId: string): Promise<void> {
  const entry = runs.get(workspaceId);
  if (!entry) return;
  entry.status = "stopped";
  const pid = entry.proc?.pid;
  if (pid) {
    if (process.platform === "win32") {
      // proc.kill() would only kill the shell — taskkill takes the tree down.
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
    } else {
      try {
        entry.proc?.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
  }
  runs.delete(workspaceId);
}

export const localBackend: RunnerBackend = { start, status, stop };

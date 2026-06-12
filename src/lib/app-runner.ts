import "server-only";

/**
 * Local app runner — the "live preview" engine for framework apps.
 *
 * The workspace is virtual, so to RUN an app we export its files to a
 * temp directory on this machine, install dependencies, and spawn the dev
 * server. The Preview tab then embeds http://localhost:<port>.
 *
 * This only makes sense when Helix itself runs on the user's machine (dev /
 * self-hosted) — it is disabled on serverless deploys. Process registry
 * lives on globalThis so Next.js HMR doesn't orphan children.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import type { Workspace } from "@/generated/prisma/client";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";

export type RunStatus = "exporting" | "installing" | "starting" | "running" | "stopped" | "error";

export interface RunInfo {
  status: RunStatus;
  framework: string;
  port: number | null;
  reachable: boolean;
  logs: string[];
}

interface RunEntry {
  proc: ChildProcess | null;
  status: RunStatus;
  framework: string;
  suggestedPort: number;
  port: number | null;
  logs: string[];
  dir: string;
}

const globalForRuns = globalThis as unknown as { helixRuns?: Map<string, RunEntry> };
const runs = (globalForRuns.helixRuns ??= new Map<string, RunEntry>());

export function runnerEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.HELIX_LOCAL_RUNNER === "1";
}

const MAX_EXPORT_FILES = 300;
const MAX_LOG_LINES = 200;

/* ---------------------------- detection ---------------------------- */

export interface Detection {
  kind: "node" | "python" | "static" | "unknown";
  label: string;
}

export function detectFramework(
  paths: string[],
  pkgJson: string | null,
): Detection {
  if (paths.includes("package.json")) {
    let label = "Node app";
    try {
      const pkg = JSON.parse(pkgJson ?? "{}") as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) label = "Next.js";
      else if (deps.vite) label = "Vite";
      else if (deps["react-scripts"]) label = "Create React App";
      else if (deps.express) label = "Express";
      else if (deps.react) label = "React";
    } catch {
      // unparseable package.json — still a node app
    }
    return { kind: "node", label };
  }
  if (paths.some((p) => /^(app|main|server)\.py$/.test(p))) {
    return { kind: "python", label: paths.includes("requirements.txt") ? "Python (Flask?)" : "Python" };
  }
  if (paths.some((p) => p.toLowerCase().endsWith(".html"))) {
    return { kind: "static", label: "Static site" };
  }
  return { kind: "unknown", label: "Unknown" };
}

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

function pushLog(entry: RunEntry, chunk: string) {
  const lines = chunk.split(/\r?\n/).filter((l) => l.trim().length > 0);
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

export async function isReachable(port: number): Promise<boolean> {
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

/* --------------------------- lifecycle ----------------------------- */

/**
 * Export the workspace's effective files (repo base + overlay) to a temp dir
 * and spawn the right dev command. Caller must run inside withGitHubToken()
 * for IMPORT workspaces.
 */
export async function startRun(ws: Workspace): Promise<RunInfo | { error: string }> {
  if (!runnerEnabled()) return { error: "The app runner only works when Helix runs on your own machine." };

  await stopRun(ws.id); // one run per workspace

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

    let command: string;
    if (detection.kind === "node") {
      const pkg = JSON.parse(pkgJson ?? "{}") as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const devCmd = pkg.scripts?.dev
        ? deps.vite
          ? `npm run dev -- --port ${port} --host 127.0.0.1`
          : "npm run dev"
        : pkg.scripts?.start
          ? "npm start"
          : deps.next
            ? `npx next dev -p ${port}`
            : null;
      if (!devCmd) {
        entry.status = "error";
        pushLog(entry, "[helix] no dev/start script in package.json — add one and run again");
        return getRunInfoSync(ws.id);
      }
      command = `npm install --no-audit --no-fund && ${devCmd}`;
      entry.status = "installing";
    } else {
      const main = paths.find((p) => /^(app|main|server)\.py$/.test(p))!;
      command = paths.includes("requirements.txt")
        ? `pip install -r requirements.txt && python ${main}`
        : `python ${main}`;
      entry.status = paths.includes("requirements.txt") ? "installing" : "starting";
    }

    pushLog(entry, `[helix] ${detection.label} detected — ${command}`);

    const proc = spawn(command, {
      cwd: dir,
      shell: true,
      env: {
        ...process.env,
        PORT: String(port),
        FLASK_RUN_PORT: String(port),
        BROWSER: "none",
        FORCE_COLOR: "0",
        NODE_ENV: "development",
      },
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

function getRunInfoSync(workspaceId: string): RunInfo {
  const entry = runs.get(workspaceId);
  if (!entry) return { status: "stopped", framework: "", port: null, reachable: false, logs: [] };
  return {
    status: entry.status,
    framework: entry.framework,
    port: entry.port ?? (entry.status === "running" ? entry.suggestedPort : null),
    reachable: false,
    logs: entry.logs.slice(-80),
  };
}

/** Status + live reachability check (promotes starting→running). */
export async function getRunInfo(workspaceId: string): Promise<RunInfo> {
  const entry = runs.get(workspaceId);
  if (!entry) return { status: "stopped", framework: "", port: null, reachable: false, logs: [] };

  const candidate = entry.port ?? entry.suggestedPort;
  let reachable = false;
  if (candidate && (entry.status === "starting" || entry.status === "running" || entry.status === "installing")) {
    reachable = await isReachable(candidate);
    if (reachable) {
      entry.port = candidate;
      entry.status = "running";
    }
  }
  return {
    status: entry.status,
    framework: entry.framework,
    port: entry.port,
    reachable,
    logs: entry.logs.slice(-80),
  };
}

export async function stopRun(workspaceId: string): Promise<void> {
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

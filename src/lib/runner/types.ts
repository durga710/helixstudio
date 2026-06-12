import type { Workspace } from "@/generated/prisma/client";

/**
 * Pluggable app-runner backends. The editor's Run button talks only to this
 * interface (via the facade in src/lib/app-runner.ts) — where the app
 * actually executes is a backend detail: a local child process in dev, a
 * cloud microVM in production, something else tomorrow.
 */

export type RunStatus = "exporting" | "installing" | "starting" | "running" | "stopped" | "error";

export interface RunInfo {
  status: RunStatus;
  framework: string;
  /** Full origin the preview iframe / "open in new tab" should use. */
  url: string | null;
  /** Local-backend port (informational; null for cloud backends). */
  port: number | null;
  reachable: boolean;
  logs: string[];
}

export interface RunnerBackend {
  /** Export the workspace and launch its dev server. One run per workspace. */
  start(ws: Workspace): Promise<RunInfo | { error: string }>;
  /** Current status incl. a live reachability probe (promotes → running). */
  status(ws: Workspace): Promise<RunInfo>;
  stop(workspaceId: string): Promise<void>;
}

export const STOPPED_RUN: RunInfo = {
  status: "stopped",
  framework: "",
  url: null,
  port: null,
  reachable: false,
  logs: [],
};

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

/**
 * Builds the install+dev command for a workspace, shared by backends.
 * `host` is what the dev server must bind: 127.0.0.1 locally (only the
 * embedding iframe needs it), 0.0.0.0 in a VM (traffic arrives through the
 * VM's public port mapping).
 */
export function buildRunCommand(
  detection: Detection,
  paths: string[],
  pkgJson: string | null,
  port: number,
  host: "127.0.0.1" | "0.0.0.0",
): { command: string; installs: boolean } | { error: string } {
  if (detection.kind === "node") {
    const pkg = JSON.parse(pkgJson ?? "{}") as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const devCmd = pkg.scripts?.dev
      ? deps.vite
        ? `npm run dev -- --port ${port} --host ${host}`
        : deps.next
          ? `npm run dev -- -p ${port} -H ${host}`
          : "npm run dev"
      : pkg.scripts?.start
        ? "npm start"
        : deps.next
          ? `npx next dev -p ${port} -H ${host}`
          : null;
    if (!devCmd) return { error: "no dev/start script in package.json — add one and run again" };
    return { command: `npm install --no-audit --no-fund && ${devCmd}`, installs: true };
  }
  const main = paths.find((p) => /^(app|main|server)\.py$/.test(p));
  if (!main) return { error: "no app.py / main.py / server.py found" };
  const installs = paths.includes("requirements.txt");
  return {
    command: installs ? `pip install -r requirements.txt && python ${main}` : `python ${main}`,
    installs,
  };
}

/** The env every dev server gets, nudging it onto our port and host. */
export function runEnv(port: number, host: string): Record<string, string> {
  return {
    PORT: String(port),
    HOST: host,
    FLASK_RUN_PORT: String(port),
    FLASK_RUN_HOST: host,
    BROWSER: "none",
    FORCE_COLOR: "0",
    NODE_ENV: "development",
  };
}

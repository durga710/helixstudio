import "server-only";

/**
 * Cloud runner backend — Vercel Sandbox (Firecracker microVMs).
 *
 * PORTABILITY NOTE (read me before a cloud migration):
 * AWS later? Not a problem — this was built for it. The runner sits behind a
 * small interface (start / stop / status / url — see ./types.ts) with
 * backends: local (the user's machine, dev) and vercel-sandbox (production).
 * ALL Vercel-specific code lives in THIS one file. Moving to AWS later means
 * writing one new backend (Fargate task or EC2-hosted Firecracker) against
 * the same interface — zero changes to the UI, routes, or workspace logic.
 * The public-URL-per-run model is identical on AWS, so nothing about the
 * product design locks us in.
 *
 * How it works: the workspace's files are written into an ephemeral microVM,
 * the dev server starts on port 3000 bound to 0.0.0.0, and Vercel routes a
 * public *.vercel.run URL to that port — that URL is what the Preview iframe
 * embeds and what "open in new tab" gives the user. The sandbox itself is
 * the state store (serverless invocations share no memory): we find it again
 * by name, read logs from /tmp/run.log inside the VM, and infer status from
 * sandbox state + an HTTP reachability probe. Auth is automatic on Vercel
 * deployments (OIDC); locally, `vercel env pull` provides a 12h token.
 */

import { Sandbox } from "@vercel/sandbox";
import type { Workspace } from "@/generated/prisma/client";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";
import {
  type RunInfo,
  type RunnerBackend,
  STOPPED_RUN,
  buildRunCommand,
  detectFramework,
  runEnv,
} from "./types";

const PORT = 3000;
const RUN_TIMEOUT_MS = 15 * 60 * 1000; // forgotten previews self-destruct
const MAX_EXPORT_FILES = 300;
const LOG_FILE = "/tmp/run.log";

function sandboxName(workspaceId: string): string {
  return `helix-run-${workspaceId}`;
}

async function findSandbox(workspaceId: string): Promise<Sandbox | null> {
  try {
    const sandbox = await Sandbox.get({ name: sandboxName(workspaceId), resume: false });
    // A sandbox past its life (stopped/failed/expired) counts as no run.
    if (["stopped", "failed", "aborted"].includes(sandbox.status)) return null;
    return sandbox;
  } catch {
    return null; // not found (or auth hiccup — surfaces on the next action)
  }
}

async function urlReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500), cache: "no-store" });
    // Unlike the local probe, the sandbox proxy ALWAYS answers — while the
    // app is still installing/booting it serves 502 SANDBOX_NOT_LISTENING.
    // Only a non-502 response means the app inside the VM is actually up.
    return res.status !== 502;
  } catch {
    return false;
  }
}

async function readLogs(sandbox: Sandbox): Promise<string[]> {
  try {
    const tail = await sandbox.runCommand("tail", ["-n", "80", LOG_FILE]);
    const out = await tail.stdout();
    return out.split(/\r?\n/).filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

/* --------------------------- lifecycle ----------------------------- */

async function start(ws: Workspace): Promise<RunInfo | { error: string }> {
  await stop(ws.id); // one run per workspace

  const files = await listWorkspaceFiles(ws);
  if (files.length === 0) return { error: "The workspace is empty — nothing to run." };
  const paths = files.map((f) => f.path);

  const exportList = files.slice(0, MAX_EXPORT_FILES);
  const contents: { path: string; content: string }[] = [];
  let pkgJson: string | null = null;
  for (const f of exportList) {
    const content = await readWorkspaceFile(ws, f.path);
    if (content === null) continue; // binary/unreadable — skip
    if (f.path === "package.json") pkgJson = content;
    contents.push({ path: f.path, content });
  }

  const detection = detectFramework(paths, pkgJson);
  if (detection.kind === "static" || detection.kind === "unknown") {
    return { error: "This looks like a static site — the Preview tab renders it directly, no run needed." };
  }

  const built = buildRunCommand(detection, paths, pkgJson, PORT, "0.0.0.0");
  if ("error" in built) return { error: built.error };

  let sandbox: Sandbox;
  try {
    sandbox = await Sandbox.create({
      name: sandboxName(ws.id),
      runtime: detection.kind === "python" ? "python3.13" : "node24",
      ports: [PORT],
      timeout: RUN_TIMEOUT_MS,
      resources: { vcpus: 2 },
      // No filesystem snapshot on stop: a resumed snapshot would restore the
      // files but not the dev-server process, leaving a zombie "run".
      persistent: false,
      tags: { app: "helix", framework: detection.label.slice(0, 60) },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown error";
    return { error: `Couldn't start a cloud VM: ${detail}` };
  }

  try {
    await sandbox.writeFiles(
      contents.map((f) => ({ path: f.path, content: Buffer.from(f.content, "utf8") })),
    );

    // Detached with output captured in the VM — later invocations read the
    // log file because no server memory survives between API calls.
    await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `( ${built.command} ) > ${LOG_FILE} 2>&1`],
      detached: true,
      env: runEnv(PORT, "0.0.0.0"),
    });
  } catch (e) {
    await sandbox.stop().catch(() => {});
    const detail = e instanceof Error ? e.message : "unknown error";
    return { error: `Couldn't launch the app in the cloud VM: ${detail}` };
  }

  return {
    status: built.installs ? "installing" : "starting",
    framework: detection.label,
    url: sandbox.domain(PORT),
    port: null,
    reachable: false,
    logs: [`[helix] ${detection.label} detected — ${built.command}`, "[helix] cloud VM started"],
  };
}

async function status(ws: Workspace): Promise<RunInfo> {
  const sandbox = await findSandbox(ws.id);
  if (!sandbox) return STOPPED_RUN;

  const url = sandbox.domain(PORT);
  const [reachable, logs] = await Promise.all([urlReachable(url), readLogs(sandbox)]);
  const text = logs.join("\n");

  let runStatus: RunInfo["status"];
  if (reachable) runStatus = "running";
  else if (/(error|traceback|exited with|npm err!)/i.test(text)) runStatus = "error";
  else if (/(ready|started|compiled|running|listening|local:)/i.test(text)) runStatus = "starting";
  else runStatus = "installing";

  const framework = sandbox.tags?.framework ?? "framework app";

  return { status: runStatus, framework, url, port: null, reachable, logs };
}

async function stop(workspaceId: string): Promise<void> {
  const sandbox = await findSandbox(workspaceId);
  if (!sandbox) return;
  await sandbox.stop().catch(() => {});
}

export const sandboxBackend: RunnerBackend = { start, status, stop };

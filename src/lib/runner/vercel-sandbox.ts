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

import { createHash, randomBytes } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import type { Workspace } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";
import {
  type Detection,
  type RunInfo,
  type RunnerBackend,
  STOPPED_RUN,
  buildCommands,
  defaultSetupScript,
  detectFramework,
  runEnv,
} from "./types";

const PORT = 3000;
const RUN_TIMEOUT_MS = 15 * 60 * 1000; // forgotten previews self-destruct
const MAX_EXPORT_FILES = 300;
const LOG_FILE = "/tmp/run.log";
const SETUP_TIMEOUT_MS = 6 * 60 * 1000; // deps install budget before snapshotting
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // env cache lifetime (bounds Hobby's 15GB)
// Files that, when changed, invalidate the cached environment snapshot.
const ENV_KEY_FILES = ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "requirements.txt"];

/** A fresh, single-use VM name. (Names are burned once a snapshot uses them.) */
function freshSandboxName(workspaceId: string): string {
  return `helix-run-${workspaceId.slice(-10)}-${randomBytes(4).toString("hex")}`;
}

/** The workspace's live VM, found by the name stored on the row (envSandbox). */
async function findSandbox(ws: { id?: string; envSandbox: string | null }): Promise<Sandbox | null> {
  if (!ws.envSandbox) return null;
  try {
    const sandbox = await Sandbox.get({ name: ws.envSandbox, resume: false });
    // A sandbox past its life (stopped/failed/expired) counts as no run. Clear
    // the dead pointer off the row so we don't keep reporting a ghost env (only
    // on a CONFIRMED-dead status — never in the catch below, where the cause
    // could be a transient hiccup and clearing would orphan a live VM).
    if (["stopped", "failed", "aborted"].includes(sandbox.status)) {
      if (ws.id) {
        await db().workspace.update({ where: { id: ws.id }, data: { envSandbox: null } }).catch(() => {});
        ws.envSandbox = null;
      }
      return null;
    }
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

/* ------------------------ VM provisioning -------------------------- */

/** The workspace read once into VM-transferable form (text files, capped). */
interface WorkspaceExport {
  paths: string[];
  contents: { path: string; content: string }[];
  pkgJson: string | null;
}

async function exportWorkspace(ws: Workspace): Promise<WorkspaceExport> {
  const files = await listWorkspaceFiles(ws);
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
  return { paths, contents, pkgJson };
}

async function writeSource(sandbox: Sandbox, contents: WorkspaceExport["contents"]): Promise<void> {
  if (contents.length === 0) return;
  await sandbox.writeFiles(contents.map((f) => ({ path: f.path, content: Buffer.from(f.content, "utf8") })));
}

/** Create a fresh-named VM (optionally from a cached snapshot), record the name
 *  on the workspace so later calls can find it, and copy the files in — no app
 *  launch. */
async function createSandboxWithFiles(
  ws: Workspace,
  detection: Detection,
  contents: WorkspaceExport["contents"],
  fromSnapshotId?: string,
): Promise<Sandbox | { error: string }> {
  const name = freshSandboxName(ws.id);
  let sandbox: Sandbox;
  try {
    sandbox = await Sandbox.create({
      name,
      // Restoring from a snapshot brings its own runtime; only set runtime on a
      // cold create.
      ...(fromSnapshotId
        ? { source: { type: "snapshot" as const, snapshotId: fromSnapshotId } }
        : { runtime: detection.kind === "python" ? "python3.13" : "node24" }),
      ports: [PORT],
      timeout: RUN_TIMEOUT_MS,
      resources: { vcpus: 2 },
      // No auto filesystem snapshot on stop: a resumed snapshot would restore
      // the files but not the dev-server process, leaving a zombie "run". The
      // env cache uses explicit snapshot() calls instead.
      persistent: false,
      tags: { app: "helix", framework: detection.label.slice(0, 60) },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown error";
    return { error: `Couldn't start a cloud VM: ${detail}` };
  }

  // Record the live name so status/exec/stop on later requests find this VM.
  await db().workspace.update({ where: { id: ws.id }, data: { envSandbox: name } }).catch(() => {});
  ws.envSandbox = name; // keep the in-memory copy consistent for this request

  try {
    await writeSource(sandbox, contents);
  } catch (e) {
    await sandbox.stop().catch(() => {});
    const detail = e instanceof Error ? e.message : "unknown error";
    return { error: `Couldn't copy the workspace into the cloud VM: ${detail}` };
  }
  return sandbox;
}

/* ----------------------- environment cache ------------------------- */

/** The effective setup script: the user's override, else stack default. */
function effectiveSetup(ws: Workspace, detection: Detection, paths: string[]): string | null {
  const custom = ws.setupScript?.trim();
  return custom ? custom : defaultSetupScript(detection, paths);
}

/** Hash of the setup inputs — when it changes, the cached snapshot is stale. */
function envKey(setup: string | null, exported: WorkspaceExport): string {
  const h = createHash("sha256");
  h.update(setup ?? "");
  for (const name of ENV_KEY_FILES) {
    const f = exported.contents.find((c) => c.path === name);
    if (f) h.update(`\n${name}\n${f.content}`);
  }
  return h.digest("hex").slice(0, 32);
}

/** A prepared VM: dependencies installed (warm) or just created (cold). */
export interface PreparedSandbox {
  sandbox: Sandbox;
  warm: boolean;
}

/**
 * The workspace's VM with its dependencies already installed when possible.
 *   1. A live sandbox (e.g. a running preview) → reuse as-is.
 *   2. A valid cached snapshot (deps installed, setup inputs unchanged, fresh)
 *      → restore from it instantly, then re-sync the current source on top.
 *   3. Otherwise cold: create, run the setup script, snapshot it for next time.
 * Setup/snapshot failures degrade gracefully — you just get a cold VM.
 */
export async function ensurePreparedSandbox(ws: Workspace): Promise<PreparedSandbox | { error: string }> {
  const existing = await findSandbox(ws);
  if (existing) return { sandbox: existing, warm: true };

  const exported = await exportWorkspace(ws);
  const detection = detectFramework(exported.paths, exported.pkgJson);
  const setup = effectiveSetup(ws, detection, exported.paths);
  const key = envKey(setup, exported);

  // Warm: restore from a still-valid cached snapshot.
  const cacheFresh =
    ws.envSnapshotId &&
    ws.envSnapshotKey === key &&
    ws.envReadyAt &&
    Date.now() - ws.envReadyAt.getTime() < SNAPSHOT_TTL_MS;
  if (cacheFresh) {
    const restored = await createSandboxWithFiles(ws, detection, exported.contents, ws.envSnapshotId!);
    if (!("error" in restored)) return { sandbox: restored, warm: true };
    // Snapshot gone/expired server-side — fall through to a cold build.
  }

  // Cold: fresh VM, run setup, snapshot for next time.
  const sandbox = await createSandboxWithFiles(ws, detection, exported.contents);
  if ("error" in sandbox) return sandbox;

  if (setup) {
    try {
      await sandbox.runCommand({ cmd: "sh", args: ["-c", setup], timeoutMs: SETUP_TIMEOUT_MS });
      const snap = await sandbox.snapshot({ expiration: SNAPSHOT_TTL_MS });
      await db()
        .workspace.update({
          where: { id: ws.id },
          data: { envSnapshotId: snap.snapshotId, envSnapshotKey: key, envReadyAt: new Date() },
        })
        .catch(() => {});
    } catch {
      // Setup or snapshot failed — keep going with a cold VM; the dev command /
      // run_command will surface any real install error in its own output.
    }
  }
  return { sandbox, warm: false };
}

/** Drop the cached environment so the next run rebuilds (the "Rebuild" button). */
export async function clearEnvCache(workspaceId: string): Promise<void> {
  await db()
    .workspace.update({
      where: { id: workspaceId },
      data: { envSnapshotId: null, envSnapshotKey: null, envReadyAt: null },
    })
    .catch(() => {});
}

/* --------------------------- lifecycle ----------------------------- */

async function start(ws: Workspace): Promise<RunInfo | { error: string }> {
  await stop(ws.id); // one run per workspace

  const { paths, pkgJson } = await exportWorkspace(ws);
  if (paths.length === 0) return { error: "The workspace is empty — nothing to run." };

  const detection = detectFramework(paths, pkgJson);
  if (detection.kind === "static" || detection.kind === "unknown") {
    return { error: "This looks like a static site — the Preview tab renders it directly, no run needed." };
  }

  const built = buildCommands(detection, paths, pkgJson, PORT, "0.0.0.0");
  if ("error" in built) return { error: built.error };

  // Prepared = deps installed (warm restore, or cold prepare ran the setup
  // script), so we only run the dev command here — no inline install.
  const prepared = await ensurePreparedSandbox(ws);
  if ("error" in prepared) return prepared;
  const { sandbox, warm } = prepared;
  const command = built.dev;

  try {
    // Detached with output captured in the VM — later invocations read the
    // log file because no server memory survives between API calls.
    await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `( ${command} ) > ${LOG_FILE} 2>&1`],
      detached: true,
      env: runEnv(PORT, "0.0.0.0"),
    });
  } catch (e) {
    await sandbox.stop().catch(() => {});
    const detail = e instanceof Error ? e.message : "unknown error";
    return { error: `Couldn't launch the app in the cloud VM: ${detail}` };
  }

  return {
    status: "starting",
    framework: detection.label,
    url: sandbox.domain(PORT),
    port: null,
    reachable: false,
    logs: [
      `[helix] ${detection.label} detected`,
      warm ? "[helix] warm VM (deps cached) — starting the dev server" : "[helix] cold VM prepared — starting the dev server",
    ],
  };
}

async function status(ws: Workspace): Promise<RunInfo> {
  const sandbox = await findSandbox(ws);
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
  const ws = await db().workspace.findUnique({
    where: { id: workspaceId },
    select: { envSandbox: true },
  });
  if (!ws?.envSandbox) return;
  const sandbox = await findSandbox(ws);
  if (sandbox) await sandbox.stop().catch(() => {});
  // The name is single-use; clear it so the next run gets a fresh VM.
  await db().workspace.update({ where: { id: workspaceId }, data: { envSandbox: null } }).catch(() => {});
}

export const sandboxBackend: RunnerBackend = { start, status, stop };

/* ---------------------- agent command execution --------------------- */

const EXEC_TIMEOUT_MS = 120_000; // one agent command gets 2 minutes, then SIGKILL
const EXEC_OUTPUT_CAP = 8_000; // per stream — tool results go back into the prompt

function capExecOutput(text: string): string {
  return text.length > EXEC_OUTPUT_CAP ? `${text.slice(0, EXEC_OUTPUT_CAP)}… [truncated]` : text;
}

/**
 * Run one shell command in the workspace's VM and return its outcome. The VM
 * comes prepared (deps cached when possible), and the current workspace files
 * are re-synced first so edits the agent made earlier in the turn are visible
 * — the VM copy is disposable, nothing the command does flows back.
 */
export async function execInSandbox(
  ws: Workspace,
  command: string,
): Promise<{ exitCode: number; stdout: string; stderr: string } | { error: string }> {
  try {
    const prepared = await ensurePreparedSandbox(ws);
    if ("error" in prepared) return prepared;
    const { sandbox } = prepared;

    const { contents } = await exportWorkspace(ws);
    await writeSource(sandbox, contents);

    const result = await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", command],
      timeoutMs: EXEC_TIMEOUT_MS,
    });
    const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()]);
    return {
      exitCode: result.exitCode,
      stdout: capExecOutput(stdout),
      stderr: capExecOutput(stderr),
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown error";
    return { error: `Couldn't run the command in the cloud VM: ${detail}` };
  }
}

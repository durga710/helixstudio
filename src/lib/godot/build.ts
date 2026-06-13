import "server-only";

/**
 * Godot web-export worker. Compiles a workspace's Godot project to a WebAssembly
 * pack inside a Vercel Sandbox, mirroring the template-refresh job pattern
 * (create sandbox → run CLI → read files back → stream log lines).
 *
 * Two entry points:
 *   primeGodot()  — one-time (admin): download Godot + web export templates,
 *                   snapshot the toolchain, and publish the SHARED engine runtime
 *                   (the big .wasm/.js — identical for every game) to blob once.
 *   exportGodot() — per build: restore the snapshot, write the project, export
 *                   ONLY the small per-game `.pck`, and upload it to blob.
 *
 * NOTE: needs the live Vercel env (Sandbox OIDC + Blob token). The exact Godot
 * install/CLI is validated on a real admin prime run after deploy.
 */

import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import type { Workspace } from "@/generated/prisma/client";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";
import { getTemplate } from "@/lib/templates/store";
import { putArtifact, putJson, findArtifactUrl } from "@/lib/blob";

export type GodotLog = (line: string) => void;

export const GODOT_VERSION = "4.3-stable";
const TEMPLATE_TAG = "4.3.stable"; // export-templates subdir name Godot expects

const HOME = "/vercel/sandbox";
const DATA = `${HOME}/.local/share`;
const GODOT = `${HOME}/godot/godot`;
const PROJECT = `${HOME}/project`;
const REL = "https://github.com/godotengine/godot/releases/download/4.3-stable";
const EDITOR_ZIP = `${REL}/Godot_v4.3-stable_linux.x86_64.zip`;
const TEMPLATES_TPZ = `${REL}/Godot_v4.3-stable_export_templates.tpz`;

// Web-export output basename → canonical shared-runtime asset name.
const ENGINE_MAP: Record<string, string> = {
  "godot.wasm": "index.wasm",
  "godot.js": "index.js",
  "godot.worker.js": "index.worker.js",
  "godot.audio.worklet.js": "index.audio.worklet.js",
};
const RUNTIME_PREFIX = `godot-runtime/${GODOT_VERSION}/current.json`;

const MAX_FILES = 400;
const MAX_FILE_CHARS = 200_000;

export interface GodotRuntime {
  version: string;
  snapshotId: string;
  engine: Record<string, string>; // asset name (godot.wasm…) → blob url
}

type Sbx = Awaited<ReturnType<typeof Sandbox.create>>;

function contentType(name: string): string {
  if (name.endsWith(".wasm")) return "application/wasm";
  if (name.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

/** Run a shell command, stream a tail of its output, return the exit code. */
async function sh(sbx: Sbx, cmd: string, onLog: GodotLog, timeoutMs: number): Promise<number> {
  const res = await sbx.runCommand({ cmd: "sh", args: ["-c", cmd], timeoutMs });
  const [out, err] = await Promise.all([res.stdout(), res.stderr()]);
  const tail = (out + (err ? "\n" + err : "")).trim().split("\n").slice(-10);
  for (const l of tail) if (l.trim()) onLog("  " + l);
  return res.exitCode;
}

/** Read a workspace's Godot project as VM-writable text files (capped). */
export async function readProjectFiles(ws: Workspace): Promise<{ path: string; content: string }[]> {
  const tree = await listWorkspaceFiles(ws).catch(() => []);
  const out: { path: string; content: string }[] = [];
  for (const f of tree) {
    if (out.length >= MAX_FILES) break;
    if (f.path.startsWith("build/") || f.path.startsWith(".godot/")) continue;
    const content = await readWorkspaceFile(ws, f.path).catch(() => null);
    if (content === null || content.length > MAX_FILE_CHARS) continue;
    out.push({ path: f.path, content });
  }
  return out;
}

/** Stable content hash of a project — an unchanged project reuses its build. */
export function hashProject(files: { path: string; content: string }[]): string {
  const h = createHash("sha256");
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(f.path).update("\0").update(f.content).update("\0");
  }
  return h.digest("hex").slice(0, 32);
}

async function writeFilesToProject(sbx: Sbx, files: { path: string; content: string }[]): Promise<void> {
  if (files.length === 0) return;
  await sbx.writeFiles(files.map((f) => ({ path: `${PROJECT}/${f.path}`, content: Buffer.from(f.content, "utf8") })));
}

/** Read the published runtime manifest (snapshot id + shared engine urls). */
export async function readRuntime(): Promise<GodotRuntime | null> {
  const url = await findArtifactUrl(RUNTIME_PREFIX).catch(() => null);
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as GodotRuntime;
  } catch {
    return null;
  }
}

/**
 * One-time (admin): install Godot + the web export templates, snapshot the
 * toolchain, then publish the shared engine runtime to blob. Returns the
 * runtime manifest (also persisted to blob for the build worker).
 */
export async function primeGodot(onLog: GodotLog): Promise<GodotRuntime> {
  onLog("Starting a sandbox…");
  const sbx = await Sandbox.create({ runtime: "node24", timeout: 14 * 60 * 1000, resources: { vcpus: 4 } });
  onLog("✓ sandbox ready");
  try {
    onLog(`Downloading Godot ${GODOT_VERSION}…`);
    if ((await sh(sbx, `mkdir -p ${HOME}/godot && curl -fsSL -o ${HOME}/g.zip ${EDITOR_ZIP}`, onLog, 300_000)) !== 0)
      throw new Error("failed to download the Godot editor");
    if (
      (await sh(
        sbx,
        `cd ${HOME}/godot && unzip -oq ${HOME}/g.zip && mv Godot_v4.3-stable_linux.x86_64 godot && chmod +x godot`,
        onLog,
        120_000,
      )) !== 0
    )
      throw new Error("failed to unpack the Godot editor");

    onLog("Installing the web export templates…");
    if ((await sh(sbx, `curl -fsSL -o ${HOME}/t.tpz ${TEMPLATES_TPZ}`, onLog, 300_000)) !== 0)
      throw new Error("failed to download export templates");
    if (
      (await sh(
        sbx,
        `mkdir -p ${DATA}/godot/export_templates/${TEMPLATE_TAG} && cd ${HOME} && unzip -oq t.tpz && ` +
          `mv templates/* ${DATA}/godot/export_templates/${TEMPLATE_TAG}/`,
        onLog,
        120_000,
      )) !== 0
    )
      throw new Error("failed to install export templates");

    onLog("Snapshotting the toolchain (cached for fast builds)…");
    const snap = await sbx.snapshot({ expiration: 7 * 24 * 60 * 60 * 1000 });

    // Export the starter once to capture the shared engine runtime.
    onLog("Building the shared engine runtime…");
    const tpl = await getTemplate("game-godot");
    if (!tpl) throw new Error("game-godot template missing");
    await writeFilesToProject(sbx, tpl.files);
    await sh(sbx, `mkdir -p ${PROJECT}/build`, onLog, 30_000);
    await sh(sbx, `cd ${PROJECT} && XDG_DATA_HOME=${DATA} ${GODOT} --headless --import || true`, onLog, 120_000);
    if (
      (await sh(
        sbx,
        `cd ${PROJECT} && XDG_DATA_HOME=${DATA} ${GODOT} --headless --export-release Web build/index.html`,
        onLog,
        180_000,
      )) !== 0
    )
      throw new Error("engine export failed");

    const engine: Record<string, string> = {};
    for (const [name, src] of Object.entries(ENGINE_MAP)) {
      const buf = await sbx.readFileToBuffer({ path: `${PROJECT}/build/${src}` }).catch(() => null);
      if (!buf) {
        onLog(`  (note: ${src} not produced — skipping)`);
        continue;
      }
      engine[name] = await putArtifact(`godot-runtime/${GODOT_VERSION}/${name}`, buf, contentType(name));
      onLog(`  published ${name} (${Math.round(buf.length / 1024)} KB)`);
    }
    if (!engine["godot.wasm"] || !engine["godot.js"]) throw new Error("engine runtime incomplete (no wasm/js)");

    const runtime: GodotRuntime = { version: GODOT_VERSION, snapshotId: snap.snapshotId, engine };
    await putJson(RUNTIME_PREFIX, runtime);
    onLog("✓ Godot runtime primed and published");
    return runtime;
  } finally {
    await sbx.stop().catch(() => {});
  }
}

/**
 * Per build: restore the primed toolchain snapshot, write the project, export
 * ONLY the per-game pack, and upload it. Returns the pack's blob url.
 */
export async function exportGodot(
  ws: Workspace,
  files: { path: string; content: string }[],
  onLog: GodotLog,
): Promise<{ pckUrl: string; runtime: string }> {
  const runtime = await readRuntime();
  if (!runtime) throw new Error("Godot isn't set up on the server yet — an admin needs to prime it first.");

  onLog("Starting the build sandbox…");
  const sbx = await Sandbox.create({
    source: { type: "snapshot", snapshotId: runtime.snapshotId },
    timeout: 6 * 60 * 1000,
    resources: { vcpus: 4 },
  });
  onLog("✓ sandbox ready");
  try {
    onLog("Writing your project…");
    await sh(sbx, `rm -rf ${PROJECT} && mkdir -p ${PROJECT}/build`, onLog, 30_000);
    await writeFilesToProject(sbx, files);
    await sh(sbx, `cd ${PROJECT} && XDG_DATA_HOME=${DATA} ${GODOT} --headless --import || true`, onLog, 120_000);

    onLog("Compiling…");
    if (
      (await sh(
        sbx,
        `cd ${PROJECT} && XDG_DATA_HOME=${DATA} ${GODOT} --headless --export-pack Web build/game.pck`,
        onLog,
        180_000,
      )) !== 0
    )
      throw new Error("the export failed — check your game for errors");

    const buf = await sbx.readFileToBuffer({ path: `${PROJECT}/build/game.pck` }).catch(() => null);
    if (!buf || buf.length === 0) throw new Error("the build produced no game pack");
    const pckUrl = await putArtifact(`godot-builds/${ws.id}/game.pck`, buf, "application/octet-stream");
    onLog(`✓ build ready (${Math.round(buf.length / 1024)} KB)`);
    return { pckUrl, runtime: runtime.version };
  } finally {
    await sbx.stop().catch(() => {});
  }
}

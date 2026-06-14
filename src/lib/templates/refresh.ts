import "server-only";

/**
 * Template refresh engine (the "batch job"). Regenerates the CLI-based starters
 * from their OWN official CLIs inside a Vercel Sandbox, re-applies our small
 * text-safety overlay, BUILD-GATES the result, and — only if it builds green —
 * upserts the fresh files into the DB `Template` table. Overlay-only templates
 * (no upstream CLI) are skipped. Streams human log lines via `onLog` so the
 * admin sees a live terminal.
 *
 * Never ships a broken starter: a red build leaves the stored template
 * untouched and records the error. The bundle stays as the seed/fallback.
 *
 * NOTE: the sandbox path needs the live Vercel env (OIDC) — verify with a real
 * admin run after deploy.
 */

import { Sandbox } from "@vercel/sandbox";
import { db } from "@/lib/db";
import { getAllTemplates, invalidateTemplatesCache } from "./store";
import type { TemplateFile } from "./types";

export type RefreshLog = (line: string) => void;

export interface RefreshSummary {
  updated: string[];
  failed: { id: string; reason: string }[];
  remaining: string[];
}

/** Helix-specific files re-applied after the CLI runs (kept text-safe + our
 * notes), pulled from the CURRENT stored template so there's no duplication. */
const OVERLAY: Record<string, { keep: string[]; remove: string[] }> = {
  "nextjs-app": { keep: ["AGENTS.md"], remove: ["CLAUDE.md", "app/favicon.ico"] },
  "vite-spa": {
    keep: ["src/App.tsx", "src/App.css", "src/index.css", "index.html"],
    remove: ["src/assets/hero.png", "src/assets/react.svg", "src/assets/vite.svg"],
  },
};

export const HOME = "/vercel/sandbox";
const TEXT_EXT = new Set([
  ".html", ".css", ".scss", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".jsonc",
  ".md", ".txt", ".py", ".vue", ".svelte", ".svg", ".yml", ".yaml", ".env", ".sh",
]);
const ALLOW_DOTFILES = new Set([".gitignore", ".env.example", ".npmrc", ".nvmrc"]);
const MAX_FILE_CHARS = 48_000;
const MAX_FILES = 400;

export function isText(name: string): boolean {
  if (ALLOW_DOTFILES.has(name)) return true;
  const dot = name.lastIndexOf(".");
  return dot >= 0 && TEXT_EXT.has(name.slice(dot).toLowerCase());
}

export type Sbx = Awaited<ReturnType<typeof Sandbox.create>>;

/** Run a shell command in `dir`, stream a tail of its output, return exit code. */
export async function step(sbx: Sbx, dir: string, cmd: string, onLog: RefreshLog, timeoutMs: number): Promise<number> {
  const res = await sbx.runCommand({ cmd: "sh", args: ["-c", `cd ${dir} && ${cmd}`], timeoutMs });
  const [out, err] = await Promise.all([res.stdout(), res.stderr()]);
  const tail = (out + (err ? "\n" + err : "")).trim().split("\n").slice(-12);
  for (const l of tail) if (l.trim()) onLog("  " + l);
  return res.exitCode;
}

/** Read the generated project back out as text files (skip binary/junk). */
export async function readProject(sbx: Sbx, dir: string): Promise<TemplateFile[]> {
  const listed = await sbx.runCommand({
    cmd: "sh",
    args: [
      "-c",
      `cd ${dir} && find . -type f -not -path './node_modules/*' -not -path './.git/*' ` +
        `-not -path './dist/*' -not -path './.next/*' -not -path './build/*' -not -path './out/*' ` +
        `-not -path './__pycache__/*' ` +
        `-not -name package-lock.json -not -name pnpm-lock.yaml -not -name yarn.lock | sed 's|^\\./||'`,
    ],
  });
  const paths = (await listed.stdout()).split("\n").map((p) => p.trim()).filter(Boolean);
  const files: TemplateFile[] = [];
  for (const p of paths) {
    if (files.length >= MAX_FILES) break;
    const base = p.split("/").pop() ?? p;
    if (!isText(base)) continue;
    const buf = await sbx.readFileToBuffer({ path: `${dir}/${p}` }).catch(() => null);
    if (!buf || buf.includes(0)) continue;
    const content = buf.toString("utf8").replace(/\r\n/g, "\n");
    if (content.length > MAX_FILE_CHARS) continue;
    files.push({ path: p, content });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

/**
 * Refresh all CLI templates that fit in the time budget (oldest first). Each
 * step is build-gated; the DB is only updated on green. Returns what changed.
 */
export async function refreshTemplates(opts: {
  onLog: RefreshLog;
  deadline: number; // Date.now() cutoff — stop starting new templates past this
}): Promise<RefreshSummary> {
  const { onLog, deadline } = opts;
  const summary: RefreshSummary = { updated: [], failed: [], remaining: [] };

  const templates = await getAllTemplates();
  // DB rows ordered oldest-refreshed-first so repeated runs make progress.
  const rows = await db()
    .template.findMany({ select: { templateId: true, refreshedAt: true }, orderBy: { refreshedAt: { sort: "asc", nulls: "first" } } })
    .catch(() => [] as { templateId: string; refreshedAt: Date | null }[]);
  const order = rows.length ? rows.map((r) => r.templateId) : Object.keys(templates);
  const cliIds = order.filter((id) => {
    const cli = templates[id]?.manifest.cli;
    return cli && cli !== "overlay-only";
  });

  if (cliIds.length === 0) {
    onLog("No CLI-based templates to refresh (the rest are hand-authored).");
    return summary;
  }

  onLog("Starting a sandbox…");
  let sbx: Sbx;
  try {
    sbx = await Sandbox.create({ runtime: "node24", timeout: 14 * 60 * 1000, resources: { vcpus: 4 } });
  } catch (e) {
    onLog(`✗ Couldn't start a sandbox: ${e instanceof Error ? e.message : "unknown error"}`);
    throw e;
  }
  onLog("✓ sandbox ready");

  try {
    for (const id of cliIds) {
      const remainingMs = deadline - Date.now();
      if (remainingMs < 150_000) {
        summary.remaining.push(id);
        continue;
      }
      const cli = templates[id].manifest.cli;
      const dir = `${HOME}/${id}`;
      onLog(`\n▶ ${id} — refreshing from: ${cli}`);
      await db().template.update({ where: { templateId: id }, data: { refreshState: "building" } }).catch(() => {});

      const stepTimeout = Math.min(remainingMs - 30_000, 6 * 60 * 1000);
      const fail = async (reason: string) => {
        onLog(`✗ ${id}: ${reason} — template left unchanged`);
        summary.failed.push({ id, reason });
        await db()
          .template.update({ where: { templateId: id }, data: { refreshState: "error", refreshError: reason } })
          .catch(() => {});
      };

      await step(sbx, HOME, `rm -rf ${dir} && mkdir -p ${dir}`, onLog, 30_000);
      if ((await step(sbx, dir, cli, onLog, stepTimeout)) !== 0) {
        await fail("CLI generation failed");
        continue;
      }

      // Re-apply our overlay (text-safe demo + project notes), then prune.
      const conf = OVERLAY[id];
      if (conf) {
        const keep = templates[id].files.filter((f) => conf.keep.includes(f.path));
        if (keep.length) {
          await sbx.writeFiles(keep.map((f) => ({ path: `${dir}/${f.path}`, content: Buffer.from(f.content, "utf8") })));
          onLog(`  applied overlay (${keep.map((f) => f.path).join(", ")})`);
        }
        if (conf.remove.length) await step(sbx, dir, `rm -rf ${conf.remove.join(" ")}`, onLog, 30_000);
      }

      if ((await step(sbx, dir, "npm install --no-audit --no-fund", onLog, stepTimeout)) !== 0) {
        await fail("npm install failed");
        continue;
      }
      if ((await step(sbx, dir, "npm run build", onLog, stepTimeout)) !== 0) {
        await fail("build failed (build-gate)");
        continue;
      }

      const files = await readProject(sbx, dir);
      if (files.length === 0) {
        await fail("no files read back");
        continue;
      }
      await db().template.update({
        where: { templateId: id },
        data: {
          files: files as unknown as object,
          source: "refresh",
          refreshState: "ok",
          refreshError: null,
          refreshedAt: new Date(),
        },
      });
      onLog(`✔ ${id} refreshed — build green, ${files.length} files`);
      summary.updated.push(id);
    }
  } finally {
    await sbx.stop().catch(() => {});
    invalidateTemplatesCache();
  }

  return summary;
}

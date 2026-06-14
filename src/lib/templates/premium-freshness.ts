import "server-only";

/**
 * Premium-library freshness job. The CLI-refresh job (refresh.ts) skips
 * overlay-only templates, so the premium skeletons are never version-checked.
 * This job fills that gap: for each premium template it bumps its libraries to
 * the latest SAFE version (same-major minor/patch; majors held for admin review),
 * BUILD-GATES the result, and — only on green — auto-applies it to the stored
 * template. Red builds keep the current template untouched (anti-corruption).
 * Every premium template is also build/render-verified each cycle even when no
 * bump is available (rot detection).
 *
 * Reuses refresh.ts's Sandbox primitives. Needs the live Vercel env (OIDC) — the
 * sandbox execution must be verified with a real admin run; the pure planning
 * logic (version-check.ts) + registry lookups are unit-tested.
 */

import { Sandbox } from "@vercel/sandbox";
import { db } from "@/lib/db";
import { getAllTemplates, invalidateTemplatesCache } from "./store";
import { HOME, step, readProject, type Sbx, type RefreshLog } from "./refresh";
import type { Template, TemplateFile } from "./types";
import {
  parseExactNpmDeps,
  planNpmBumps,
  applyNpmBumps,
  extractCdnLibs,
  planCdnBumps,
  applyCdnBumps,
  type BumpPlan,
} from "./version-check";
import { fetchLatestNpmMany, urlExists } from "./registry-versions";

export interface FreshnessSummary {
  bumped: string[]; // templates whose libraries were updated (green)
  verified: string[]; // templates re-verified with no bump available
  held: string[]; // templates with a major held for review
  failed: { id: string; reason: string }[];
  remaining: string[];
}

/** Which premium templates this job manages, and how to build-gate each. A
 * `build` command means "build-based" (real gate); null means "CDN-based"
 * (no build — verified by checking the rewritten CDN URLs exist). */
const VERIFY: Record<string, { kind: "npm" | "python" | "cdn"; build?: string }> = {
  "nextjs-premium": { kind: "npm", build: "npm install --no-audit --no-fund && npm run build" },
  "express-premium": { kind: "npm", build: "npm install --no-audit --no-fund && node --check src/server.js" },
  "flask-premium": { kind: "python", build: "pip install -q -r requirements.txt && python -c \"from app import create_app; create_app()\"" },
  "django-premium": { kind: "python", build: "pip install -q -r requirements.txt && python manage.py check" },
  "static-premium": { kind: "cdn" },
  "game-2d-premium": { kind: "cdn" },
  "game-3d-premium": { kind: "cdn" },
};

function libraryState(plan: BumpPlan, applied: boolean) {
  const state: Record<string, unknown> = { checkedAt: new Date().toISOString(), applied };
  state.bumped = plan.bumps.map((b) => ({ name: b.name, from: b.from, to: b.to }));
  state.held = plan.held.map((h) => ({ name: h.name, from: h.from, latest: h.latest }));
  return state;
}

/** Write a template's files into a fresh sandbox dir. */
async function writeTemplate(sbx: Sbx, dir: string, files: TemplateFile[], onLog: RefreshLog) {
  await step(sbx, HOME, `rm -rf ${dir} && mkdir -p ${dir}`, onLog, 30_000);
  await sbx.writeFiles(files.map((f) => ({ path: `${dir}/${f.path}`, content: Buffer.from(f.content, "utf8") })));
}

/** CDN-based: bump versioned CDN URLs, confirm each rewritten URL exists, apply. */
async function freshenCdn(
  tpl: Template,
  onLog: RefreshLog,
  includeMajors: boolean,
): Promise<{ files: TemplateFile[] | null; plan: BumpPlan }> {
  const libs = extractCdnLibs(tpl.files);
  const latest = await fetchLatestNpmMany(libs.map((l) => l.lib));
  const plan = planCdnBumps(libs, latest, { includeMajors });
  if (plan.bumps.length === 0) return { files: null, plan };

  // Guard: every rewritten CDN version must actually resolve (no 404).
  for (const b of plan.bumps) {
    const ok = await urlExists(`https://cdn.jsdelivr.net/npm/${b.name}@${b.to}/`);
    if (!ok) {
      onLog(`  · ${b.name}@${b.to} not reachable on the CDN — skipping that bump`);
      plan.bumps = plan.bumps.filter((x) => x.name !== b.name);
    }
  }
  if (plan.bumps.length === 0) return { files: null, plan };

  const files = tpl.files.map((f) => ({ path: f.path, content: applyCdnBumps(f.content, plan.bumps) }));
  return { files, plan };
}

export async function runPremiumFreshness(opts: {
  onLog: RefreshLog;
  deadline: number;
  /** Apply (not hold) the major bumps for this one template — admin "approve". */
  includeMajorsFor?: string;
}): Promise<FreshnessSummary> {
  const { onLog, deadline, includeMajorsFor } = opts;
  const summary: FreshnessSummary = { bumped: [], verified: [], held: [], failed: [], remaining: [] };

  const templates = await getAllTemplates();
  const rows = await db()
    .template.findMany({
      select: { templateId: true, libraryCheckedAt: true },
      orderBy: { libraryCheckedAt: { sort: "asc", nulls: "first" } },
    })
    .catch(() => [] as { templateId: string; libraryCheckedAt: Date | null }[]);
  const order = rows.length ? rows.map((r) => r.templateId) : Object.keys(templates);
  const ids = order.filter((id) => VERIFY[id] && templates[id]);
  if (ids.length === 0) {
    onLog("No premium templates to check.");
    return summary;
  }

  // CDN-only templates need no sandbox; build-based ones do. Start a sandbox lazily.
  let sbx: Sbx | undefined;
  const ensureSandbox = async (): Promise<Sbx> => {
    if (!sbx) {
      onLog("Starting a sandbox…");
      sbx = await Sandbox.create({ runtime: "node24", timeout: 14 * 60 * 1000, resources: { vcpus: 4 } });
      onLog("✓ sandbox ready");
    }
    return sbx;
  };

  const recordError = async (id: string, reason: string) => {
    onLog(`✗ ${id}: ${reason} — template left unchanged`);
    summary.failed.push({ id, reason });
    await db()
      .template.update({ where: { templateId: id }, data: { freshnessError: reason, libraryCheckedAt: new Date() } })
      .catch(() => {});
  };

  try {
    for (const id of ids) {
      if (deadline - Date.now() < 150_000) {
        summary.remaining.push(id);
        continue;
      }
      const cfg = VERIFY[id];
      const tpl = templates[id];
      const includeMajors = includeMajorsFor === id;
      onLog(`\n▶ ${id} (${cfg.kind})${includeMajors ? " — including major bumps (approved)" : ""}`);

      try {
        if (cfg.kind === "cdn") {
          const { files, plan } = await freshenCdn(tpl, onLog, includeMajors);
          if (plan.held.length) summary.held.push(id);
          if (!files) {
            onLog(`  up to date (no safe CDN bump)`);
            summary.verified.push(id);
          } else {
            // Guard against a corrupted readback: file count must match.
            if (files.length !== tpl.files.length) {
              await recordError(id, "file-count mismatch after CDN bump");
              continue;
            }
            await db().template.update({
              where: { templateId: id },
              data: { files: files as unknown as object, source: "freshness" },
            });
            onLog(`  ✔ bumped ${plan.bumps.map((b) => `${b.name}→${b.to}`).join(", ")}`);
            summary.bumped.push(id);
          }
          await db()
            .template.update({
              where: { templateId: id },
              data: { libraryState: libraryState(plan, Boolean(files)) as unknown as object, libraryCheckedAt: new Date(), freshnessError: null },
            })
            .catch(() => {});
          continue;
        }

        // Build-based (npm / python).
        const box = await ensureSandbox();
        const dir = `${HOME}/${id}`;
        const stepTimeout = Math.min(deadline - Date.now() - 30_000, 6 * 60 * 1000);

        let plan: BumpPlan = { bumps: [], held: [] };
        let files = tpl.files;
        if (cfg.kind === "npm") {
          const pkg = tpl.files.find((f) => f.path === "package.json");
          if (pkg) {
            const deps = parseExactNpmDeps(pkg.content);
            const latest = await fetchLatestNpmMany(deps.map((d) => d.name));
            plan = planNpmBumps(deps, latest, { includeMajors });
            if (plan.bumps.length) {
              files = tpl.files.map((f) =>
                f.path === "package.json" ? { path: f.path, content: applyNpmBumps(f.content, plan.bumps) } : f,
              );
            }
          }
        }
        if (plan.held.length) summary.held.push(id);

        await db().template.update({ where: { templateId: id }, data: { refreshState: "building" } }).catch(() => {});
        await writeTemplate(box, dir, files, onLog);

        if (!cfg.build) {
          await recordError(id, "no build command configured");
          continue;
        }
        const code = await step(box, dir, cfg.build, onLog, stepTimeout);
        if (code !== 0) {
          // Build-gate red → keep the current template, record which bump broke it.
          await recordError(id, plan.bumps.length ? `build failed after bump (${plan.bumps.map((b) => b.name).join(", ")})` : "build failed (rot)");
          continue;
        }

        if (plan.bumps.length === 0) {
          onLog(`  ✔ verified, up to date`);
          summary.verified.push(id);
        } else {
          // Read back (npm may have rewritten lockfiles etc.; we keep our text files).
          const readBack = await readProject(box, dir).catch(() => files);
          // Corruption guard: the file set shouldn't shrink unexpectedly.
          const finalFiles = readBack.length >= tpl.files.length - 1 ? readBack : files;
          await db().template.update({
            where: { templateId: id },
            data: { files: finalFiles as unknown as object, source: "freshness" },
          });
          onLog(`  ✔ bumped + green: ${plan.bumps.map((b) => `${b.name}→${b.to}`).join(", ")}`);
          summary.bumped.push(id);
        }
        await db()
          .template.update({
            where: { templateId: id },
            data: {
              libraryState: libraryState(plan, plan.bumps.length > 0) as unknown as object,
              libraryCheckedAt: new Date(),
              refreshState: "ok",
              freshnessError: null,
            },
          })
          .catch(() => {});
      } catch (e) {
        await recordError(id, e instanceof Error ? e.message : "unknown error");
      }
    }
  } finally {
    if (sbx) await sbx.stop().catch(() => {});
    invalidateTemplatesCache();
  }

  return summary;
}

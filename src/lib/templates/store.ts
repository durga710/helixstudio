import "server-only";

/**
 * The single read path for scaffold templates. Prefers the DB `Template` table
 * (so the admin refresh job's updates go live without a redeploy); lazily seeds
 * that table from the bundled registry on first read; falls back to the bundle
 * when there's no DB or on any error. A short in-process cache keeps this off
 * the critical path of workspace creation.
 */

import { db, dbEnabled, schemaReady } from "@/lib/db";
import { TEMPLATES as BUNDLED } from "./registry.generated";
import type { Template, TemplateManifest, TemplateFile } from "./types";

const CACHE_TTL_MS = 30_000;
const cache = globalThis as unknown as {
  __helixTemplates?: { at: number; data: Record<string, Template> };
};

/** Drop the cache (call after the refresh job upserts new template data). */
export function invalidateTemplatesCache(): void {
  cache.__helixTemplates = undefined;
}

function fromRows(rows: { templateId: string; manifest: unknown; files: unknown }[]): Record<string, Template> {
  const out: Record<string, Template> = {};
  for (const r of rows) {
    out[r.templateId] = { manifest: r.manifest as TemplateManifest, files: r.files as TemplateFile[] };
  }
  return out;
}

/**
 * Reconcile the DB with the bundled registry and return the canonical templates:
 *   - INSERT any bundled templates the DB doesn't have yet (first-boot seed);
 *   - UPDATE rows still sourced from the bundle whose content has drifted from
 *     the repo (so a template edit goes live on deploy) — rows the freshness job
 *     has since updated (source !== "bundle") are left untouched.
 */
async function syncBundle(): Promise<Record<string, Template>> {
  const rows = await db().template.findMany({
    select: { templateId: true, manifest: true, files: true, source: true },
  });
  const byId = new Map(rows.map((r) => [r.templateId, r]));

  const inserts: { templateId: string; manifest: object; files: object; source: string }[] = [];
  const drifted = new Set<string>();
  for (const t of Object.values(BUNDLED)) {
    const row = byId.get(t.manifest.id);
    if (!row) {
      inserts.push({
        templateId: t.manifest.id,
        manifest: t.manifest as unknown as object,
        files: t.files as unknown as object,
        source: "bundle",
      });
    } else if (
      row.source === "bundle" &&
      (JSON.stringify(row.files) !== JSON.stringify(t.files) ||
        JSON.stringify(row.manifest) !== JSON.stringify(t.manifest))
    ) {
      drifted.add(t.manifest.id);
    }
  }

  if (inserts.length) await db().template.createMany({ data: inserts, skipDuplicates: true });
  if (drifted.size) {
    await Promise.all(
      [...drifted].map((id) =>
        db().template.update({
          where: { templateId: id },
          data: {
            manifest: BUNDLED[id].manifest as unknown as object,
            files: BUNDLED[id].files as unknown as object,
          },
        }),
      ),
    );
  }

  // Canonical map: stored rows, with the bundle overlaid for inserted/drifted ids.
  const out = fromRows(rows);
  for (const t of Object.values(BUNDLED)) {
    if (!byId.has(t.manifest.id) || drifted.has(t.manifest.id)) {
      out[t.manifest.id] = { manifest: t.manifest, files: t.files };
    }
  }
  return Object.keys(out).length ? out : BUNDLED;
}

export async function getAllTemplates(): Promise<Record<string, Template>> {
  const hit = cache.__helixTemplates;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  if (!dbEnabled()) return BUNDLED;

  try {
    await schemaReady();
    const data = await syncBundle();
    cache.__helixTemplates = { at: Date.now(), data };
    return data;
  } catch {
    // DB hiccup — the bundle is always a correct fallback.
    return BUNDLED;
  }
}

export async function getTemplate(id: string): Promise<Template | undefined> {
  return (await getAllTemplates())[id];
}

export async function getTemplateIds(): Promise<string[]> {
  return Object.keys(await getAllTemplates());
}

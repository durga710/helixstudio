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

/** Insert any bundled templates the DB doesn't have yet (first-boot seed). */
async function seedMissing(): Promise<void> {
  const existing = await db().template.findMany({ select: { templateId: true } });
  const have = new Set(existing.map((r) => r.templateId));
  const missing = Object.values(BUNDLED).filter((t) => !have.has(t.manifest.id));
  if (missing.length === 0) return;
  await db().template.createMany({
    data: missing.map((t) => ({
      templateId: t.manifest.id,
      manifest: t.manifest as unknown as object,
      files: t.files as unknown as object,
      source: "bundle",
    })),
    skipDuplicates: true,
  });
}

export async function getAllTemplates(): Promise<Record<string, Template>> {
  const hit = cache.__helixTemplates;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  if (!dbEnabled()) return BUNDLED;

  try {
    await schemaReady();
    await seedMissing();
    const rows = await db().template.findMany({ select: { templateId: true, manifest: true, files: true } });
    const data = rows.length ? fromRows(rows) : BUNDLED;
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

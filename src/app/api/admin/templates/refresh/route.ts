/**
 * Admin-only template refresh ("batch job").
 *   POST → run the refresh, STREAMING NDJSON log events so the admin watches a
 *          live terminal: { type:"log", line } … then { type:"done", summary }.
 *   GET  → per-template refresh status (for the status list + zombie sweep).
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guardAdmin } from "@/lib/route-helpers";
import { refreshTemplates } from "@/lib/templates/refresh";
import { getAllTemplates } from "@/lib/templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const g = await guardAdmin();
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");

  const encoder = new TextEncoder();
  const deadline = Date.now() + 280_000; // leave headroom under maxDuration
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };
      void (async () => {
        write({ type: "log", line: `▶ Template refresh started by ${g.admin.email}` });
        try {
          const summary = await refreshTemplates({ onLog: (line) => write({ type: "log", line }), deadline });
          const tail =
            `\nDone — ${summary.updated.length} updated` +
            (summary.failed.length ? `, ${summary.failed.length} failed` : "") +
            (summary.remaining.length ? `, ${summary.remaining.length} left (run again)` : "") +
            ".";
          write({ type: "log", line: tail });
          write({ type: "done", summary });
        } catch (e) {
          write({ type: "log", line: `✗ ${e instanceof Error ? e.message : "refresh failed"}` });
          write({ type: "done", summary: { updated: [], failed: [], remaining: [] }, error: true });
        } finally {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET() {
  const g = await guardAdmin();
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");

  // Zombie sweep: a 'building' row older than 10m means the function died mid-run.
  await db()
    .template.updateMany({
      where: { refreshState: "building", updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
      data: { refreshState: "error", refreshError: "timed out" },
    })
    .catch(() => {});

  const templates = await getAllTemplates();
  const rows = await db().template.findMany({
    select: { templateId: true, source: true, refreshState: true, refreshError: true, refreshedAt: true },
    orderBy: { templateId: "asc" },
  });
  const items = rows.map((r) => ({
    templateId: r.templateId,
    label: templates[r.templateId]?.manifest.label ?? r.templateId,
    cli: templates[r.templateId]?.manifest.cli ?? "",
    refreshable: Boolean(templates[r.templateId]?.manifest.cli && templates[r.templateId]?.manifest.cli !== "overlay-only"),
    source: r.source,
    refreshState: r.refreshState,
    refreshError: r.refreshError,
    refreshedAt: r.refreshedAt,
  }));
  return ok({ templates: items });
}

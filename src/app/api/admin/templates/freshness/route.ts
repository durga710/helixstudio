/**
 * Admin-only premium-library freshness job.
 *   POST → run it, STREAMING NDJSON log events for a live terminal:
 *          { type:"log", line } … then { type:"done", summary }.
 *   GET  → per-template library state (pinned→latest, held majors) + zombie sweep.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guardAdmin } from "@/lib/route-helpers";
import { runPremiumFreshness } from "@/lib/templates/premium-freshness";
import { getAllTemplates } from "@/lib/templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const g = await guardAdmin();
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");

  // Optional: approve (apply) the held major bumps for ONE template.
  const body = (await req.json().catch(() => null)) as { approveMajorFor?: string } | null;
  const includeMajorsFor = typeof body?.approveMajorFor === "string" ? body.approveMajorFor : undefined;

  const encoder = new TextEncoder();
  const deadline = Date.now() + 280_000;
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
        write({ type: "log", line: `▶ Premium-library freshness started by ${g.admin.email}` });
        try {
          const summary = await runPremiumFreshness({ onLog: (line) => write({ type: "log", line }), deadline, includeMajorsFor });
          const tail =
            `\nDone — ${summary.bumped.length} bumped, ${summary.verified.length} verified` +
            (summary.held.length ? `, ${summary.held.length} with held majors` : "") +
            (summary.failed.length ? `, ${summary.failed.length} failed` : "") +
            (summary.remaining.length ? `, ${summary.remaining.length} left (run again)` : "") +
            ".";
          write({ type: "log", line: tail });
          write({ type: "done", summary });
        } catch (e) {
          write({ type: "log", line: `✗ ${e instanceof Error ? e.message : "freshness failed"}` });
          write({ type: "done", summary: { bumped: [], verified: [], held: [], failed: [], remaining: [] }, error: true });
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

  // Zombie sweep: a 'building' row older than 10m means a run died mid-flight.
  await db()
    .template.updateMany({
      where: { refreshState: "building", updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
      data: { refreshState: "error", refreshError: "timed out" },
    })
    .catch(() => {});

  const templates = await getAllTemplates();
  const rows = await db().template.findMany({
    select: { templateId: true, libraryState: true, libraryCheckedAt: true, freshnessError: true, source: true },
    orderBy: { templateId: "asc" },
  });
  // Premium templates are the overlay-only ones the freshness job manages.
  const items = rows
    .filter((r) => templates[r.templateId]?.manifest.cli === "overlay-only")
    .map((r) => ({
      templateId: r.templateId,
      label: templates[r.templateId]?.manifest.label ?? r.templateId,
      source: r.source,
      libraryState: r.libraryState,
      libraryCheckedAt: r.libraryCheckedAt,
      freshnessError: r.freshnessError,
    }));
  return ok({ templates: items });
}

/**
 * /api/admin/usage/export — GET: AI usage history as CSV (admin only).
 *   ?userId=…   limit to one user (omit = all users)
 *   ?days=N     window, default 90, max 365 (history is pruned at ~90 anyway)
 * Capped at 10,000 rows, newest first. Deleted users cascade their events,
 * so the export only ever covers existing accounts.
 */

import { db, dbEnabled } from "@/lib/db";
import { apiErrors } from "@/lib/api-response";
import { guardAdmin } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROW_CAP = 10_000;

/** Quote-escape + neutralize spreadsheet formula injection (emails and model
 * names are user-influenced). */
function csvCell(v: string): string {
  const s = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const g = await guardAdmin();
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured (demo mode).");

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || undefined;
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 90));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = await db().aiUsageEvent.findMany({
    where: { ...(userId ? { userId } : {}), createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: ROW_CAP,
    select: {
      createdAt: true,
      kind: true,
      provider: true,
      model: true,
      tokens: true,
      workspaceId: true,
      user: { select: { email: true, id: true } },
    },
  });

  const header = "createdAt,userEmail,kind,provider,model,workspaceId,tokens";
  const rows = events.map((e) =>
    [
      e.createdAt.toISOString(),
      csvCell(e.user.email ?? e.user.id),
      csvCell(e.kind),
      csvCell(e.provider),
      csvCell(e.model),
      csvCell(e.workspaceId ?? ""),
      String(e.tokens),
    ].join(","),
  );
  const csv = [header, ...rows].join("\r\n") + "\r\n";

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="helix-usage-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

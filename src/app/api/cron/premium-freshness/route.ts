/**
 * Weekly cron: premium-library freshness. Wired in vercel.json `crons`; Vercel
 * invokes it with `Authorization: Bearer $CRON_SECRET`. Resumable — a single run
 * can't finish every template in 300s, and oldest-libraryCheckedAt-first ordering
 * means successive weekly runs converge. Shares the engine with the admin trigger.
 */

import { timingSafeEqual } from "node:crypto";
import { dbEnabled } from "@/lib/db";
import { runPremiumFreshness } from "@/lib/templates/premium-freshness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  if (!dbEnabled()) return Response.json({ ok: false, error: "no database" });

  const deadline = Date.now() + 280_000;
  try {
    const summary = await runPremiumFreshness({ onLog: () => {}, deadline });
    return Response.json({ ok: true, summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

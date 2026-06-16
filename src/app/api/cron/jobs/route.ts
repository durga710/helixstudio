import { NextRequest } from "next/server";
import { findStuckJobIds } from "@/lib/jobs/store";
import { triggerNext } from "@/lib/jobs/driver";
import { schemaReady, dbEnabled } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Backstop drainer: re-triggers durable jobs whose slice chain dropped (stale
 * heartbeat). The primary driver is QStash / after()-chaining; this only rescues.
 * Wire it in vercel.json ("crons") at the finest cadence your plan allows once
 * QStash isn't the primary path. Auth: Vercel sets Authorization: Bearer CRON_SECRET. */

const STALE_MS = 90_000; // a healthy slice heartbeats every step, well under this

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!dbEnabled()) return Response.json({ ok: true, rescued: 0 });
  await schemaReady();
  const ids = await findStuckJobIds(STALE_MS, 5);
  for (const id of ids) triggerNext(id);
  return Response.json({ ok: true, rescued: ids.length });
}

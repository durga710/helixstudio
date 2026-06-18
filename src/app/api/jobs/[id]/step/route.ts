import { NextRequest } from "next/server";
import { runJobSlice } from "@/lib/jobs/store";
import { triggerNext, jobsSecret, SLICE_DEADLINE_MS } from "@/lib/jobs/driver";
import { schemaReady } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* One durable-job slice. Invoked by the driver (QStash or after()-chaining) with
 * a shared secret. Runs steps until the slice deadline, then chains the next
 * slice if the job isn't finished. Idempotent: re-invoking a finished job no-ops. */

function reqOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (req.headers.get("authorization") !== `Bearer ${jobsSecret()}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const { id } = await params;
  await schemaReady();
  const res = await runJobSlice(id, Date.now() + SLICE_DEADLINE_MS);
  if (!res.done) triggerNext(id, reqOrigin(req)); // resume in a fresh invocation
  return Response.json({ ok: true, ...res });
}

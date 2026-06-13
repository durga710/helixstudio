import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { deleteMemory, store, upsertMemory } from "@/lib/store";

/**
 * Project/user memory — the entries shown in Settings → Memory. Backed by the
 * real MemoryEntry table when a database is configured (scoped to the signed-in
 * user); falls back to the in-memory demo store only in no-DB demo mode.
 *
 * Goes through guard() like every other route: enforces suspension + rate
 * limits and returns the standard ok()/apiErrors envelope.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  id: z.string().optional(),
  scope: z.enum(["user", "project", "agent"]),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(2000),
});

type Scope = "user" | "project" | "agent";
const toDb = (s: Scope) => s.toUpperCase() as "USER" | "PROJECT" | "AGENT";
const fromDb = (s: string): Scope => s.toLowerCase() as Scope;

type WireEntry = { id: string; scope: Scope; title: string; content: string; updatedAt: string };
function wire(r: { id: string; scope: string; title: string; content: string; updatedAt: Date }): WireEntry {
  return { id: r.id, scope: fromDb(r.scope), title: r.title, content: r.content, updatedAt: r.updatedAt.toISOString() };
}

export async function GET() {
  const g = await guard("memory", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  if (!dbEnabled()) return ok({ memory: store().memory });
  const rows = await db().memoryEntry.findMany({
    where: { userId: g.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, scope: true, title: true, content: true, updatedAt: true },
  });
  return ok({ memory: rows.map(wire) });
}

export async function POST(req: Request) {
  const g = await guard("memory", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { id, scope, title, content } = parsed.data;

  if (!dbEnabled()) return ok({ entry: upsertMemory(parsed.data) });

  if (id) {
    // Guard ownership before editing an existing entry.
    const existing = await db().memoryEntry.findFirst({ where: { id, userId: g.user.id }, select: { id: true } });
    if (!existing) return apiErrors.notFound("Memory entry");
    const entry = await db().memoryEntry.update({ where: { id }, data: { scope: toDb(scope), title, content } });
    return ok({ entry: wire(entry) });
  }
  const entry = await db().memoryEntry.create({
    data: { userId: g.user.id, scope: toDb(scope), title, content },
  });
  return ok({ entry: wire(entry) });
}

export async function DELETE(req: Request) {
  const g = await guard("memory", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return apiErrors.badRequest("id is required");

  if (!dbEnabled()) {
    if (!deleteMemory(id)) return apiErrors.notFound("Memory entry");
    return ok({ deleted: true });
  }
  const res = await db().memoryEntry.deleteMany({ where: { id, userId: g.user.id } });
  if (res.count === 0) return apiErrors.notFound("Memory entry");
  return ok({ deleted: true });
}

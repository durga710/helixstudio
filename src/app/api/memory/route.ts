import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, dbEnabled, schemaReady } from "@/lib/db";
import { deleteMemory, store, upsertMemory } from "@/lib/store";

/**
 * Project/user memory — the entries shown in Settings → Memory. Backed by the
 * real MemoryEntry table when a database is configured (scoped to the signed-in
 * user); falls back to the in-memory demo store only in no-DB demo mode.
 */

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
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!dbEnabled()) return Response.json({ memory: store().memory });
  await schemaReady();
  const rows = await db().memoryEntry.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, scope: true, title: true, content: true, updatedAt: true },
  });
  return Response.json({ memory: rows.map(wire) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid memory entry" }, { status: 400 });
  const { id, scope, title, content } = parsed.data;

  if (!dbEnabled()) return Response.json({ entry: upsertMemory(parsed.data) }, { status: 201 });
  await schemaReady();

  if (id) {
    // Guard ownership before editing an existing entry.
    const existing = await db().memoryEntry.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
    if (!existing) return Response.json({ error: "Entry not found" }, { status: 404 });
    const entry = await db().memoryEntry.update({ where: { id }, data: { scope: toDb(scope), title, content } });
    return Response.json({ entry: wire(entry) }, { status: 201 });
  }
  const entry = await db().memoryEntry.create({
    data: { userId: session.user.id, scope: toDb(scope), title, content },
  });
  return Response.json({ entry: wire(entry) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Entry not found" }, { status: 404 });

  if (!dbEnabled()) {
    if (!deleteMemory(id)) return Response.json({ error: "Entry not found" }, { status: 404 });
    return Response.json({ ok: true });
  }
  await schemaReady();
  const res = await db().memoryEntry.deleteMany({ where: { id, userId: session.user.id } });
  if (res.count === 0) return Response.json({ error: "Entry not found" }, { status: 404 });
  return Response.json({ ok: true });
}

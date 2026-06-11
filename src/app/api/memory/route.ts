import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deleteMemory, store, upsertMemory } from "@/lib/store";

export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  id: z.string().optional(),
  scope: z.enum(["user", "project", "agent"]),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(2000),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ memory: store().memory });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid memory entry" }, { status: 400 });
  return Response.json({ entry: upsertMemory(parsed.data) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !deleteMemory(id)) return Response.json({ error: "Entry not found" }, { status: 404 });
  return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { activeWorkspace, addActivity } from "@/lib/store";
import { languageFor } from "@/lib/repo/import";
import { buildTree } from "@/lib/repo/import";

export const dynamic = "force-dynamic";

/* Workspace file writes (Phase 4 — inline editing). Edits apply to the
 * active in-memory workspace; committing back to GitHub arrives with OAuth. */

const writeSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(300)
    .refine((p) => !p.includes("..") && !p.startsWith("/"), "Invalid path"),
  content: z.string().max(400_000),
});

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = writeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid file write" }, { status: 400 });

  const { path, content } = parsed.data;
  const ws = activeWorkspace();
  const existing = ws.files.find((f) => f.path === path);

  if (existing) {
    existing.content = content;
  } else {
    ws.files.push({ path, language: languageFor(path), content });
    ws.files.sort((a, b) => a.path.localeCompare(b.path));
    ws.tree = buildTree(ws.files);
  }

  addActivity({ kind: "task", text: existing ? "File edited:" : "File created:", highlight: path });
  return Response.json({ ok: true, created: !existing });
}

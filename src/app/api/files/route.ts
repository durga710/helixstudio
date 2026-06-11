import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { activeWorkspace, addActivity } from "@/lib/store";
import { languageFor } from "@/lib/repo/import";
import { buildTree } from "@/lib/repo/import";

export const dynamic = "force-dynamic";

/* Workspace file writes (Phase 4 — inline editing). Edits apply to the
 * active in-memory workspace; committing back to GitHub arrives with OAuth. */

const fileEntry = z.object({
  path: z
    .string()
    .min(1)
    .max(300)
    .refine((p) => !p.includes("..") && !p.startsWith("/"), "Invalid path"),
  content: z.string().max(400_000),
});

// Accepts a single write { path, content } or gcode's batch shape { files: [...] }.
const writeSchema = z.union([fileEntry, z.object({ files: z.array(fileEntry).min(1).max(200) })]);

function applyWrite(path: string, content: string): boolean {
  const ws = activeWorkspace();
  const existing = ws.files.find((f) => f.path === path);
  if (existing) {
    existing.content = content;
    return false;
  }
  ws.files.push({ path, language: languageFor(path), content });
  ws.files.sort((a, b) => a.path.localeCompare(b.path));
  ws.tree = buildTree(ws.files);
  return true;
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = writeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid file write" }, { status: 400 });

  const entries = "files" in parsed.data ? parsed.data.files : [parsed.data];
  let created = 0;
  for (const entry of entries) {
    if (applyWrite(entry.path, entry.content)) created += 1;
  }

  if (entries.length === 1) {
    addActivity({ kind: "task", text: created ? "File created:" : "File edited:", highlight: entries[0]!.path });
  } else {
    addActivity({ kind: "task", text: "Saved", highlight: `${entries.length} files` });
  }
  return Response.json({ ok: true, written: entries.length, created });
}

// gcode also POSTs file saves to its workspace route — accept the same here.
export const POST = PUT;

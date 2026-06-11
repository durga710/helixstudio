import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { addImportedProject, logAudit, setActiveProject, store } from "@/lib/store";
import { importGitHubRepo, RepoImportError } from "@/lib/repo/import";
import { analyzeRepo } from "@/lib/repo/analyze";

export const dynamic = "force-dynamic";

const importSchema = z.object({
  repoUrl: z
    .string()
    .trim()
    .min(4)
    .max(300)
    .transform((u) => u.replace(/^https?:\/\//, "").replace(/\.git$/, "").replace(/\/+$/, "")),
});

const activateSchema = z.object({ projectId: z.string().min(1) });

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ projects: store().projects, activeProjectId: store().activeProjectId });
}

/** Switch the active workspace (Editor / Analysis / search / terminal target). */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = activateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !setActiveProject(parsed.data.projectId)) {
    return Response.json({ error: "No indexed workspace for that project" }, { status: 404 });
  }
  return Response.json({ activeProjectId: parsed.data.projectId });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = importSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid repository URL" }, { status: 400 });

  const repoUrl = parsed.data.repoUrl;
  const match = /^github\.com\/([\w.-]+)\/([\w.-]+)$/i.exec(repoUrl);
  if (!match) {
    return Response.json({ error: "Expected github.com/owner/repo" }, { status: 400 });
  }
  const [, owner, repo] = match;

  try {
    // Real import: fetch the public tarball, parse text files, analyze (Phase 2).
    const imported = await importGitHubRepo(owner!, repo!);
    const analysis = analyzeRepo(`${repo}-pending`, repo!, imported.files);
    const langCounts = new Map<string, number>();
    for (const f of imported.files) {
      const lang = f.language === "TSX" ? "TypeScript" : f.language === "JSX" ? "JavaScript" : f.language;
      if (lang && !["Markdown", "JSON", "YAML", "Lockfile", "Text", "SVG"].includes(lang)) {
        langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
      }
    }
    const language = [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Code";

    const project = addImportedProject({
      name: repo!,
      repoUrl,
      language,
      workspace: { tree: imported.tree, files: imported.files, analysis },
    });
    logAudit(session.user.name ?? "user", "imported repository", repoUrl);
    return Response.json({ project, indexed: imported.files.length }, { status: 201 });
  } catch (e) {
    if (e instanceof RepoImportError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    return Response.json({ error: "Import failed — try again" }, { status: 500 });
  }
}

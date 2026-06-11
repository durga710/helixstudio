import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { addProject, logAudit, store } from "@/lib/store";

export const dynamic = "force-dynamic";

const importSchema = z.object({
  repoUrl: z
    .string()
    .trim()
    .min(4)
    .max(300)
    .transform((u) => u.replace(/^https?:\/\//, "").replace(/\.git$/, "").replace(/\/+$/, "")),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ projects: store().projects });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = importSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid repository URL" }, { status: 400 });

  const repoUrl = parsed.data.repoUrl;
  if (!/^github\.com\/[\w.-]+\/[\w.-]+$/i.test(repoUrl)) {
    return Response.json({ error: "Expected github.com/owner/repo" }, { status: 400 });
  }

  const name = repoUrl.split("/").pop()!;
  const project = addProject({ name, repoUrl });
  logAudit(session.user.name ?? "user", "imported repository", repoUrl);
  return Response.json({ project }, { status: 201 });
}

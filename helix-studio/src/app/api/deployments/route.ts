import { auth } from "@/lib/auth";
import { addActivity, logAudit, store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { environments, deployments } = store();
  return Response.json({ environments, deployments });
}

/** Deploy main — simulated build (the Vercel API integration point when VERCEL_TOKEN is set). */
export async function POST() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const s = store();
  const sha = Math.random().toString(16).slice(2, 9);
  const record = {
    id: `d-${sha}`,
    sha,
    message: "deploy: main via Helix",
    author: session.user.name ?? "user",
    state: "building" as const,
    at: new Date().toISOString(),
  };
  s.deployments.unshift(record);
  const preview = s.environments.find((e) => e.id === "preview");
  if (preview) {
    preview.state = "building";
    preview.commit = sha;
    preview.deployedAt = record.at;
  }
  logAudit(record.author, "deployed", `main ${sha}`);
  addActivity({ kind: "task", text: "Deployment started for", highlight: `main @ ${sha}` });
  return Response.json({ deployment: record }, { status: 201 });
}

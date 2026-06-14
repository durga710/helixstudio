/**
 * Premium: download the whole project as a zip with a one-command local setup.
 * Static projects get a generated package.json so `npm install && npm run dev`
 * serves them on localhost immediately; framework projects keep their own.
 *
 * Premium-gated (Pro/Team or admin) + owner-only.
 */

import JSZip from "jszip";
import { db, dbEnabled } from "@/lib/db";
import { apiErrors } from "@/lib/api-response";
import { guardWorkspace } from "@/lib/route-helpers";
import { isAdminEmail } from "@/lib/admin";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 800;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "helix-project";
}

function staticPackageJson(name: string): string {
  return (
    JSON.stringify(
      {
        name,
        private: true,
        version: "1.0.0",
        scripts: { dev: "serve .", start: "serve ." },
        devDependencies: { serve: "^14.2.4" },
      },
      null,
      2,
    ) + "\n"
  );
}

function readme(name: string, runCmd: string): string {
  return `# ${name}

Built with **Helix Studio**.

## Run it locally

\`\`\`bash
npm install
${runCmd}
\`\`\`

Then open the URL it prints (usually http://localhost:3000).
`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardWorkspace("ws.export", id, { limit: 30, windowMs: 60 * 60 * 1000 }, "write");
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");

  // Premium gate: Pro/Team user, or admin.
  const user = await db().user.findUnique({ where: { id: g.user.id }, select: { tier: true, isGuest: true } });
  const premium = isAdminEmail(g.user.email) || (!user?.isGuest && (user?.tier === "pro" || user?.tier === "team"));
  if (!premium) {
    return apiErrors.upgradeRequired("Exporting your project is a premium feature — upgrade to Pro to download your code.");
  }

  // Gather the workspace files (git-authed for IMPORT mode).
  const auth = await getGitAuth(g.ws.userId, g.ws.provider);
  const tree = await withGitAuth(auth, () => listWorkspaceFiles(g.ws)).catch(() => []);
  const zip = new JSZip();
  let count = 0;
  let hasPkg = false;
  let hasIndexHtml = false;
  for (const f of tree.slice(0, MAX_FILES)) {
    const content = await withGitAuth(auth, () => readWorkspaceFile(g.ws, f.path)).catch(() => null);
    if (content === null) continue;
    zip.file(f.path, content);
    if (f.path === "package.json") hasPkg = true;
    if (f.path === "index.html" || /(^|\/)index\.html$/.test(f.path)) hasIndexHtml = true;
    count++;
  }
  if (count === 0) return apiErrors.badRequest("This project has no files to export yet.");

  const name = slugify(g.ws.name);
  // No package.json → it's a static site: add one so `npm run dev` serves it.
  if (!hasPkg && hasIndexHtml) zip.file("package.json", staticPackageJson(name));
  zip.file("README.md", readme(g.ws.name || "My project", "npm run dev"));

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

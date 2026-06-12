/**
 * /api/github/repos — GET: repos the signed-in user's GitHub token can
 * access (the import picker and push-target list). Returns the dedicated
 * GITHUB_UNAUTHORIZED code when GitHub isn't connected so the client can
 * show a "Connect GitHub" prompt.
 */

import { getGitHubToken } from "@/lib/auth";
import { ok, apiErrors } from "@/lib/api-response";
import { listAccessibleRepos, withGitHubToken } from "@/lib/github";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("github.repos", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const token = await getGitHubToken(g.user.id);
  const result = await withGitHubToken(token, () => listAccessibleRepos());

  if (!result) return apiErrors.badRequest("Couldn't reach GitHub — try again.");
  if ("unauthorized" in result) return apiErrors.githubUnauthorized();

  return ok({ repos: result.repos });
}

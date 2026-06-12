/**
 * /api/git/repos — GET ?provider=github|gitlab|bitbucket|azure|gitea
 * Repos the signed-in user's token can reach on that host (the import
 * picker and push-target list). Returns the dedicated GITHUB_UNAUTHORIZED
 * code when the host isn't connected so the client can show a connect form.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { getProvider, getGitAuth, withGitAuth, isProviderName } from "@/lib/git";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard("git.repos", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const provider = new URL(req.url).searchParams.get("provider") ?? "github";
  if (!isProviderName(provider)) return apiErrors.badRequest("Unknown git provider");

  const auth = await getGitAuth(g.user.id, provider);
  if (!auth) return apiErrors.githubUnauthorized();

  const result = await withGitAuth(auth, () => getProvider(provider).listRepos());

  if (!result) return apiErrors.badRequest(`Couldn't reach ${provider} — try again.`);
  if ("unauthorized" in result) return apiErrors.githubUnauthorized();

  return ok({ repos: result.repos });
}

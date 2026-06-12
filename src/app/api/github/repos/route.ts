/**
 * /api/github/repos — legacy alias for /api/git/repos?provider=github.
 * Kept so older clients keep working; new code should call /api/git/repos.
 */

import { GET as gitRepos } from "@/app/api/git/repos/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  url.searchParams.set("provider", "github");
  return gitRepos(new Request(url, req));
}

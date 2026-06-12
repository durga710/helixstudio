/**
 * /api/workspaces/[id]/ledger — GET ?path=: line-level provenance for one
 * file. Returns run-length-encoded line ranges → intent attributions, the
 * metadata of every intent that still owns a line, and the test files that
 * appear to protect the file.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { computeLineLedger } from "@/lib/intent-ledger";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ws.read", id, { limit: 300, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;

  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path) return apiErrors.badRequest("path is required");

  // Owner's git identity — the live content of an untouched IMPORT-mode file
  // comes from the repo base.
  const auth = await getGitAuth(g.ws.userId, g.ws.provider);
  const ledger = await withGitAuth(auth, () => computeLineLedger(g.ws, path));
  return ok(ledger);
}

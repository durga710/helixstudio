/**
 * Admin-only AI library scout. POST → one low-token model call suggesting modern
 * libraries to ADD per premium template; writes them to libraryState.suggestions
 * for review (never edits a template). Returns the suggestions.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { dbEnabled } from "@/lib/db";
import { guardAdmin } from "@/lib/route-helpers";
import { runLibraryScout } from "@/lib/templates/library-scout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const g = await guardAdmin();
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");
  try {
    const suggestions = await runLibraryScout(g.admin.id);
    return ok({ suggestions });
  } catch (e) {
    return apiErrors.badRequest(e instanceof Error ? e.message : "Scout failed.");
  }
}

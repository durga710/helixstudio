/**
 * /api/local-models?base=<url> — GET: list the model ids an OpenAI-compatible
 * endpoint is serving (LM Studio, Ollama, OpenRouter…). Lets the model picker
 * show what's ACTUALLY running instead of making the user type ids.
 *
 * The fetch happens server-side, so in local dev "localhost" resolves to this
 * machine — same place LM Studio runs.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { guard } from "@/lib/route-helpers";
import { resolvesToPrivateHost } from "@/lib/security/ssrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BaseSchema = z.url().max(300);

export async function GET(req: Request) {
  const g = await guard("local-models", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const raw = new URL(req.url).searchParams.get("base") ?? "";
  const parsed = BaseSchema.safeParse(raw);
  if (!parsed.success) return apiErrors.badRequest("base must be a valid http(s) URL");

  const entered = parsed.data.replace(/\/+$/, "");

  // SECURITY (H2): this feature targets the user's OWN localhost in dev (LM
  // Studio). In a deployed environment, fetching a user-supplied URL that
  // resolves to a private/loopback/link-local address is SSRF — block it.
  if (process.env.NODE_ENV === "production" && (await resolvesToPrivateHost(entered))) {
    return apiErrors.badRequest("That address can't be reached from the server.");
  }

  // People paste the bare server URL (http://localhost:1234), the OpenAI
  // path (/v1), or LM Studio's native path (/api/v1). Try the sensible
  // variants and report back which one works so the client can self-correct.
  // The /api/v1 → /v1 swap goes FIRST: LM Studio's native /api/v1 surface
  // lists models too, but its chat endpoint differs from OpenAI's — chat
  // would break if we blessed it.
  const candidates = Array.from(
    new Set([
      entered.replace(/\/api\/v1$/, "/v1"),
      entered,
      /\/v1$/.test(entered) ? entered : `${entered}/v1`,
    ]),
  );

  let reachable = false;
  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/models`, {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) {
        reachable = true; // server answered, wrong path — keep trying variants
        continue;
      }
      const json = (await res.json()) as {
        data?: Array<{ id?: string; key?: string }>;
        models?: Array<{ id?: string; key?: string }>;
      };
      const models = (json.data ?? json.models ?? [])
        .map((m) => m.id ?? m.key)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        // embedding models can't chat — hide them from the picker
        .filter((id) => !/embed/i.test(id))
        .slice(0, 50);
      if (models.length > 0 || (json.data ?? json.models)) {
        // Found a working OpenAI-compatible surface — tell the client the
        // base that worked so it can normalize the saved URL.
        return ok({ models, base });
      }
      reachable = true;
    } catch {
      // try the next variant
    }
  }

  return apiErrors.badRequest(
    reachable
      ? "The server answered but no OpenAI-compatible /models endpoint was found — check the URL (LM Studio uses http://localhost:1234/v1)."
      : `Couldn't reach ${entered} — make sure the server is running (LM Studio: Developer tab → Start Server).`,
  );
}

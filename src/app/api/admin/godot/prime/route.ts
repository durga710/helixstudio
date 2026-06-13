/**
 * Admin-only: prime the Godot toolchain.
 *   POST → install Godot + web export templates in a sandbox, snapshot it, and
 *          publish the shared engine runtime to blob. Streams NDJSON log events
 *          so the admin watches a live terminal (like the template-refresh job).
 *   GET  → whether the runtime is primed (version + snapshot present).
 */

import { ok, apiErrors } from "@/lib/api-response";
import { guardAdmin } from "@/lib/route-helpers";
import { blobEnabled } from "@/lib/blob";
import { primeGodot, readRuntime, GODOT_VERSION } from "@/lib/godot/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const g = await guardAdmin();
  if ("response" in g) return g.response;
  if (!blobEnabled()) return apiErrors.badRequest("Blob storage isn't configured (BLOB_READ_WRITE_TOKEN).");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };
      void (async () => {
        write({ type: "log", line: `▶ Priming Godot ${GODOT_VERSION} (started by ${g.admin.email})` });
        try {
          const rt = await primeGodot((line) => write({ type: "log", line }));
          write({ type: "done", ok: true, version: rt.version });
        } catch (e) {
          write({ type: "log", line: `✗ ${e instanceof Error ? e.message : "prime failed"}` });
          write({ type: "done", ok: false, error: true });
        } finally {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET() {
  const g = await guardAdmin();
  if ("response" in g) return g.response;
  const rt = await readRuntime();
  return ok({
    primed: Boolean(rt),
    version: rt?.version ?? GODOT_VERSION,
    blob: blobEnabled(),
  });
}

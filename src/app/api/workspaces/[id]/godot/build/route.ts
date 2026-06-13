/**
 * Godot "Build & Play": compile a workspace's Godot project to a web pack.
 *   POST → run the export (streaming NDJSON log lines); reuses the last build if
 *          the project is unchanged. Finalizes a GodotBuild row.
 *   GET  → latest build status for the client to branch on.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db, dbEnabled } from "@/lib/db";
import { guardWorkspace } from "@/lib/route-helpers";
import { blobEnabled } from "@/lib/blob";
import { setProgress } from "@/lib/progress";
import { isGodotProject } from "@/lib/templates/engines";
import { readProjectFiles, hashProject, exportGodot } from "@/lib/godot/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RL = { limit: 30, windowMs: 60 * 60 * 1000 };

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("godot.build", id, RL, "write");
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured.");
  if (!blobEnabled()) return apiErrors.badRequest("Blob storage isn't configured for builds yet.");

  const files = await readProjectFiles(g.ws);
  if (!isGodotProject(files.map((f) => f.path))) {
    return apiErrors.badRequest("This workspace isn't a Godot project.");
  }
  const hash = hashProject(files);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const logs: string[] = [];
      const write = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };
      const onLog = (line: string) => {
        logs.push(line);
        write({ type: "log", line });
      };

      void (async () => {
        try {
          // Unchanged project → reuse the last ready build (no recompile).
          const existing = await db()
            .godotBuild.findFirst({
              where: { workspaceId: g.ws.id, status: "ready", hash },
              orderBy: { createdAt: "desc" },
            })
            .catch(() => null);
          if (existing) {
            write({ type: "log", line: "✓ No changes since the last build — ready to play." });
            write({ type: "done", ok: true, buildId: existing.id });
            return;
          }

          const build = await db().godotBuild.create({
            data: { workspaceId: g.ws.id, status: "exporting", hash },
          });
          setProgress(g.ws.id, "Compiling your game…");

          try {
            const { pckUrl, runtime: rt } = await exportGodot(g.ws, files, onLog);
            await db().godotBuild.update({
              where: { id: build.id },
              data: {
                status: "ready",
                pckKey: pckUrl,
                runtime: rt,
                exportLog: logs.join("\n").slice(-8000),
                finishedAt: new Date(),
              },
            });
            write({ type: "done", ok: true, buildId: build.id });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "build failed";
            await db()
              .godotBuild.update({
                where: { id: build.id },
                data: { status: "error", error: msg, exportLog: logs.join("\n").slice(-8000), finishedAt: new Date() },
              })
              .catch(() => {});
            write({ type: "log", line: `✗ ${msg}` });
            write({ type: "done", ok: false, error: msg });
          }
        } catch (e) {
          write({ type: "log", line: `✗ ${e instanceof Error ? e.message : "build failed"}` });
          write({ type: "done", ok: false });
        } finally {
          setProgress(g.ws.id, "");
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

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("godot.status", id, { limit: 600, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;
  if (!dbEnabled()) return ok({ status: "none" });

  // Zombie sweep: an export stuck >8m means the function died mid-build.
  await db()
    .godotBuild.updateMany({
      where: { workspaceId: g.ws.id, status: "exporting", createdAt: { lt: new Date(Date.now() - 8 * 60 * 1000) } },
      data: { status: "error", error: "timed out" },
    })
    .catch(() => {});

  const latest = await db()
    .godotBuild.findFirst({ where: { workspaceId: g.ws.id }, orderBy: { createdAt: "desc" } })
    .catch(() => null);
  return ok({
    status: latest?.status ?? "none",
    buildId: latest?.id ?? null,
    error: latest?.error ?? null,
  });
}

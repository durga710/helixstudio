/**
 * Served Godot runtime — the ONE place a compiled game is cross-origin-isolated
 * (COOP/COEP) so its WASM threads / SharedArrayBuffer work. Can't ride a srcDoc
 * iframe, hence a real route. Everything is served SAME-ORIGIN (the engine +
 * pack are proxied from blob server-side), so COEP is satisfied with no CORP
 * juggling and the artifacts are never linked to the client directly.
 *
 *   GET /play/[id]                       → the boot HTML (COOP/COEP)
 *   GET /play/[id]/godot.wasm|js|…       → the shared engine runtime (from blob)
 *   GET /play/[id]/game.pck              → the latest ready build's pack
 *
 * Access is gated by guardWorkspace("read") — owner or Space member — so a
 * classmate can play a shared game but a stranger can't.
 */

import { db, dbEnabled } from "@/lib/db";
import { guardWorkspace } from "@/lib/route-helpers";
import { getArtifactStream } from "@/lib/blob";
import { readRuntime } from "@/lib/godot/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINE_ASSETS = new Set(["godot.wasm", "godot.js", "godot.worker.js", "godot.audio.worklet.js"]);

interface Params {
  params: Promise<{ id: string; path?: string[] }>;
}

function assetContentType(name: string): string {
  if (name.endsWith(".wasm")) return "application/wasm";
  if (name.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (name.endsWith(".pck")) return "application/octet-stream";
  return "application/octet-stream";
}

/** Cross-origin-isolation headers the Godot runtime needs. */
const ISOLATION = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function htmlShell(id: string, body: string, extraHead = ""): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>html,body{margin:0;height:100%;background:#0b0f1a;overflow:hidden}#c{display:block;width:100%;height:100%;border:0}#msg{color:#9cadc4;font:14px system-ui,sans-serif;display:grid;place-items:center;height:100%;text-align:center;padding:0 24px}</style>
${extraHead}</head><body>${body}</body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...ISOLATION },
  });
}

export async function GET(_req: Request, { params }: Params) {
  const { id, path } = await params;
  const g = await guardWorkspace("play", id, { limit: 5000, windowMs: 60 * 60 * 1000 }, "read");
  if ("response" in g) return g.response;
  if (!dbEnabled()) return htmlShell(id, `<div id="msg">Games aren't available in this deployment.</div>`);

  const asset = path?.[0];

  // ---- Asset requests (engine runtime + game pack), proxied from blob -------
  if (asset) {
    if (ENGINE_ASSETS.has(asset)) {
      const rt = await readRuntime();
      const url = rt?.engine[asset];
      if (!url) return new Response("not primed", { status: 503 });
      const stream = await getArtifactStream(url);
      if (!stream) return new Response("not found", { status: 404 });
      return new Response(stream, {
        headers: {
          "Content-Type": assetContentType(asset),
          "Cache-Control": "public, max-age=31536000, immutable",
          ...ISOLATION,
        },
      });
    }
    if (asset === "game.pck") {
      const build = await db()
        .godotBuild.findFirst({ where: { workspaceId: g.ws.id, status: "ready" }, orderBy: { createdAt: "desc" } })
        .catch(() => null);
      if (!build?.pckKey) return new Response("no build", { status: 404 });
      const stream = await getArtifactStream(build.pckKey);
      if (!stream) return new Response("not found", { status: 404 });
      return new Response(stream, {
        headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store", ...ISOLATION },
      });
    }
    return new Response("not found", { status: 404 });
  }

  // ---- The boot document ----------------------------------------------------
  const build = await db()
    .godotBuild.findFirst({ where: { workspaceId: g.ws.id, status: "ready" }, orderBy: { createdAt: "desc" } })
    .catch(() => null);
  if (!build) {
    return htmlShell(id, `<div id="msg">This game hasn't been built yet — press <b>Build &amp; Play</b> in the editor.</div>`);
  }

  // Absolute asset URLs (so they resolve regardless of trailing slash), loaded
  // through the Godot 4 web loader.
  const base = `/play/${id}`;
  const body = `<canvas id="c" tabindex="0"></canvas>
<script src="${base}/godot.js"></script>
<script>
  function focusCanvas(){ try{ var c=document.getElementById('c'); if(c){ c.focus(); } if(window.focus)window.focus(); }catch(e){} }
  try {
    const engine = new Engine({ canvas: document.getElementById('c'), executable: '${base}/godot', mainPack: '${base}/game.pck' });
    engine.startGame().then(focusCanvas).catch(function (e) { document.body.innerHTML = '<div id=msg>Could not start the game.<br>' + e + '</div>'; });
  } catch (e) {
    document.body.innerHTML = '<div id=msg>Could not load the game engine.<br>' + e + '</div>';
  }
  window.addEventListener('load', focusCanvas);
  document.addEventListener('pointerdown', focusCanvas);
</script>`;
  return htmlShell(id, body);
}

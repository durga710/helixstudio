/**
 * Client-side MP4 export for a HelixReel — flattens the stitched clips into ONE
 * downloadable file, entirely in the browser (ffmpeg.wasm). No server render,
 * so it sidesteps Vercel's function timeout/memory limits and the clips never
 * leave the user's machine a second time.
 *
 * Recipe: each Sora clip is remuxed to MPEG-TS (stream copy, no re-encode) so
 * they concat cleanly, then the TS streams are concatenated back into one MP4.
 * Stream-copy throughout — fast even on the single-threaded core, and lossless.
 *
 * The ffmpeg core (~30 MB) loads from a CDN on first use and is cached for the
 * session. The single-threaded core needs no SharedArrayBuffer / COOP-COEP.
 */

/**
 * ffmpeg.wasm assets are SELF-HOSTED under /public/ffmpeg (see that dir): the
 * esm module worker + its sibling modules, plus the core .js/.wasm. They must be
 * same-origin — a cross-origin Worker is a SecurityError, and a blob worker
 * can't resolve its sibling imports. Loading from /public sidesteps both, and
 * also Next/Turbopack not emitting the package's worker correctly.
 */
const FFMPEG_BASE = "/ffmpeg";

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;
let ffmpegSingleton: FFmpegInstance | null = null;

async function getFFmpeg(): Promise<FFmpegInstance> {
  if (ffmpegSingleton) return ffmpegSingleton;
  // Dynamic import keeps the browser-only wasm wrapper out of SSR entirely.
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const ff = new FFmpeg();
  const origin = window.location.origin;
  await ff.load({
    classWorkerURL: `${origin}${FFMPEG_BASE}/esm/worker.js`,
    coreURL: `${origin}${FFMPEG_BASE}/ffmpeg-core.js`,
    wasmURL: `${origin}${FFMPEG_BASE}/ffmpeg-core.wasm`,
  });
  ffmpegSingleton = ff;
  return ff;
}

export interface ExportClip {
  id: string;
}

export type ExportStage = "loading" | "fetching" | "stitching" | "done";

/**
 * Concatenate the reel's clips into a single MP4 Blob. `onProgress` reports a
 * coarse 0–100 so the UI can show a bar. Throws on failure (caller surfaces it).
 */
export async function exportReelMp4(
  clips: ExportClip[],
  onProgress?: (stage: ExportStage, pct: number) => void,
  /** Optional AI voiceover (MP3 bytes) — muxed onto the reel as its audio track
   * (Sora clips are silent, so nothing is lost). */
  voiceover?: Uint8Array,
): Promise<Blob> {
  if (clips.length === 0) throw new Error("Nothing to export yet.");
  onProgress?.("loading", 4);
  const ff = await getFFmpeg();
  const { fetchFile } = await import("@ffmpeg/util");

  const tsNames: string[] = [];
  const scratch: string[] = [];
  try {
    // 1. Fetch each clip and remux to MPEG-TS (stream copy) for clean concat.
    for (let i = 0; i < clips.length; i++) {
      const data = await fetchFile(`/api/video/${encodeURIComponent(clips[i].id)}/content`);
      const mp4 = `c${i}.mp4`;
      const ts = `c${i}.ts`;
      await ff.writeFile(mp4, data);
      await ff.exec(["-i", mp4, "-c", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "mpegts", ts]);
      tsNames.push(ts);
      scratch.push(mp4, ts);
      onProgress?.("fetching", 4 + Math.round(((i + 1) / clips.length) * 76));
    }

    // 2. Concatenate the TS streams back into one MP4 (stream copy). With a
    //    voiceover, mux it in as the audio track (copy video, encode audio).
    onProgress?.("stitching", 84);
    if (voiceover) {
      await ff.writeFile("voice.mp3", voiceover);
      scratch.push("voice.mp3");
      await ff.exec([
        "-i", `concat:${tsNames.join("|")}`,
        "-i", "voice.mp3",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        "out.mp4",
      ]);
    } else {
      await ff.exec(["-i", `concat:${tsNames.join("|")}`, "-c", "copy", "-bsf:a", "aac_adtstoasc", "out.mp4"]);
    }
    const out = (await ff.readFile("out.mp4")) as Uint8Array;
    onProgress?.("done", 100);
    // Copy into a fresh ArrayBuffer-backed view — the wasm output may be backed
    // by a SharedArrayBuffer, which Blob's types reject.
    const bytes = new Uint8Array(out.byteLength);
    bytes.set(out);
    return new Blob([bytes], { type: "video/mp4" });
  } finally {
    // Free the in-memory FS so a second export doesn't accumulate.
    for (const f of [...scratch, "out.mp4"]) {
      try {
        await ff.deleteFile(f);
      } catch {
        /* already gone */
      }
    }
  }
}

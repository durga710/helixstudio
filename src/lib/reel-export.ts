/**
 * Client-side MP4 export for a HelixReel — flattens the stitched clips into ONE
 * downloadable file, entirely in the browser (ffmpeg.wasm). No server render,
 * so it sidesteps Vercel's function timeout/memory limits.
 *
 * Two paths:
 *  - Fast path (no transitions / all hard cuts): each clip is remuxed to MPEG-TS
 *    (stream copy, no re-encode) and concatenated back into one MP4. Lossless and
 *    fast even on the single-threaded core.
 *  - Transition path (the reel has dissolve/fade/slide/wipe cuts): an ffmpeg
 *    xfade chain crossfades each clip into the next with the AI-chosen
 *    transition. This re-encodes (slower), so it runs only when needed, and
 *    falls back to the fast concat path if anything goes wrong — the download
 *    never breaks.
 *
 * A voiceover (MP3) is muxed as the audio track in either path.
 *
 * ffmpeg.wasm assets are SELF-HOSTED under /public/ffmpeg (same-origin worker +
 * core .js/.wasm) — a cross-origin Worker is a SecurityError and a blob worker
 * can't resolve its sibling imports.
 */

const FFMPEG_BASE = "/ffmpeg";

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;
let ffmpegSingleton: FFmpegInstance | null = null;

async function getFFmpeg(): Promise<FFmpegInstance> {
  if (ffmpegSingleton) return ffmpegSingleton;
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
  /** Clip length in seconds — used for xfade offsets. */
  seconds?: number;
  /** AI-chosen transition INTO this clip. */
  transition?: string;
}

export type ExportStage = "loading" | "fetching" | "stitching" | "done";

/** Transition → ffmpeg xfade name + overlap seconds. "cut" is a ~1-frame fade
 *  (effectively a straight cut) so the xfade chain stays uniform. */
const XFADE: Record<string, { name: string; dur: number }> = {
  cut: { name: "fade", dur: 0.04 },
  dissolve: { name: "fade", dur: 0.5 },
  fadeblack: { name: "fadeblack", dur: 0.5 },
  slide: { name: "slideleft", dur: 0.4 },
  wipe: { name: "wipeleft", dur: 0.4 },
};
function xf(t?: string): { name: string; dur: number } {
  return XFADE[t ?? "cut"] ?? XFADE.dissolve;
}

function toBlob(out: Uint8Array): Blob {
  // Copy into a fresh ArrayBuffer-backed view — the wasm output may be backed by
  // a SharedArrayBuffer, which Blob's types reject.
  const bytes = new Uint8Array(out.byteLength);
  bytes.set(out);
  return new Blob([bytes], { type: "video/mp4" });
}

/**
 * Flatten the reel's clips into a single MP4 Blob. `onProgress` reports a coarse
 * 0–100. Throws on failure (caller surfaces it).
 */
export async function exportReelMp4(
  clips: ExportClip[],
  onProgress?: (stage: ExportStage, pct: number) => void,
  /** Optional AI voiceover (MP3 bytes) — muxed onto the reel as its audio. */
  voiceover?: Uint8Array,
): Promise<Blob> {
  if (clips.length === 0) throw new Error("Nothing to export yet.");
  onProgress?.("loading", 4);
  const ff = await getFFmpeg();
  const { fetchFile } = await import("@ffmpeg/util");

  const hasTransitions = clips.some((c, i) => i > 0 && c.transition && c.transition !== "cut");
  const scratch: string[] = [];

  try {
    // 1. Fetch + write every clip as mp4.
    const mp4Names: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const data = await fetchFile(`/api/video/${encodeURIComponent(clips[i].id)}/content`);
      const mp4 = `c${i}.mp4`;
      await ff.writeFile(mp4, data);
      mp4Names.push(mp4);
      scratch.push(mp4);
      onProgress?.("fetching", 4 + Math.round(((i + 1) / clips.length) * 66));
    }
    if (voiceover) {
      await ff.writeFile("voice.mp3", voiceover);
      scratch.push("voice.mp3");
    }

    onProgress?.("stitching", 74);

    // 2a. Transition path (re-encode with xfade). On any failure, fall through
    //     to the fast concat path so the export always succeeds.
    if (hasTransitions && clips.length > 1) {
      try {
        const out = await stitchWithTransitions(ff, clips, mp4Names, Boolean(voiceover), onProgress);
        scratch.push("out.mp4");
        onProgress?.("done", 100);
        return toBlob(out);
      } catch (e) {
        console.warn("[reel-export] transition stitch failed — falling back to clean cuts", e);
      }
    }

    // 2b. Fast path: stream-copy concat (no transitions).
    const out = await stitchConcat(ff, mp4Names, Boolean(voiceover), scratch);
    scratch.push("out.mp4");
    onProgress?.("done", 100);
    return toBlob(out);
  } finally {
    for (const f of [...new Set(scratch)]) {
      try {
        await ff.deleteFile(f);
      } catch {
        /* already gone */
      }
    }
  }
}

/** Stream-copy concat via MPEG-TS (lossless, fast). Optional voiceover mux. */
async function stitchConcat(
  ff: FFmpegInstance,
  mp4Names: string[],
  withVoice: boolean,
  scratch: string[],
): Promise<Uint8Array> {
  const tsNames: string[] = [];
  for (let i = 0; i < mp4Names.length; i++) {
    const ts = `c${i}.ts`;
    await ff.exec(["-i", mp4Names[i], "-c", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "mpegts", ts]);
    tsNames.push(ts);
    scratch.push(ts);
  }
  if (withVoice) {
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
  return (await ff.readFile("out.mp4")) as Uint8Array;
}

/** Crossfade each clip into the next with its AI-chosen transition (re-encode). */
async function stitchWithTransitions(
  ff: FFmpegInstance,
  clips: ExportClip[],
  mp4Names: string[],
  withVoice: boolean,
  onProgress?: (stage: ExportStage, pct: number) => void,
): Promise<Uint8Array> {
  const dur = (i: number) => Math.max(0.1, clips[i].seconds ?? 8);

  // Normalize every input so xfade has matching fps / pixel format / SAR.
  const norm = clips.map((_, i) => `[${i}:v]fps=30,format=yuv420p,setsar=1[n${i}]`);

  const xfades: string[] = [];
  let prev = "[n0]";
  let len = dur(0); // running length of the accumulated stream
  for (let i = 1; i < clips.length; i++) {
    const { name, dur: t } = xf(clips[i].transition);
    const offset = Math.max(0, len - t);
    const out = i === clips.length - 1 ? "[vout]" : `[v${i}]`;
    xfades.push(
      `${prev}[n${i}]xfade=transition=${name}:duration=${t.toFixed(3)}:offset=${offset.toFixed(3)}${out}`,
    );
    prev = out;
    len = len + dur(i) - t;
  }
  const filter = [...norm, ...xfades].join(";");

  // Move the progress bar during the (slow) single-threaded encode.
  const onProg = (e: { progress: number }) =>
    onProgress?.("stitching", 76 + Math.round(Math.min(1, Math.max(0, e.progress)) * 22));
  ff.on("progress", onProg);

  try {
    const args: string[] = [];
    for (const m of mp4Names) args.push("-i", m);
    if (withVoice) args.push("-i", "voice.mp3");
    args.push("-filter_complex", filter, "-map", "[vout]");
    if (withVoice) args.push("-map", `${clips.length}:a`, "-c:a", "aac", "-shortest");
    args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "out.mp4");
    await ff.exec(args);
  } finally {
    ff.off("progress", onProg);
  }
  return (await ff.readFile("out.mp4")) as Uint8Array;
}

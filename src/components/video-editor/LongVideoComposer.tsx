"use client";

/**
 * LongVideoComposer — the long-form HelixVideo builder.
 *
 * Sora caps a clip at 20s, so this turns ONE idea into a multi-minute video:
 *   1. plan  — POST /api/video/reel/plan → an AI shot list (N flowing shots)
 *   2. render— generate one HelixVideo clip per shot (the existing /api/video
 *              create+poll flow), sequentially, with per-shot progress
 *   3. stitch— preview every finished clip back-to-back as one reel (ReelStage)
 *
 * A failed shot doesn't sink the reel — it's skipped and the rest still stitch.
 */
import { useRef, useState } from "react";
import { Clapperboard, Loader2, Sparkles, Check, X, Film, Download } from "lucide-react";
import { ReelStage } from "./ReelStage";
import type { ReelClip } from "./HelixReel";
import { exportReelMp4, type ExportStage } from "@/lib/reel-export";

const SECONDS = ["4", "8", "12", "16", "20"] as const;
type Sec = (typeof SECONDS)[number];

const SIZES = [
  { value: "1280x720", label: "Landscape" },
  { value: "720x1280", label: "Portrait" },
] as const;

type ShotStatus = "pending" | "rendering" | "done" | "failed";
interface Shot {
  title: string;
  prompt: string;
  status: ShotStatus;
  id?: string;
  seconds: number;
}

/** Create one clip and poll it to completion. Mirrors the single-studio flow,
 * including transient-miss tolerance, and throws on a real failure. */
async function renderShot(
  prompt: string,
  seconds: Sec,
  size: string,
  cancelled: { current: boolean },
): Promise<string> {
  const r = await fetch("/api/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, seconds, size }),
  });
  const j = await r.json();
  if (!r.ok || !j?.data?.id) throw new Error(j?.error?.message || "Couldn't start a shot.");
  const id: string = j.data.id;

  let misses = 0;
  for (;;) {
    await new Promise((res) => setTimeout(res, 4_000));
    if (cancelled.current) throw new Error("cancelled");
    let d: { status?: string; failReason?: string } | undefined;
    try {
      const sr = await fetch(`/api/video?id=${encodeURIComponent(id)}`);
      d = (await sr.json())?.data;
    } catch {
      if (++misses <= 8) continue;
      throw new Error("Lost connection while rendering.");
    }
    if (!d) {
      if (++misses <= 8) continue;
      throw new Error("Lost the shot.");
    }
    misses = 0;
    if (d.status === "completed") return id;
    if (d.status === "failed") throw new Error(d.failReason || "A shot couldn't be generated.");
  }
}

export function LongVideoComposer() {
  const [idea, setIdea] = useState("");
  const [shotCount, setShotCount] = useState(4);
  const [seconds, setSeconds] = useState<Sec>("8");
  const [size, setSize] = useState<string>("1280x720");
  const [phase, setPhase] = useState<"idle" | "planning" | "generating" | "done" | "error">("idle");
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  // MP4 export (client-side ffmpeg.wasm).
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportMp4(reel: ReelClip[]) {
    if (exporting || reel.length === 0) return;
    setExporting(true);
    setExportError(null);
    setExportPct(0);
    try {
      const blob = await exportReelMp4(reel, (_stage: ExportStage, pct) => setExportPct(pct));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `helixvideo-reel-${reel.length}clips.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed — try again.");
    } finally {
      setExporting(false);
    }
  }

  const busy = phase === "planning" || phase === "generating";
  const clips: ReelClip[] = shots
    .filter((s) => s.status === "done" && s.id)
    .map((s) => ({ id: s.id as string, seconds: s.seconds }));
  const totalSeconds = shotCount * Number(seconds);
  const totalLabel =
    totalSeconds >= 60 ? `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s` : `${totalSeconds}s`;
  const doneCount = shots.filter((s) => s.status === "done").length;

  async function run() {
    if (!idea.trim() || busy) return;
    cancelled.current = false;
    setError(null);
    setShots([]);
    setPhase("planning");

    // 1. Plan the shot list.
    let planned: { title: string; prompt: string }[];
    try {
      const r = await fetch("/api/video/reel/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), scenes: shotCount }),
      });
      const j = await r.json();
      if (!r.ok || !j?.data?.scenes?.length) {
        setError(j?.error?.message || "Couldn't plan the video.");
        setPhase("error");
        return;
      }
      planned = j.data.scenes;
    } catch {
      setError("Network error while planning.");
      setPhase("error");
      return;
    }

    const init: Shot[] = planned.map((p) => ({
      title: p.title,
      prompt: p.prompt,
      status: "pending",
      seconds: Number(seconds),
    }));
    setShots(init);
    setPhase("generating");

    // 2. Render each shot in order (partial reel survives a failed shot).
    for (let i = 0; i < init.length; i++) {
      if (cancelled.current) {
        setPhase("idle");
        return;
      }
      setShots((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "rendering" } : s)));
      try {
        const id = await renderShot(init[i].prompt, seconds, size, cancelled);
        setShots((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "done", id } : s)));
      } catch {
        if (cancelled.current) {
          setPhase("idle");
          return;
        }
        setShots((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "failed" } : s)));
      }
    }
    setPhase("done");
  }

  function cancel() {
    cancelled.current = true;
    setPhase("idle");
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {/* Composer */}
      <div className="rounded-2xl border border-border2 bg-panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-txt">Long-form reel</h2>
        </div>

        <label className="label-tactical mb-1.5 block">Your idea</label>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={4}
          maxLength={2000}
          disabled={busy}
          placeholder="A day in a neon city — sunrise over rooftops, a chase through markets, a quiet rain-soaked finale…"
          className="w-full resize-none rounded-xl border border-border2 bg-panel2 px-3.5 py-3 text-sm text-txt outline-none transition focus:border-accent disabled:opacity-60"
        />

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <label className="label-tactical mb-1.5 block">Shots</label>
            <input
              type="number"
              min={2}
              max={15}
              value={shotCount}
              disabled={busy}
              onChange={(e) => setShotCount(Math.max(2, Math.min(15, Number(e.target.value) || 2)))}
              className="w-full rounded-lg border border-border2 bg-panel2 px-2 py-2 text-xs text-txt outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="label-tactical mb-1.5 block">Each</label>
            <select
              value={seconds}
              disabled={busy}
              onChange={(e) => setSeconds(e.target.value as Sec)}
              className="w-full rounded-lg border border-border2 bg-panel2 px-2 py-2 text-xs text-txt outline-none focus:border-accent"
            >
              {SECONDS.map((s) => (
                <option key={s} value={s} className="bg-panel">
                  {s}s
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-tactical mb-1.5 block">Format</label>
            <select
              value={size}
              disabled={busy}
              onChange={(e) => setSize(e.target.value)}
              className="w-full rounded-lg border border-border2 bg-panel2 px-2 py-2 text-xs text-txt outline-none focus:border-accent"
            >
              {SIZES.map((s) => (
                <option key={s.value} value={s.value} className="bg-panel">
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="mt-2 text-[11px] text-txt3">
          ≈ {totalLabel} total · {shotCount} clips. Each clip is generated separately and stitched into one reel.
        </p>

        {!busy ? (
          <button
            type="button"
            onClick={run}
            disabled={!idea.trim()}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[11px] bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="h-[18px] w-[18px]" /> Generate long video
          </button>
        ) : (
          <button
            type="button"
            onClick={cancel}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[11px] border border-border2 px-5 py-3 text-sm font-semibold text-txt2 transition hover:border-bad hover:text-txt"
          >
            <X className="h-[18px] w-[18px]" /> Stop
          </button>
        )}
        {error && <p className="mt-3 text-[12.5px] text-warn">{error}</p>}

        {/* Shot list / progress */}
        {shots.length > 0 && (
          <div className="mt-5 space-y-2">
            <div className="label-tactical">
              Shots · {doneCount}/{shots.length} rendered
            </div>
            {shots.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg border border-border2 bg-panel2 px-3 py-2">
                <span className="mt-0.5 shrink-0">
                  {s.status === "done" ? (
                    <Check className="h-4 w-4 text-ok" />
                  ) : s.status === "rendering" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  ) : s.status === "failed" ? (
                    <X className="h-4 w-4 text-bad" />
                  ) : (
                    <Film className="h-4 w-4 text-txt3" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium text-txt">{s.title}</div>
                  <div className="line-clamp-2 text-[11px] text-txt3">{s.prompt}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stitched preview */}
      <div className="rounded-2xl border border-border2 bg-panel p-5">
        <div className="mb-3 text-sm font-semibold text-txt">Stitched preview</div>
        {clips.length > 0 ? (
          <ReelStage clips={clips} />
        ) : (
          <div className="grid aspect-video w-full place-items-center rounded-xl border border-white/10 bg-black text-center">
            <div className="px-6 text-white/45">
              <Clapperboard className="mx-auto h-8 w-8 opacity-60" />
              <div className="mt-2 text-[13px]">
                {busy ? "Rendering shots — they'll stitch in here as they finish." : "Your long-form reel appears here."}
              </div>
            </div>
          </div>
        )}
        {clips.length > 0 && (
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => exportMp4(clips)}
              disabled={exporting || busy}
              className="inline-flex items-center gap-2 rounded-[11px] border border-border2 px-4 py-2 text-sm font-semibold text-txt2 transition hover:border-accent hover:text-txt disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? `Exporting… ${exportPct}%` : `Download MP4 · ${clips.length} clip${clips.length === 1 ? "" : "s"}`}
            </button>
            {exporting && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border2">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(4, exportPct)}%` }} />
              </div>
            )}
            <p className="text-[11px] text-txt3">
              {exporting
                ? "Stitching the clips into one MP4 in your browser…"
                : `Flattens the ${clips.length} clip${clips.length === 1 ? "" : "s"} into one downloadable file (first export loads ~30 MB of tooling).`}
            </p>
            {exportError && <p className="text-[11px] text-warn">{exportError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

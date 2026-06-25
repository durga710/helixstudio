"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Film, Download, Loader2, Lock, Wand2, Clapperboard, ImagePlus, X } from "lucide-react";

/** Cover-fit a reference image to the exact video size on the client, so Sora's
 * input_reference never hits a dimension-mismatch error. Returns a PNG Blob. */
async function resizeImageToSize(file: File, size: string): Promise<Blob> {
  const [w, h] = size.split("x").map(Number);
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("bad image"));
      im.src = src;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    const scale = Math.max(w / img.width, h / img.height); // cover
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(src);
  }
}
import { ScriptAssistant } from "@/components/video/script-assistant";

type Status = "idle" | "queued" | "in_progress" | "completed" | "failed" | "error";

const SECONDS = ["4", "8", "12", "16", "20"] as const;
const SIZES = [
  { value: "1280x720", label: "Landscape" },
  { value: "720x1280", label: "Portrait" },
  { value: "1792x1024", label: "Wide HD" },
  { value: "1024x1792", label: "Tall HD" },
] as const;

interface Recent {
  id: string;
  prompt: string;
}

const RECENTS_KEY = "helixvideo:recents";

export function HelixVideoStudio() {
  const [premium, setPremium] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState<(typeof SECONDS)[number]>("4");
  const [size, setSize] = useState<(typeof SIZES)[number]["value"]>("1280x720");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const cancelled = useRef(false);

  function attachImage(file: File | null) {
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setImageFile(file);
  }

  useEffect(() => {
    // Surface the premium gate up front (the API enforces it regardless).
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((j) => setPremium(Boolean(j?.data?.premium)))
      .catch(() => setPremium(true)); // fail open — the API still gates
    try {
      // Client-only data (localStorage) loads after mount — initial [] matches SSR.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecents(JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]"));
    } catch {
      /* ignore */
    }
    return () => {
      cancelled.current = true;
    };
  }, []);

  function saveRecent(id: string, p: string) {
    setRecents((prev) => {
      const next = [{ id, prompt: p }, ...prev.filter((r) => r.id !== id)].slice(0, 6);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function generate() {
    if (!prompt.trim() || status === "queued" || status === "in_progress") return;
    const p = prompt.trim();
    setStatus("queued");
    setProgress(0);
    setVideoId(null);
    setError(null);

    let id: string;
    try {
      // With a reference image, send multipart (image-to-video); the image is
      // resized to the exact video size first so Sora never rejects a mismatch.
      // Otherwise send plain JSON (text-to-video).
      let r: Response;
      if (imageFile) {
        const resized = await resizeImageToSize(imageFile, size).catch(() => null);
        const fd = new FormData();
        fd.append("prompt", p);
        fd.append("seconds", seconds);
        fd.append("size", size);
        if (resized) fd.append("image", resized, "reference.png");
        r = await fetch("/api/video", { method: "POST", body: fd });
      } else {
        r = await fetch("/api/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: p, seconds, size }),
        });
      }
      const j = await r.json();
      if (!r.ok || !j?.data?.id) {
        setStatus("error");
        setError(j?.error?.message || "Couldn't start the video.");
        return;
      }
      id = j.data.id;
    } catch {
      setStatus("error");
      setError("Network error — try again.");
      return;
    }

    // Poll until the job resolves (cancellable on unmount). A single bad poll —
    // a deployment swap mid-render, a cold function, a brief provider/DB blip —
    // must NOT kill a job that's still rendering, so we tolerate a run of
    // consecutive misses (~32s) before giving up. A good poll resets the budget.
    let misses = 0;
    const MAX_MISSES = 8;
    for (;;) {
      await new Promise((res) => setTimeout(res, 4_000));
      if (cancelled.current) return;
      let d: { status?: string; progress?: number; failReason?: string } | undefined;
      try {
        const sr = await fetch(`/api/video?id=${encodeURIComponent(id)}`);
        d = (await sr.json())?.data;
      } catch {
        if (++misses <= MAX_MISSES) continue; // transient network error — retry
        setStatus("error");
        setError("Lost connection while rendering — your clip may still finish. Try again.");
        return;
      }
      if (!d) {
        if (++misses <= MAX_MISSES) continue; // transient server/poll error — retry
        setStatus("error");
        setError("Lost the video job.");
        return;
      }
      misses = 0;
      setProgress(d.progress ?? 0);
      if (d.status === "completed") {
        setStatus("completed");
        setVideoId(id);
        saveRecent(id, p);
        return;
      }
      if (d.status === "failed") {
        setStatus("failed");
        setError(d.failReason || "The video couldn't be generated. Try a different prompt.");
        return;
      }
      setStatus(d.status === "queued" ? "queued" : "in_progress");
    }
  }

  const busy = status === "queued" || status === "in_progress";
  const portrait = size.startsWith("720") || size.startsWith("1024");

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8">
      {/* Cinematic hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border2 bg-[#08080c] p-6 sm:p-8">
        {/* vignette glow + a thin light sweep across the top edge */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_12%_-15%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_55%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
        />
        <div className="relative flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-accent to-[#a78bfa] text-white shadow-pop ring-1 ring-white/10">
            <Film className="h-6 w-6" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-white">HelixVideo</h1>
            <p className="mt-0.5 text-[13px] text-white/55">Direct a shot in words. Render it in cinema quality.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/video/editor"
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-3 py-1 text-[11px] font-medium text-accent transition hover:brightness-110"
            >
              <Clapperboard className="h-3.5 w-3.5" /> Long-form
            </a>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-white/70">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Premium
            </span>
          </div>
        </div>
      </div>

      {premium === false && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-5">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <div className="text-sm font-semibold text-txt">HelixVideo is a premium feature</div>
            <p className="mt-1 text-[13px] text-txt2">
              Upgrade to Pro to generate videos with HelixVideo. You can still explore the studio below.
            </p>
            <a
              href="/welcome#pricing"
              className="mt-3 inline-flex items-center gap-2 rounded-[11px] bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              <Sparkles className="h-4 w-4" /> See plans
            </a>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Composer */}
        <div className="rounded-2xl border border-border2 bg-panel p-5">
          <ScriptAssistant premium={premium === true} onUseScript={(s) => setPrompt(s)} />
          <label className="label-tactical mb-1.5 block">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="A neon hummingbird sipping from a glowing flower, slow motion, cinematic depth of field…"
            className="w-full resize-none rounded-xl border border-border2 bg-panel2 px-3.5 py-3 text-sm text-txt outline-none transition focus:border-accent"
          />

          {/* Reference image — optional image-to-video. */}
          <div className="mt-3">
            <label className="label-tactical mb-1.5 block">Reference image · optional</label>
            {imagePreview ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Reference"
                  className="h-20 w-auto rounded-lg border border-border2 object-cover"
                />
                <button
                  type="button"
                  onClick={() => attachImage(null)}
                  aria-label="Remove reference image"
                  className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-bad text-white shadow-pop"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border2 px-3 py-2 text-[12px] text-txt2 transition hover:border-accent hover:text-txt">
                <ImagePlus className="h-4 w-4" /> Attach a picture
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => attachImage(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            <p className="mt-1 text-[10.5px] text-txt3">
              Guides the look and first frame of your video. Auto-cropped to the selected format.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label-tactical mb-1.5 block">Length</label>
              <div className="flex gap-1.5">
                {SECONDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeconds(s)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-xs transition ${
                      seconds === s ? "border-accent bg-hl text-accent" : "border-border2 text-txt2 hover:border-accent"
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label-tactical mb-1.5 block">Format</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as typeof size)}
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

          <button
            type="button"
            onClick={generate}
            disabled={!prompt.trim() || busy}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[11px] bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Wand2 className="h-[18px] w-[18px]" />}
            {busy ? "Generating…" : "Generate video"}
          </button>
          {error && <p className="mt-3 text-[12.5px] text-warn">{error}</p>}
        </div>

        {/* Preview */}
        <div className="rounded-2xl border border-border2 bg-panel p-5">
          <div
            className={`relative mx-auto overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_60px_-22px_color-mix(in_srgb,var(--accent)_55%,transparent)] ${
              portrait ? "aspect-[9/16] max-w-[300px]" : "aspect-video w-full"
            }`}
          >
            {status === "completed" && videoId ? (
              <video
                key={videoId}
                src={`/api/video/${videoId}/content`}
                controls
                autoPlay
                loop
                playsInline
                className="h-full w-full bg-black object-contain"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-center">
                {busy ? (
                  <div className="px-6">
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-accent" />
                    <div className="mt-3 text-[13px] font-medium text-white/80">
                      {status === "queued" ? "Queued…" : "Rendering your shot…"}
                    </div>
                    <div className="mx-auto mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${Math.max(5, progress)}%` }}
                      />
                    </div>
                    <div className="mt-1.5 text-[11px] text-white/40">This can take a minute or two.</div>
                  </div>
                ) : (
                  <div className="px-6 text-white/45">
                    <Film className="mx-auto h-8 w-8 opacity-60" />
                    <div className="mt-2 text-[13px]">Your shot will appear here.</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {status === "completed" && videoId && (
            <a
              href={`/api/video/${videoId}/content`}
              download={`helixvideo-${videoId}.mp4`}
              className="mt-4 inline-flex items-center gap-2 rounded-[11px] border border-border2 px-4 py-2 text-sm font-semibold text-txt2 transition hover:border-accent hover:text-txt"
            >
              <Download className="h-4 w-4" /> Download MP4
            </a>
          )}

          {recents.length > 0 && (
            <div className="mt-5">
              <div className="label-tactical mb-2">Recent</div>
              <div className="grid grid-cols-3 gap-2">
                {recents.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    title={r.prompt}
                    onClick={() => {
                      setVideoId(r.id);
                      setStatus("completed");
                      setError(null);
                    }}
                    className="aspect-video overflow-hidden rounded-lg border border-border2 bg-black"
                  >
                    {/* preload metadata only — thumbnails shouldn't pull full MP4s
                        (the proxied source can also expire). Click loads it above. */}
                    <video
                      src={`/api/video/${r.id}/content`}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * VoiceoverPanel — add a single-narrator AI voiceover to a finished reel.
 * Writes a script, picks a voice, generates the narration (OpenAI TTS via
 * /api/video/voiceover), previews it, then exports the reel as one MP4 with the
 * voiceover muxed in. Self-contained: the editor just renders it with the clips.
 */

import { useRef, useState } from "react";
import { Loader2, Mic, Download } from "lucide-react";
import { exportReelMp4, type ExportClip } from "@/lib/reel-export";

const VOICES = [
  { id: "alloy", label: "Alloy", note: "Neutral" },
  { id: "nova", label: "Nova", note: "Warm" },
  { id: "shimmer", label: "Shimmer", note: "Bright" },
  { id: "onyx", label: "Onyx", note: "Deep" },
  { id: "fable", label: "Fable", note: "Storyteller" },
  { id: "echo", label: "Echo", note: "Calm" },
] as const;

export function VoiceoverPanel({ clips }: { clips: ExportClip[] }) {
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState<string>("alloy");
  const [genBusy, setGenBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioBytes = useRef<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);

  async function generate() {
    if (genBusy || !script.trim()) return;
    setGenBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/video/voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: script.trim(), voice }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        setError(j?.error?.message || "Couldn't generate the voiceover.");
      } else {
        const buf = new Uint8Array(await r.arrayBuffer());
        audioBytes.current = buf;
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" })));
      }
    } catch {
      setError("Network error. Try again.");
    }
    setGenBusy(false);
  }

  async function download() {
    if (exporting || !audioBytes.current || clips.length === 0) return;
    setExporting(true);
    setExportPct(0);
    setError(null);
    try {
      const blob = await exportReelMp4(clips, (_s, p) => setExportPct(p), audioBytes.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "helixvideo-reel-voiceover.mp4";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed — try again.");
    }
    setExporting(false);
  }

  return (
    <div className="mt-4 rounded-2xl border border-border2 bg-panel p-5">
      <div className="mb-1 flex items-center gap-2">
        <Mic className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-txt">Add a voiceover</h2>
        <span className="ml-auto rounded-full border border-border2 bg-panel2 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-txt3">
          Premium
        </span>
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-txt3">
        Write a short narration script, pick a voice, and we&rsquo;ll lay an AI voiceover over your reel.
      </p>

      <label className="label-tactical mb-1.5 block">Voice</label>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {VOICES.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVoice(v.id)}
            title={v.note}
            className={
              "rounded-lg border px-2.5 py-1 text-[12px] transition-colors " +
              (voice === v.id
                ? "border-accent bg-hl text-accent"
                : "border-border2 bg-panel2 text-txt2 hover:border-accent hover:text-txt")
            }
          >
            {v.label}
          </button>
        ))}
      </div>

      <label className="label-tactical mb-1.5 block">Script</label>
      <textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="In a city that never sleeps, one story unfolds after dark…"
        className="w-full resize-none rounded-xl border border-border2 bg-panel2 px-3.5 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={genBusy || !script.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-panel2 px-3 py-1.5 text-[12.5px] text-txt2 transition-colors hover:border-accent hover:text-txt disabled:opacity-50"
        >
          {genBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
          {audioUrl ? "Regenerate" : "Generate voiceover"}
        </button>
        {audioUrl && <audio src={audioUrl} controls className="h-9 max-w-[220px] flex-1" />}
      </div>

      {audioUrl && (
        <button
          type="button"
          onClick={download}
          disabled={exporting || clips.length === 0}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[11px] bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {exporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Rendering… {exportPct}%
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> Download reel with voiceover
            </>
          )}
        </button>
      )}

      {error && <p className="mt-2 text-[12px] text-warn">{error}</p>}
    </div>
  );
}

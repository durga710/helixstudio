"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Upload, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { ensureML, type KnnClassifier, type MobileNetModel } from "./ml-loader";
import type { WidgetProps } from "./index";

/* The Teachable-Machine moment: the student adds example photos for each class
 * (webcam or upload), presses Train, then points the camera and watches the AI
 * guess live — a real MobileNet+KNN model, all in the browser. */

const MIN_PER_CLASS = 4;
const COLORS = ["#ff004d", "#00e0c0", "#c084fc", "#ffb000"];

type Phase = "loading" | "collect" | "testing" | "error";

export function Classifier({ config, onComplete, onState }: WidgetProps) {
  const classes = (Array.isArray(config?.classes) ? (config!.classes as string[]) : ["Thing A", "Thing B"]).slice(0, 4);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const netRef = useRef<MobileNetModel | null>(null);
  const knnRef = useRef<KnnClassifier | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("loading");
  const [noCam, setNoCam] = useState(false);
  const [counts, setCounts] = useState<number[]>(() => classes.map(() => 0));
  const [pred, setPred] = useState<{ label: string; confidences: Record<string, number> } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Load the model + start the webcam once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ml = await ensureML();
        if (!alive) return;
        netRef.current = ml.net;
        knnRef.current = ml.createClassifier();
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
          if (!alive) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => {});
          }
        } catch {
          setNoCam(true); // camera denied/unavailable → upload still works
        }
        setPhase("collect");
      } catch {
        if (alive) {
          setErr("Couldn't load the AI model — check your connection and try again.");
          setPhase("error");
        }
      }
    })();
    return () => {
      alive = false;
      if (loopRef.current) clearInterval(loopRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const addExample = useCallback((input: CanvasImageSource, classIdx: number) => {
    const net = netRef.current;
    const knn = knnRef.current;
    if (!net || !knn) return;
    const activation = net.infer(input, true);
    knn.addExample(activation, classIdx);
    setCounts((prev) => prev.map((c, i) => (i === classIdx ? c + 1 : c)));
  }, []);

  const capture = useCallback(
    (classIdx: number) => {
      if (videoRef.current && streamRef.current) addExample(videoRef.current, classIdx);
    },
    [addExample],
  );

  const upload = useCallback(
    (classIdx: number, file: File) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        addExample(img, classIdx);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    },
    [addExample],
  );

  const ready = counts.every((c) => c >= MIN_PER_CLASS);

  const train = useCallback(() => {
    if (!ready || !videoRef.current || noCam) return;
    setPhase("testing");
    loopRef.current = setInterval(async () => {
      const net = netRef.current;
      const knn = knnRef.current;
      const video = videoRef.current;
      if (!net || !knn || !video || knn.getNumLabels() === 0) return;
      const activation = net.infer(video, true);
      try {
        const result = await knn.predictClass(activation, 5);
        setPred(result);
        onState?.({ classes, counts, top: classes[Number(result.label)], confidence: result.confidences });
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete();
        }
      } catch {
        /* transient */
      } finally {
        activation.dispose();
      }
    }, 280);
  }, [ready, noCam, classes, counts, onComplete, onState]);

  function reset() {
    if (loopRef.current) clearInterval(loopRef.current);
    knnRef.current?.clearAllLabels();
    setCounts(classes.map(() => 0));
    setPred(null);
    setPhase("collect");
  }

  if (phase === "error") {
    return (
      <div className="rounded-card border border-border bg-panel2 p-6 text-center text-[13px] text-bad">{err}</div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <div className="grid gap-4 sm:grid-cols-[260px_1fr]">
        {/* Camera */}
        <div>
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-black">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            {phase === "loading" && (
              <div className="absolute inset-0 grid place-items-center bg-black/60 text-[12px] text-white">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> waking up the AI…
                </span>
              </div>
            )}
            {noCam && phase !== "loading" && (
              <div className="absolute inset-0 grid place-items-center bg-black/70 px-4 text-center text-[11.5px] text-white">
                No camera — upload photos for each class instead.
              </div>
            )}
          </div>
          {phase === "testing" && pred && (
            <div className="mt-2 text-center text-[12px] text-txt2">
              I think it&apos;s{" "}
              <span className="font-semibold text-txt">{classes[Number(pred.label)] ?? "…"}</span>
            </div>
          )}
        </div>

        {/* Classes + controls */}
        <div className="flex flex-col">
          <div className="space-y-2.5">
            {classes.map((label, idx) => {
              const conf = pred ? Math.round((pred.confidences[String(idx)] ?? 0) * 100) : 0;
              const color = COLORS[idx % COLORS.length];
              return (
                <div key={idx} className="rounded-xl border border-border bg-panel p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="text-[12.5px] font-semibold text-txt">{label}</span>
                    <span className="ml-auto text-[11px] text-txt3">{counts[idx]} examples</span>
                  </div>
                  {phase === "collect" ? (
                    <div className="mt-2 flex gap-1.5">
                      {!noCam && (
                        <button
                          onClick={() => capture(idx)}
                          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border2 bg-panel2 px-2 py-1.5 text-[11.5px] text-txt2 transition-colors hover:border-accent hover:text-txt"
                        >
                          <Camera className="h-3.5 w-3.5" /> Capture
                        </button>
                      )}
                      <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border2 bg-panel2 px-2 py-1.5 text-[11.5px] text-txt2 transition-colors hover:border-accent hover:text-txt">
                        <Upload className="h-3.5 w-3.5" /> Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) upload(idx, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2">
                      <div
                        className="h-full rounded-full transition-[width] duration-200"
                        style={{ width: `${conf}%`, background: color }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3">
            {phase === "collect" ? (
              <button
                onClick={train}
                disabled={!ready || noCam}
                title={noCam ? "Capture needs a camera to test live" : undefined}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-4 w-4" />
                {ready ? "Train it!" : `Add ${MIN_PER_CLASS}+ examples of each`}
              </button>
            ) : (
              <button
                onClick={reset}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border2 bg-panel2 px-4 py-2 text-[13px] text-txt2 transition-colors hover:border-accent hover:text-txt"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Start over
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

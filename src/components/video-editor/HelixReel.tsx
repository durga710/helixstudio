/**
 * HelixReel — the long-form stitch. Sora caps a single clip at 20s, so a
 * minutes-long HelixVideo is N generated clips played as one timeline. Clips
 * stream from the authenticated proxy (/api/video/[id]/content).
 *
 * Each cut uses an AI-chosen transition (the planner picks one per shot to fit
 * the moment) rendered with @remotion/transitions, so the reel flows instead of
 * hard-cutting. A "cut" transition (or none) is a straight cut.
 */
import { Fragment } from "react";
import { AbsoluteFill, OffthreadVideo } from "remotion";
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";

/** Transition vocabulary — mirrors `ReelTransition` in src/lib/video-reel.ts. */
export type ReelTransition = "cut" | "dissolve" | "fadeblack" | "slide" | "wipe";

export type ReelClip = {
  /** Provider video id (its MP4 streams from /api/video/[id]/content). */
  id: string;
  /** Clip length in seconds (one of Sora's 4/8/12/16/20). */
  seconds: number;
  /** AI-chosen transition INTO this clip from the previous one. */
  transition?: ReelTransition;
};

export type HelixReelProps = {
  clips: ReelClip[];
};

export const HELIX_REEL_FPS = 30;

/** Frames a given transition overlaps (0 for a hard cut). */
function transitionFrames(t: ReelTransition | undefined, fps: number): number {
  switch (t) {
    case "dissolve":
    case "fadeblack":
      return Math.round(0.5 * fps);
    case "slide":
    case "wipe":
      return Math.round(0.4 * fps);
    default:
      return 0; // "cut" / undefined
  }
}

// Returns a single (erased) presentation type — the concrete props differ per
// transition, so we widen to `unknown` to keep the JSX prop type happy.
function presentationFor(t: ReelTransition): TransitionPresentation<Record<string, unknown>> {
  switch (t) {
    case "slide":
      return slide({ direction: "from-right" }) as TransitionPresentation<Record<string, unknown>>;
    case "wipe":
      return wipe({ direction: "from-left" }) as TransitionPresentation<Record<string, unknown>>;
    // dissolve + fadeblack both render as a crossfade in the live preview.
    default:
      return fade() as TransitionPresentation<Record<string, unknown>>;
  }
}

/** Total timeline length in frames — transitions overlap, so subtract them. */
export function reelDurationInFrames(clips: ReelClip[], fps: number = HELIX_REEL_FPS): number {
  let total = 0;
  clips.forEach((c, i) => {
    total += Math.max(1, Math.round(c.seconds * fps));
    if (i > 0 && c.transition && c.transition !== "cut") total -= transitionFrames(c.transition, fps);
  });
  return Math.max(1, total);
}

export const HelixReel: React.FC<HelixReelProps> = ({ clips }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <TransitionSeries>
        {clips.map((clip, i) => {
          const t = clip.transition ?? "cut";
          const overlap = i > 0 && t !== "cut" ? transitionFrames(t, HELIX_REEL_FPS) : 0;
          return (
            <Fragment key={clip.id}>
              {overlap > 0 && (
                <TransitionSeries.Transition
                  presentation={presentationFor(t)}
                  timing={linearTiming({ durationInFrames: overlap })}
                />
              )}
              <TransitionSeries.Sequence durationInFrames={Math.max(1, Math.round(clip.seconds * HELIX_REEL_FPS))}>
                <OffthreadVideo src={`/api/video/${encodeURIComponent(clip.id)}/content`} />
              </TransitionSeries.Sequence>
            </Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};

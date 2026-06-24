"use client";

/**
 * ReelStage — embedded preview of the stitched long-form reel. Plays every
 * generated clip back-to-back as one continuous timeline in the browser
 * (@remotion/player), so a multi-minute HelixVideo can be scrubbed before any
 * server render.
 */
import { Player } from "@remotion/player";
import { HelixReel, reelDurationInFrames, HELIX_REEL_FPS, type ReelClip } from "./HelixReel";

export function ReelStage({ clips }: { clips: ReelClip[] }) {
  if (clips.length === 0) return null;
  return (
    <Player
      component={HelixReel}
      inputProps={{ clips }}
      durationInFrames={reelDurationInFrames(clips)}
      fps={HELIX_REEL_FPS}
      compositionWidth={1280}
      compositionHeight={720}
      style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden", background: "#000" }}
      controls
    />
  );
}

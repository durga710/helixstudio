/**
 * HelixReel — the long-form stitch. Sora caps a single clip at 20s, so a
 * minutes-long HelixVideo is N generated clips played back-to-back as one
 * continuous timeline. Each clip streams from the authenticated proxy
 * (/api/video/[id]/content); the Series sequences them with no gaps.
 *
 * Used both in the in-browser @remotion/player (live preview) and, later, a
 * server render for a single downloadable MP4.
 */
import { AbsoluteFill, Series, OffthreadVideo } from "remotion";

export type ReelClip = {
  /** Provider video id (its MP4 streams from /api/video/[id]/content). */
  id: string;
  /** Clip length in seconds (one of Sora's 4/8/12/16/20). */
  seconds: number;
};

export type HelixReelProps = {
  clips: ReelClip[];
};

export const HELIX_REEL_FPS = 30;

/** Total timeline length in frames — the Player needs it explicitly. */
export function reelDurationInFrames(clips: ReelClip[], fps: number = HELIX_REEL_FPS): number {
  return Math.max(1, clips.reduce((n, c) => n + Math.max(1, Math.round(c.seconds * fps)), 0));
}

export const HelixReel: React.FC<HelixReelProps> = ({ clips }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Series>
        {clips.map((clip) => (
          <Series.Sequence
            key={clip.id}
            durationInFrames={Math.max(1, Math.round(clip.seconds * HELIX_REEL_FPS))}
          >
            <OffthreadVideo src={`/api/video/${encodeURIComponent(clip.id)}/content`} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};

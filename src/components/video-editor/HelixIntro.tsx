/**
 * HelixIntro — a self-contained Remotion composition for the HelixVideo editor.
 *
 * Built from OpenMontage's media-free primitive components (HeroTitle, TextCard)
 * to prove the embedded editor end to end. Pure animation, no external assets,
 * so it renders cleanly in the in-browser @remotion/player. Later slices drive
 * these props from the AI agent's scene plan and add Sora clips as scene assets.
 *
 * NOTE: the imported primitives are AGPL-3.0 (see ./remotion/NOTICE.md).
 */
import { AbsoluteFill, Sequence } from "remotion";
import { HeroTitle } from "./remotion/components/HeroTitle";
import { TextCard } from "./remotion/components/TextCard";

/** A `type` (not `interface`) so it satisfies @remotion/player's
 * `Record<string, unknown>` props constraint. */
export type HelixIntroProps = {
  title: string;
  subtitle: string;
  /** Each beat is one full-frame TextCard scene, shown in sequence. */
  beats: string[];
};

export const HELIX_INTRO_FPS = 30;
const HERO_FRAMES = 90;
const BEAT_FRAMES = 60;

/** Total timeline length for these props — the Player needs it explicitly. */
export function helixIntroDuration(props: HelixIntroProps): number {
  return HERO_FRAMES + props.beats.length * BEAT_FRAMES;
}

export const HelixIntro: React.FC<HelixIntroProps> = ({ title, subtitle, beats }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0F" }}>
      <Sequence durationInFrames={HERO_FRAMES}>
        <HeroTitle title={title} subtitle={subtitle} />
      </Sequence>
      {beats.map((beat, i) => (
        <Sequence key={i} from={HERO_FRAMES + i * BEAT_FRAMES} durationInFrames={BEAT_FRAMES}>
          <TextCard text={beat} backgroundColor="#0A0A0F" color="#34D399" />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

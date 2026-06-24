"use client";

/**
 * EditorStage — the embedded HelixVideo editor preview.
 *
 * Wraps @remotion/player so a composition renders and scrubs live in the
 * browser (no server render needed). Slice 1: a fixed HelixIntro. Next slices
 * make `props` editable (timeline + inspector) and AI-authored.
 */
import { Player } from "@remotion/player";
import { HelixIntro, HELIX_INTRO_FPS, helixIntroDuration, type HelixIntroProps } from "./HelixIntro";

const DEMO_PROPS: HelixIntroProps = {
  title: "HelixVideo",
  subtitle: "Cinematic AI video — white-labeled",
  beats: ["Describe your scene", "The AI directs the shots", "Render in the studio"],
};

export function EditorStage() {
  return (
    <Player
      component={HelixIntro}
      inputProps={DEMO_PROPS}
      durationInFrames={helixIntroDuration(DEMO_PROPS)}
      fps={HELIX_INTRO_FPS}
      compositionWidth={1280}
      compositionHeight={720}
      style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden" }}
      controls
      loop
    />
  );
}

"use client";

import type { GameProps } from "./index";

/* Placeholder — the real Teach-the-Robot game (field heatmap + Robo + the
 * add-brain-cell / Train / Go loop) lands in the next phase. */
export function TeachTheRobot({ level, onWin }: GameProps) {
  return (
    <div className="grid place-items-center rounded-card border border-border bg-panel2 p-10 text-center">
      <div className="text-4xl">🤖</div>
      <div className="mt-2 text-[14px] font-semibold text-txt">{level.title}</div>
      <div className="mt-1 text-[12.5px] text-txt3">{level.hint}</div>
      <button
        onClick={onWin}
        className="mt-4 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110"
      >
        I taught it! (temporary)
      </button>
    </div>
  );
}

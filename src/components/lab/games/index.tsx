"use client";

import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import type { GameLevel } from "@/lib/lessons/games";

/** A game plays ONE level at a time and tells the shell when the kid wins. */
export interface GameProps {
  level: GameLevel;
  /** The kid beat this level — the shell celebrates + advances. */
  onWin: () => void;
  /** Optional live state for the mentor / narration. */
  onState?: (s: Record<string, unknown>) => void;
}

function gameLoading() {
  return (
    <div className="grid place-items-center rounded-card border border-border bg-panel2 p-12 text-[13px] text-txt3">
      loading the game…
    </div>
  );
}

const TeachTheRobot = dynamic(() => import("./teach-the-robot").then((m) => m.TeachTheRobot), { ssr: false, loading: gameLoading });

/** id → game component. Keep in sync with GAME_CATALOG (games.ts). */
export const GAMES: Record<string, ComponentType<GameProps>> = {
  "teach-the-robot": TeachTheRobot,
};

export function GameHost({ game, ...props }: { game: string } & GameProps) {
  const Comp = GAMES[game];
  if (!Comp) {
    return (
      <div className="grid place-items-center rounded-card border border-dashed border-border2 bg-panel2 p-12 text-center">
        <div className="text-3xl">🎮</div>
        <div className="mt-2 text-[13px] font-medium text-txt2">This game is coming soon</div>
      </div>
    );
  }
  return <Comp {...props} />;
}

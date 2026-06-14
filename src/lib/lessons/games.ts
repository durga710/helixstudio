/**
 * Server-safe catalog of the Lab's GAMES — the "learn ML by playing" experiences
 * (distinct from lessons and studios). A game is a short, level-based, character-
 * driven loop a young child can play: do a tiny action → watch your creation
 * react → beat the level. Metadata only; the client renders it.
 *
 * Games reuse the lesson progress API by namespacing as `game:<id>` (see
 * gameProgressId) — no DB change. `currentStep` stores the player's level.
 */

/** A shape the player's model must learn — the game maps this to a dataset. */
export type GameShape = "twoBlobs" | "oneBend" | "ring" | "spiral" | "newField";

export interface GameLevel {
  id: string;
  /** Kid-facing, short. */
  title: string;
  /** One short, friendly line of help. */
  hint: string;
  shape: GameShape;
}

export interface GameMeta {
  id: string;
  title: string;
  /** One playful line shown on the card + intro. */
  tagline: string;
  /** Lucide icon key + a big emoji for the character/card. */
  icon: string;
  emoji: string;
  /** Picture-first "how to play" steps (emoji + a few words — no walls of text). */
  howTo: { emoji: string; text: string }[];
  levels: GameLevel[];
  order: number;
}

const teachTheRobot: GameMeta = {
  id: "teach-the-robot",
  title: "Teach the Robot",
  tagline: "Give Robo brain cells and train it to learn shapes!",
  icon: "Bot",
  emoji: "🤖",
  howTo: [
    { emoji: "🧠", text: "Press TRAIN to make Robo think." },
    { emoji: "➕", text: "Stuck? Give Robo another brain cell." },
    { emoji: "🎉", text: "When Robo learns the shape, you win!" },
  ],
  levels: [
    { id: "l1", title: "Two piles", hint: "An easy one to start — press TRAIN!", shape: "twoBlobs" },
    { id: "l2", title: "A little bend", hint: "Robo needs to bend its thinking. Add a brain cell!", shape: "oneBend" },
    { id: "l3", title: "The ring", hint: "A circle! Robo needs a few more brain cells.", shape: "ring" },
    { id: "l4", title: "Tricky swirl", hint: "Even trickier — keep adding brain cells and training.", shape: "spiral" },
    { id: "l5", title: "Show off!", hint: "A brand-new field Robo has never seen. Can it still do it?", shape: "newField" },
  ],
  order: 1,
};

export const GAME_CATALOG: GameMeta[] = [teachTheRobot];

export const GAME_IDS: string[] = GAME_CATALOG.map((g) => g.id);

export function getGameMeta(id: string): GameMeta | undefined {
  return GAME_CATALOG.find((g) => g.id === id);
}

/** The lessonId used to persist a game's progress via /api/lab/progress. */
export function gameProgressId(id: string): string {
  return `game:${id}`;
}

/**
 * Game Agent — the hidden engine map (client-safe; NO server-only imports, so
 * both the client landing page and the server workspace route can import it).
 *
 * Students pick a CATEGORY (what kind of game they want) — never an engine or a
 * framework. Each category resolves to a starter TEMPLATE id; the engine is an
 * implementation detail. Admins/testers can override the engine directly via a
 * quiet control, which maps straight to a template id. All routing is 0-token.
 */

export interface GameEngine {
  /** Stable id used by the admin override + the manifest's `engine` field. */
  id: string;
  /** Shown only in the admin override selector (students never see this). */
  label: string;
  /** The starter this engine scaffolds from. */
  templateId: string;
}

/** Every engine the Game Agent can scaffold. Order = override dropdown order.
 * (Godot joins in Phase 2 once the served-preview + export infra lands.) */
export const GAME_ENGINES: GameEngine[] = [
  { id: "phaser", label: "2D · Phaser", templateId: "game-2d" },
  { id: "playcanvas", label: "3D · PlayCanvas", templateId: "game-3d-pc" },
  { id: "babylon", label: "3D · Babylon", templateId: "game-3d" },
];

export interface GameCategory {
  /** Stable id sent to the server as `gameCategory`. */
  id: string;
  /** Kid-facing card title. */
  label: string;
  /** One-line example under the title. */
  example: string;
  /** Lucide icon key, resolved to a component in the client component. */
  icon: string;
  /** Forced starter for this category; null = "My Own Idea" → keyword classify. */
  templateId: string | null;
  /** Category-aware prompt placeholder + example chips. */
  placeholder: string;
  suggestions: string[];
}

/** The six game-type cards — the entire student-facing menu. Cards that will
 * move to Godot in Phase 2 (platformer, adventure) quietly use Phaser today, so
 * nothing is ever broken or empty. */
export const GAME_CATEGORIES: GameCategory[] = [
  {
    id: "platformer",
    label: "Platformer",
    example: "Jump across platforms",
    icon: "Footprints",
    templateId: "game-2d",
    placeholder: "A platformer where I run and jump across platforms to reach the flag…",
    suggestions: ["A Mario-style platformer", "A jump-and-run with coins to collect", "A platformer with moving platforms"],
  },
  {
    id: "runner",
    label: "Endless Runner",
    example: "Keep going, dodge stuff",
    icon: "Rabbit",
    templateId: "game-2d",
    placeholder: "An endless runner where I keep going and dodge obstacles, with a score…",
    suggestions: ["A Flappy Bird game", "An endless runner like Jetpack Joyride", "A dino-style jump-over-cactus game"],
  },
  {
    id: "arcade",
    label: "Arcade Classic",
    example: "Snake, Pong, Brick-breaker",
    icon: "Joystick",
    templateId: "game-2d",
    placeholder: "A snake game that gets faster as I eat, with a high score…",
    suggestions: ["A snake game that speeds up", "Pong against the computer", "A brick-breaker game", "A space shooter with waves"],
  },
  {
    id: "adventure",
    label: "Adventure",
    example: "Explore a world, mazes, RPG",
    icon: "Map",
    templateId: "game-2d",
    placeholder: "A top-down adventure where I explore a map and find the exit…",
    suggestions: ["A top-down maze to escape", "A little RPG where I explore a village", "A collect-the-keys dungeon game"],
  },
  {
    id: "world3d",
    label: "3D World",
    example: "Walk around in 3D",
    icon: "Globe",
    templateId: "game-3d-pc",
    placeholder: "A 3D world I can walk around in with the arrow keys to explore…",
    suggestions: ["A 3D world I can walk around", "A first-person scene to explore", "A 3D ball that rolls to collect coins"],
  },
  {
    id: "own",
    label: "My Own Idea",
    example: "Describe anything",
    icon: "Sparkles",
    templateId: null,
    placeholder: "Describe any game you can imagine — Helix figures out how to build it…",
    suggestions: ["A puzzle game with falling blocks", "A whack-a-mole game", "A 2-player tag game"],
  },
];

/** Resolve a category id → its forced starter id (null = let the prompt decide). */
export function templateForCategory(id: string): string | null {
  return GAME_CATEGORIES.find((c) => c.id === id)?.templateId ?? null;
}

/** Resolve an engine override id → its starter id (null = unknown engine). */
export function templateForEngine(id: string): string | null {
  return GAME_ENGINES.find((e) => e.id === id)?.templateId ?? null;
}

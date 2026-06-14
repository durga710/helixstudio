# Premium Godot game starter — how to build on it

A **complete, playable Godot 4 game** — "dodge the falling blocks". Don't rebuild it
from scratch — **extend the gameplay** for the user's idea.

## Already done (a real game, not a demo)
- **Player**: the scene's `Player` (a ColorRect), moved with the arrow keys in `main.gd`.
- **Enemies**: a spawner in `_process` drops red blocks that fall faster + more often
  over time (`_spawn_enemy()` + `spawn_t`/`spawn_every`/`fall_speed`).
- **Collision**: AABB overlap (`Rect2.intersects`) between the player and each enemy.
- **Score + state**: a live score `Label`, a `Game over` message, and **Enter to restart**.
- **Scene**: `main.tscn` (Background + Player + Label). **Export**: `project.godot` +
  `export_presets.cfg` are set up for web.

## Your job (extend it for the user's idea)
1. Reskin/retheme the player + enemies; rename things for the user's game.
2. Add to the gameplay using the patterns already here: spawn entities with
   `ColorRect.new()` + a timer, move them in `_process`, hit-test with
   `Rect2.intersects`, update the score `Label`.
3. Add depth: new enemy types, **collectibles/power-ups**, multiple lives, levels,
   a **real win condition**, simple sounds.
4. Tell the user to press **Build & Play** and that the arrow keys move the player —
   make sure it's fun and the controls respond.

## Rules
- Input actions `ui_left/ui_right/ui_up/ui_down/ui_accept` are **auto-wired** (no input map).
- Use **ColorRect / Polygon2D / Sprite2D** and generated shapes — there are **NO image files**.
- **GDScript uses TAB indentation.** Edit `main.gd` and `main.tscn` only.
- **Do NOT** touch `export_presets.cfg`/export settings or rename `project.godot`.
- It's **not** previewed live — the user presses **Build & Play** to compile + run.
- Keep it a working, playable game at every step.

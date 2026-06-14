# Premium 2D game skeleton — how to build on it

A complete, structured Phaser 3 game. Don't rebuild it — build the gameplay in.

## Already done (do not recreate)
- **Scene flow**: `MenuScene → PlayScene → OverScene` (game.js).
- **HUD**: score + lives, win/lose handling, camera-shake juice.
- **Theming**: 6 palettes (`PALETTES` in game.js, matching style.css), live theme picker.
- **Boot**: Phaser loaded from a CDN in `index.html`; `game.js` is a plain global script.

## Your job (the "blank")
- Edit **`PlayScene.create()` / `PlayScene.update()`** in `game.js` only:
  design the level (the `addPlatform(...)` calls), the entities, the mechanics,
  and the scoring/win condition for the user's game.
- Set the game name (`data-game-name` in index.html + the Menu/Over titles).

## Rules
- Use the palette colors via `P()` (`p.player`, `p.coin`, `p.enemy`, `p.ground`,
  `p.sky`, `p.text`) — **never hard-code hex**, so the theme picker keeps working.
- Plain script using the global `Phaser` — **no ES module imports** (the preview
  inlines `game.js`). No build step; don't touch `index.html`.
- Sprites are generated shapes (no image files). Keep it runnable — the preview
  must always render.
- You usually only need to read + edit **`game.js`**.

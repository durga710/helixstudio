# Premium 3D game skeleton — how to build on it

A complete, structured Babylon.js game. Don't rebuild it — build the gameplay in.

## Already done (do not recreate)
- **Scene**: engine, scene, orbit/follow camera, hemispheric + directional lights.
- **UI flow**: Menu → Play → Win overlays (`index.html`) + a HUD, driven by `setState()`.
- **Theming**: 6 palettes (`PALETTES` in game.js, matching style.css) via `applyTheme()`.
- **Loop**: `engine.runRenderLoop` + input; movement, collect, and win wired.

## Your job (the "blank")
- Edit the **gameplay** in `game.js`: the meshes + level in `spawnOrbs()`, the
  movement/rules in `tick()`, the scoring/win in `collect()`. Build the user's
  game with `BABYLON.MeshBuilder` shapes.
- Set the game name (`data-game-name` in index.html + the menu/win titles).

## Rules
- Use `PALETTES` colors + `applyTheme()` — **never hard-code colors**, so the theme
  picker keeps working.
- Plain script using the global `BABYLON` — **no ES module imports**, and **do NOT
  switch to Three.js** (its CDN is ES-module-only and will break the preview).
- No external 3D model files (use MeshBuilder). No build step; don't touch the
  camera/lights/UI flow. Keep it runnable — the preview must always render.
- You usually only need to read + edit **`game.js`**.

/* Premium 3D game skeleton — Babylon.js (global `BABYLON`, no imports).
 * A complete collect-the-orbs game: a Menu → Play → Win flow, a movable player,
 * a follow/orbit camera, lights, themed materials, a HUD, score, and a win
 * condition. BUILD THE USER'S GAME by editing the gameplay (spawnOrbs / tick /
 * collect and the meshes) — the scene, camera, lights, UI flow, and 6-palette
 * theme system are already done. Meshes use BABYLON.MeshBuilder (no 3D model
 * files). Keep it a plain global-`BABYLON` script (no ES module imports). */

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);
const $ = (id) => document.getElementById(id);

/* Palettes — same names as the page chrome (style.css). Hex strings → Babylon colors. */
const PALETTES = {
  midnight: { sky: "#0b1020", ground: "#1a2540", player: "#5b8cff", orb: "#ffb000" },
  ocean:    { sky: "#07171c", ground: "#123642", player: "#21c8c0", orb: "#34a0ff" },
  forest:   { sky: "#0c150f", ground: "#1a2c20", player: "#34c759", orb: "#b6e34a" },
  sunset:   { sky: "#1a1012", ground: "#321e22", player: "#ff7a59", orb: "#ffb000" },
  grape:    { sky: "#130d1f", ground: "#281b3e", player: "#a855f7", orb: "#ec4899" },
  paper:    { sky: "#dfe4ee", ground: "#c7d0e0", player: "#4f46e5", orb: "#f59e0b" },
};
const themeName = () => document.documentElement.dataset.theme || "midnight";
const PAL = () => PALETTES[themeName()] || PALETTES.midnight;
const C3 = (hex) => BABYLON.Color3.FromHexString(hex);

const ARENA = 9;
let scene, camera, player, groundMat, playerMat, orbMat;
let orbs = [];
let score = 0, orbsLeft = 0, state = "menu";
const keys = {};

function createScene() {
  scene = new BABYLON.Scene(engine);

  camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 3.2, 18, new BABYLON.Vector3(0, 0.5, 0), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 9;
  camera.upperRadiusLimit = 28;
  camera.upperBetaLimit = Math.PI / 2.1;
  // Arrow keys are for the player, not the camera.
  const kb = camera.inputs.attached.keyboard;
  if (kb) camera.inputs.remove(kb);

  const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0.3, 1, 0.2), scene);
  light.intensity = 0.95;
  const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-0.4, -1, -0.3), scene);
  dir.intensity = 0.4;

  groundMat = new BABYLON.StandardMaterial("gm", scene);
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: ARENA * 2 + 2, height: ARENA * 2 + 2 }, scene);
  ground.material = groundMat;

  playerMat = new BABYLON.StandardMaterial("pm", scene);
  player = BABYLON.MeshBuilder.CreateSphere("player", { diameter: 1 }, scene);
  player.position.y = 0.5;
  player.material = playerMat;

  orbMat = new BABYLON.StandardMaterial("om", scene);
  applyTheme();
  spawnOrbs();
  return scene;
}

function applyTheme() {
  const p = PAL();
  const sky = C3(p.sky);
  scene.clearColor = new BABYLON.Color4(sky.r, sky.g, sky.b, 1);
  groundMat.diffuseColor = C3(p.ground);
  groundMat.specularColor = new BABYLON.Color3(0.04, 0.04, 0.04);
  playerMat.diffuseColor = C3(p.player);
  playerMat.emissiveColor = C3(p.player).scale(0.35);
  orbMat.diffuseColor = C3(p.orb);
  orbMat.emissiveColor = C3(p.orb).scale(0.6);
}

function spawnOrbs() {
  orbs.forEach((o) => o.dispose());
  orbs = [];
  const spots = [[-6, -6], [6, -5], [-5, 6], [7, 6], [0, 7], [-7, 0]];
  spots.forEach(([x, z], i) => {
    const orb = BABYLON.MeshBuilder.CreateSphere("orb" + i, { diameter: 0.6 }, scene);
    orb.position.set(x, 0.7, z);
    orb.material = orbMat;
    orb.baseY = 0.7;
    orb.phase = i;
    orbs.push(orb);
  });
  orbsLeft = orbs.length;
}

function resetGame() {
  score = 0;
  player.position.set(0, 0.5, 0);
  spawnOrbs();
  updateHud();
}

function updateHud() {
  $("score").textContent = score;
  $("left").textContent = orbsLeft;
}

function setState(s) {
  state = s;
  $("menu").classList.toggle("hidden", s !== "menu");
  $("over").classList.toggle("hidden", s !== "over");
  $("hud").classList.toggle("hidden", s !== "play");
}

function collect(orb) {
  orb.dispose();
  orbs = orbs.filter((o) => o !== orb);
  score += 10;
  orbsLeft -= 1;
  updateHud();
  if (orbsLeft <= 0) {
    $("over-title").textContent = "You win! 🎉";
    $("over-score").textContent = "Score: " + score;
    setState("over");
  }
}

function tick() {
  if (state === "play") {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    const speed = 8;
    let dx = 0, dz = 0;
    if (keys["w"] || keys["arrowup"]) dz -= 1;
    if (keys["s"] || keys["arrowdown"]) dz += 1;
    if (keys["a"] || keys["arrowleft"]) dx -= 1;
    if (keys["d"] || keys["arrowright"]) dx += 1;
    const len = Math.hypot(dx, dz) || 1;
    player.position.x = Math.max(-ARENA, Math.min(ARENA, player.position.x + (dx / len) * speed * dt));
    player.position.z = Math.max(-ARENA, Math.min(ARENA, player.position.z + (dz / len) * speed * dt));
    camera.target.copyFrom(player.position);
  }
  // Orbs gently bob + spin (also a nice menu backdrop).
  const t = performance.now() / 600;
  for (const orb of orbs) {
    orb.position.y = orb.baseY + Math.sin(t + orb.phase) * 0.18;
    orb.rotation.y += 0.03;
    if (state === "play" && BABYLON.Vector3.Distance(player.position, orb.position) < 1.1) collect(orb);
  }
}

createScene();
engine.runRenderLoop(() => { tick(); scene.render(); });
window.addEventListener("resize", () => engine.resize());
window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

$("play-btn").addEventListener("click", () => { resetGame(); setState("play"); });
$("again-btn").addEventListener("click", () => { resetGame(); setState("play"); });

const sel = $("theme-select");
Object.keys(PALETTES).forEach((t) => sel.add(new Option(t[0].toUpperCase() + t.slice(1), t)));
sel.value = themeName();
sel.addEventListener("change", () => { document.documentElement.dataset.theme = sel.value; applyTheme(); });

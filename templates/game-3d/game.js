// 3D game starter — Babylon.js (global `BABYLON`, no imports).
// An orbit camera, a light, a ground, and a spinning box to get you started.
// Build your game by editing this file: add meshes, materials, input, physics,
// and game logic. Use BABYLON.MeshBuilder for shapes (no external 3D models).

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

function createScene() {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.06, 0.09, 0.16, 1);

  // Camera — drag to orbit, scroll to zoom.
  const camera = new BABYLON.ArcRotateCamera(
    "camera",
    -Math.PI / 2,
    Math.PI / 2.6,
    9,
    new BABYLON.Vector3(0, 0.5, 0),
    scene,
  );
  camera.attachControl(canvas, true);

  // Light.
  const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
  light.intensity = 0.9;

  // Ground.
  BABYLON.MeshBuilder.CreateGround("ground", { width: 12, height: 12 }, scene);

  // A spinning box — your player / object.
  const box = BABYLON.MeshBuilder.CreateBox("box", { size: 1 }, scene);
  box.position.y = 0.5;
  const mat = new BABYLON.StandardMaterial("mat", scene);
  mat.diffuseColor = new BABYLON.Color3(1, 0, 0.3);
  box.material = mat;
  scene.registerBeforeRender(() => {
    box.rotation.y += 0.01;
  });

  return scene;
}

const scene = createScene();
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

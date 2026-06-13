// 3D game starter — PlayCanvas engine (global `pc`, no imports).
// A camera, a light, a ground, and a spinning box to get you started.
// Build your game by editing this file: add entities, materials, input, and
// game logic with PlayCanvas's API. Use procedural primitives (box/sphere/
// cylinder via the `render` component) — there are no external 3D models.

const canvas = document.getElementById("application");

const app = new pc.Application(canvas, {
  mouse: new pc.Mouse(canvas),
  keyboard: new pc.Keyboard(window),
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
window.addEventListener("resize", () => app.resizeCanvas());

// Camera.
const camera = new pc.Entity("camera");
camera.addComponent("camera", { clearColor: new pc.Color(0.06, 0.09, 0.16) });
camera.setPosition(0, 4, 8);
camera.lookAt(0, 0.5, 0);
app.root.addChild(camera);

// Light.
const light = new pc.Entity("light");
light.addComponent("light", { type: "directional", intensity: 1 });
light.setEulerAngles(50, 30, 0);
app.root.addChild(light);

// Ground.
const ground = new pc.Entity("ground");
ground.addComponent("render", { type: "box" });
ground.setLocalScale(12, 0.5, 12);
ground.setPosition(0, -0.25, 0);
app.root.addChild(ground);

// A spinning box — your player / object.
const box = new pc.Entity("box");
box.addComponent("render", { type: "box" });
box.setPosition(0, 0.5, 0);
const mat = new pc.StandardMaterial();
mat.diffuse = new pc.Color(1, 0, 0.3);
mat.update();
box.render.material = mat;
app.root.addChild(box);

app.on("update", (dt) => {
  box.rotate(0, 60 * dt, 0);
});

app.start();

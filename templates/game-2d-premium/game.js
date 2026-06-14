/* Premium 2D game skeleton — Phaser 3 (global `Phaser`, no imports).
 * A complete, structured platformer: a Menu → Play → Game Over flow with score,
 * lives, a patrolling enemy, collectibles, a win condition, and theme support.
 * BUILD THE USER'S GAME by editing PlayScene (the gameplay) — the scene flow,
 * HUD, win/lose, and theming are already done. Sprites use generated shapes
 * (no image files); swap in your own mechanics, levels, and entities. */

const W = 800;
const H = 450;

/* Game palettes — same names as the page chrome (style.css). Colors are 0xRRGGBB
 * for the canvas. The active theme comes from <html data-theme>. */
const PALETTES = {
  midnight: { sky: 0x0b1020, ground: 0x26314d, player: 0x5b8cff, coin: 0xffb000, enemy: 0xff004d, text: "#eaf0fb" },
  ocean:    { sky: 0x07171c, ground: 0x1c4350, player: 0x21c8c0, coin: 0x34a0ff, enemy: 0xff6b6b, text: "#e6fbff" },
  forest:   { sky: 0x0c150f, ground: 0x244031, player: 0x34c759, coin: 0xb6e34a, enemy: 0xff4d6d, text: "#e9f6ec" },
  sunset:   { sky: 0x1a1012, ground: 0x46282d, player: 0xff7a59, coin: 0xffb000, enemy: 0xc084fc, text: "#fdefe9" },
  grape:    { sky: 0x130d1f, ground: 0x3a2957, player: 0xa855f7, coin: 0xec4899, enemy: 0x22d3ee, text: "#f1e9fb" },
  paper:    { sky: 0xeef1f7, ground: 0xc7d0e0, player: 0x4f46e5, coin: 0xf59e0b, enemy: 0xef4444, text: "#1a2236" },
};
const theme = () => document.documentElement.dataset.theme || "midnight";
const P = () => PALETTES[theme()] || PALETTES.midnight;

/* ── Menu ──────────────────────────────────────────────────────────────── */
class MenuScene extends Phaser.Scene {
  constructor() { super("menu"); }
  create() {
    const p = P();
    this.cameras.main.setBackgroundColor(p.sky);
    this.add.text(W / 2, H / 2 - 60, "MY GAME", { fontFamily: "sans-serif", fontSize: "44px", fontStyle: "bold", color: p.text }).setOrigin(0.5);
    this.add.text(W / 2, H / 2, "Arrow keys / WASD to move · Up to jump · grab the coins", { fontFamily: "sans-serif", fontSize: "15px", color: p.text }).setOrigin(0.5).setAlpha(0.8);
    const btn = this.add.text(W / 2, H / 2 + 64, "▶  PLAY", { fontFamily: "sans-serif", fontSize: "22px", fontStyle: "bold", color: p.text, backgroundColor: "#00000033", padding: { x: 18, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: btn, scale: 1.06, duration: 700, yoyo: true, repeat: -1 });
    const go = () => this.scene.start("play");
    btn.on("pointerdown", go);
    this.input.keyboard.once("keydown-SPACE", go);
    this.input.keyboard.once("keydown-ENTER", go);
  }
}

/* ── Play (build the game here) ────────────────────────────────────────── */
class PlayScene extends Phaser.Scene {
  constructor() { super("play"); }
  create() {
    const p = P();
    this.cameras.main.setBackgroundColor(p.sky);
    this.score = 0;
    this.lives = 3;

    // Platforms (static). Add/replace these to design your level.
    this.platforms = [];
    const addPlatform = (x, y, w, h) => {
      const r = this.add.rectangle(x, y, w, h, p.ground);
      this.physics.add.existing(r, true);
      this.platforms.push(r);
    };
    addPlatform(W / 2, H - 18, W, 36); // ground
    addPlatform(160, 320, 180, 22);
    addPlatform(480, 250, 200, 22);
    addPlatform(680, 350, 160, 22);

    // Player
    this.player = this.add.rectangle(80, 200, 30, 38, p.player);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.platforms);

    // Coins — collect them all to win.
    this.coins = [];
    [[160, 280], [480, 210], [680, 310], [300, 120], [560, 120]].forEach(([x, y]) => {
      const c = this.add.circle(x, y, 9, p.coin);
      this.physics.add.existing(c);
      c.body.setAllowGravity(false);
      this.tweens.add({ targets: c, y: y - 8, duration: 600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.physics.add.overlap(this.player, c, () => this.collect(c));
      this.coins.push(c);
    });

    // Enemy — patrols; touch it and you lose a life.
    this.enemy = this.add.rectangle(480, 226, 28, 28, p.enemy);
    this.physics.add.existing(this.enemy);
    this.enemy.body.setAllowGravity(false);
    this.tweens.add({ targets: this.enemy, x: 620, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.physics.add.overlap(this.player, this.enemy, () => this.hit());

    // HUD
    this.scoreText = this.add.text(14, 12, "Score 0", { fontFamily: "sans-serif", fontSize: "18px", fontStyle: "bold", color: p.text });
    this.livesText = this.add.text(W - 14, 12, "♥ ♥ ♥", { fontFamily: "sans-serif", fontSize: "18px", color: p.text }).setOrigin(1, 0);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,D");
    this.invuln = false;
  }

  collect(c) {
    if (!c.active) return;
    c.destroy();
    this.coins = this.coins.filter((x) => x !== c);
    this.score += 10;
    this.scoreText.setText("Score " + this.score);
    if (this.coins.length === 0) this.scene.start("over", { win: true, score: this.score });
  }

  hit() {
    if (this.invuln) return;
    this.invuln = true;
    this.lives -= 1;
    this.livesText.setText("♥ ".repeat(Math.max(0, this.lives)).trim() || "—");
    this.cameras.main.shake(180, 0.01);
    this.player.setAlpha(0.4);
    this.time.delayedCall(800, () => { this.invuln = false; this.player.setAlpha(1); });
    if (this.lives <= 0) this.scene.start("over", { win: false, score: this.score });
  }

  update() {
    const b = this.player.body;
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    b.setVelocityX(left ? -240 : right ? 240 : 0);
    const jump = this.cursors.up.isDown || this.keys.W.isDown || this.cursors.space.isDown;
    if (jump && b.blocked.down) b.setVelocityY(-560);
  }
}

/* ── Game Over / Win ──────────────────────────────────────────────────── */
class OverScene extends Phaser.Scene {
  constructor() { super("over"); }
  init(data) { this.win = Boolean(data?.win); this.finalScore = data?.score ?? 0; }
  create() {
    const p = P();
    this.cameras.main.setBackgroundColor(p.sky);
    this.add.text(W / 2, H / 2 - 50, this.win ? "YOU WIN! 🎉" : "GAME OVER", { fontFamily: "sans-serif", fontSize: "40px", fontStyle: "bold", color: p.text }).setOrigin(0.5);
    this.add.text(W / 2, H / 2 + 4, "Score: " + this.finalScore, { fontFamily: "sans-serif", fontSize: "20px", color: p.text }).setOrigin(0.5).setAlpha(0.85);
    const btn = this.add.text(W / 2, H / 2 + 64, "↻  PLAY AGAIN", { fontFamily: "sans-serif", fontSize: "20px", fontStyle: "bold", color: p.text, backgroundColor: "#00000033", padding: { x: 16, y: 9 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const go = () => this.scene.start("menu");
    btn.on("pointerdown", go);
    this.input.keyboard.once("keydown-SPACE", go);
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: W,
  height: H,
  physics: { default: "arcade", arcade: { gravity: { y: 1100 }, debug: false } },
  scene: [MenuScene, PlayScene, OverScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});

/* Theme picker — re-themes the whole game (restarts the active scene with the
 * new palette). Same 6 palettes as every Helix premium skeleton. */
const sel = document.getElementById("theme-select");
if (sel) {
  Object.keys(PALETTES).forEach((t) => sel.add(new Option(t[0].toUpperCase() + t.slice(1), t)));
  sel.value = theme();
  sel.addEventListener("change", () => {
    document.documentElement.dataset.theme = sel.value;
    game.scene.getScenes(true).forEach((s) => s.scene.restart());
  });
}

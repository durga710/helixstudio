// 2D game starter — Phaser 3 (global `Phaser`, no imports).
// A player you move with the arrow keys, with gravity and a ground to stand on.
// Build your game by editing this file: add scenes, enemies, scoring, levels…
// Sprites use generated shapes/textures (there are no image asset files).

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: 800,
  height: 450,
  backgroundColor: "#1d2b53",
  physics: { default: "arcade", arcade: { gravity: { y: 900 }, debug: false } },
  scene: { create, update },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
};

let player;
let cursors;

function create() {
  // Ground — a static physics body the player lands on.
  const ground = this.add.rectangle(400, 432, 800, 36, 0x29366f);
  this.physics.add.existing(ground, true);

  // Player — a simple rectangle with physics.
  player = this.add.rectangle(120, 200, 34, 34, 0xff004d);
  this.physics.add.existing(player);
  player.body.setCollideWorldBounds(true);
  this.physics.add.collider(player, ground);

  cursors = this.input.keyboard.createCursorKeys();

  this.add.text(16, 14, "Arrow keys to move · Up to jump", {
    fontFamily: "monospace",
    fontSize: "16px",
    color: "#ffffff",
  });
}

function update() {
  const speed = 260;
  if (cursors.left.isDown) player.body.setVelocityX(-speed);
  else if (cursors.right.isDown) player.body.setVelocityX(speed);
  else player.body.setVelocityX(0);

  const onGround = player.body.blocked.down || player.body.touching.down;
  if (cursors.up.isDown && onGround) player.body.setVelocityY(-520);
}

new Phaser.Game(config);

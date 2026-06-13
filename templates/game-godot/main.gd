extends Node2D

# Godot starter — move the box with the arrow keys.
# Build your game by editing this script and main.tscn: add nodes, scenes,
# input, physics, and game logic in GDScript. This is a real Godot project,
# compiled to the web when you press Build & Play.
# (GDScript uses TAB indentation.)

const SPEED := 320.0

@onready var player: ColorRect = $Player


func _process(delta: float) -> void:
	var dir := Vector2.ZERO
	if Input.is_action_pressed("ui_right"):
		dir.x += 1.0
	if Input.is_action_pressed("ui_left"):
		dir.x -= 1.0
	if Input.is_action_pressed("ui_down"):
		dir.y += 1.0
	if Input.is_action_pressed("ui_up"):
		dir.y -= 1.0
	player.position += dir.normalized() * SPEED * delta
	player.position = player.position.clamp(Vector2.ZERO, Vector2(760, 410))

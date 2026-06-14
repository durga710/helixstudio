extends Node2D

# PREMIUM Godot starter — a complete, playable "dodge the falling blocks" game.
# Arrow keys move the player; dodge the red blocks; your score climbs the longer
# you survive; press Enter to restart after a game over. Built on the scene's
# Player + Label nodes — enemies, score and the game loop are created here in
# code so they're easy to read and extend. (GDScript uses TAB indentation.)
#
# YOUR JOB (extend this): new enemy types, power-ups, levels, sounds, a real win
# condition, etc. See AGENTS.md.

const SPEED := 320.0
const FIELD := Vector2(800, 450)
const PLAYER_SIZE := Vector2(40, 40)
const ENEMY_SIZE := Vector2(34, 34)

@onready var player: ColorRect = $Player
@onready var info: Label = $Label

var score_label: Label
var enemies: Array[ColorRect] = []
var spawn_t := 0.0
var spawn_every := 0.9
var fall_speed := 150.0
var score := 0.0
var playing := true


func _ready() -> void:
	score_label = Label.new()
	score_label.position = Vector2(20, 44)
	add_child(score_label)
	info.text = "Arrow keys to move — dodge the red blocks!"
	player.position = Vector2(380, 380)


func _process(delta: float) -> void:
	if not playing:
		if Input.is_action_just_pressed("ui_accept"):
			_restart()
		return

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
	player.position.x = clamp(player.position.x, 0.0, FIELD.x - PLAYER_SIZE.x)
	player.position.y = clamp(player.position.y, 0.0, FIELD.y - PLAYER_SIZE.y)

	spawn_t += delta
	if spawn_t >= spawn_every:
		spawn_t = 0.0
		_spawn_enemy()
		spawn_every = max(0.35, spawn_every - 0.015)
		fall_speed = min(420.0, fall_speed + 6.0)

	var player_rect := Rect2(player.position, PLAYER_SIZE)
	for e in enemies.duplicate():
		e.position.y += fall_speed * delta
		if e.position.y > FIELD.y:
			e.queue_free()
			enemies.erase(e)
		elif player_rect.intersects(Rect2(e.position, ENEMY_SIZE)):
			_game_over()
			return

	score += delta * 10.0
	score_label.text = "Score: %d" % int(score)


func _spawn_enemy() -> void:
	var e := ColorRect.new()
	e.color = Color(0.97, 0.44, 0.44)
	e.size = ENEMY_SIZE
	e.position = Vector2(randf() * (FIELD.x - ENEMY_SIZE.x), -ENEMY_SIZE.y)
	add_child(e)
	enemies.append(e)


func _game_over() -> void:
	playing = false
	info.text = "Game over! Score %d — press Enter to play again" % int(score)


func _restart() -> void:
	for e in enemies:
		e.queue_free()
	enemies.clear()
	score = 0.0
	spawn_t = 0.0
	spawn_every = 0.9
	fall_speed = 150.0
	player.position = Vector2(380, 380)
	info.text = "Arrow keys to move — dodge the red blocks!"
	playing = true

"""API controllers — the routes for the items resource."""
from flask import Blueprint, jsonify, request

from app.models.item import all_items, add_item

bp = Blueprint("api", __name__)


@bp.get("/items")
def list_items():
    return jsonify(all_items())


@bp.post("/items")
def create_item():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify(error="name is required"), 400
    return jsonify(add_item(name)), 201

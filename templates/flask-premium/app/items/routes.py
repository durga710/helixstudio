"""HTMX items resource — the handlers render an HTML PARTIAL (not JSON), which
HTMX swaps into the page. Copy this pattern for the user's real feature."""
from flask import Blueprint, render_template, request

from app.models.item import all_items, add_item

bp = Blueprint("items", __name__)


@bp.get("/")
def list_items():
    return render_template("partials/_items.html", items=all_items())


@bp.post("/")
def create_item():
    name = (request.form.get("name") or "").strip()
    if name:
        add_item(name)
    return render_template("partials/_items.html", items=all_items())

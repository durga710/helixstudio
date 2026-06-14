"""Server-rendered pages. Add a page by copying a route + a template in
app/templates/ and a link in partials/_sidebar.html."""
from flask import Blueprint, render_template

from app.models.item import all_items

bp = Blueprint("pages", __name__)


@bp.get("/")
def landing():
    return render_template("landing.html", page="landing")


@bp.get("/login")
def login():
    return render_template("login.html", page="login")


@bp.get("/dashboard")
def dashboard():
    return render_template("dashboard.html", page="dashboard", items=all_items())


@bp.get("/settings")
def settings():
    return render_template("settings.html", page="settings")

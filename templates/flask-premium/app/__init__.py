"""Application factory. Server-rendered (Jinja) premium app with HTMX + Alpine."""
from flask import Flask

from config import get_config


def create_app() -> Flask:
    app = Flask(__name__)  # templates/ + static/ live inside this package
    app.config.from_object(get_config())
    # AI: set the product name — it flows into every template as `app_name`.
    app.config.setdefault("APP_NAME", "Helix App")

    from app.pages.routes import bp as pages_bp
    from app.items.routes import bp as items_bp

    app.register_blueprint(pages_bp)
    app.register_blueprint(items_bp, url_prefix="/items")

    @app.context_processor
    def inject_globals():
        return {"app_name": app.config["APP_NAME"]}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.errorhandler(404)
    def not_found(_e):
        return "Not found", 404

    return app

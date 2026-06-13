"""Application factory. Keeps app creation testable and config-driven."""
from flask import Flask, jsonify

from config import get_config


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(get_config())

    # Blueprints (controllers) — register feature modules here.
    from app.api.routes import bp as api_bp

    app.register_blueprint(api_bp, url_prefix="/api")

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    @app.errorhandler(404)
    def not_found(_e):
        return jsonify(error="not found"), 404

    return app

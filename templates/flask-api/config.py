"""Configuration. Secrets come from the environment — never hard-code them."""
import os


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")
    JSON_SORT_KEYS = False
    DEBUG = os.environ.get("FLASK_DEBUG", "0") == "1"


class ProductionConfig(Config):
    DEBUG = False


def get_config() -> type[Config]:
    return ProductionConfig if os.environ.get("FLASK_ENV") == "production" else Config

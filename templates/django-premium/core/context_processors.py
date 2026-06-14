"""Inject the product name into every template as `app_name`."""
from django.conf import settings


def app_name(_request):
    return {"app_name": getattr(settings, "APP_NAME", "App")}

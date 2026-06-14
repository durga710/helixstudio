"""Server-rendered views. Pages render full templates; the items views render a
PARTIAL that HTMX swaps in — copy that pattern for the user's real feature."""
from django.http import JsonResponse
from django.shortcuts import render

from . import store


def health(_request):
    return JsonResponse({"status": "ok"})


def landing(request):
    return render(request, "core/landing.html", {"page": "landing"})


def login(request):
    return render(request, "core/login.html", {"page": "login"})


def dashboard(request):
    return render(request, "core/dashboard.html", {"page": "dashboard", "items": store.all_items()})


def settings_page(request):
    return render(request, "core/settings.html", {"page": "settings"})


def items_list(request):
    return render(request, "core/partials/_items.html", {"items": store.all_items()})


def items_create(request):
    name = (request.POST.get("name") or "").strip()
    if name:
        store.add_item(name)
    return render(request, "core/partials/_items.html", {"items": store.all_items()})

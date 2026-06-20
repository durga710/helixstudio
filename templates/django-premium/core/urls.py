from django.urls import path

from . import views

urlpatterns = [
    # Open straight to the app — no forced login. The landing + login pages stay
    # as OPTIONAL routes (wire login as a gate only if the user asks).
    path("", views.dashboard, name="home"),
    path("landing/", views.landing, name="landing"),
    path("login/", views.login, name="login"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("settings/", views.settings_page, name="settings"),
    path("items/", views.items_list, name="items_list"),
    path("items/create/", views.items_create, name="items_create"),
    path("health/", views.health, name="health"),
]

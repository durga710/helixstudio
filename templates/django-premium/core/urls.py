from django.urls import path

from . import views

urlpatterns = [
    path("", views.landing, name="landing"),
    path("login/", views.login, name="login"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("settings/", views.settings_page, name="settings"),
    path("items/", views.items_list, name="items_list"),
    path("items/create/", views.items_create, name="items_create"),
    path("health/", views.health, name="health"),
]

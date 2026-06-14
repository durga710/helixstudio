# Premium Django skeleton — how to build on it

A **complete, working, server-rendered** Django app. Don't rebuild it — fill it in.

## Already done (do not recreate)
- **Project**: `manage.py`, `config/` (settings/urls/wsgi/asgi — settings are env-driven
  and secure, with `APP_NAME`, `django_htmx`, and a `core.context_processors.app_name`
  processor injecting `app_name` into every template).
- **App (`core/`)**: `views.py` (landing/login/dashboard/settings + `items_list` /
  `items_create` for HTMX), `urls.py`, `store.py` (in-memory demo data so the app renders
  **without migrate**), `models.py` (`Item` — the ORM example), `context_processors.py`.
- **Templates** (`core/templates/core/`): `base.html` (Tailwind + HTMX + Alpine),
  `shell.html` (sidebar + topbar), `landing/login/dashboard/settings.html`, and
  `partials/_items.html` + `_sidebar.html` + `_topbar.html`.
- **HTMX feature**: the dashboard list — `hx-post {% url 'items_create' %}` (with
  `{% csrf_token %}`) → renders `core/partials/_items.html` → HTMX swaps it in.
- **Static** (`core/static/core/`): `theme.css` (6 palettes, `[data-theme]`) + `app.js`
  (theme picker). Alpine powers the topbar dropdown.

## Your job (the "blanks")
1. Set the product name in `config/settings.py` (`APP_NAME`).
2. Replace the dashboard's main feature. For persistence, switch `store.py` → the `Item`
   model (`python manage.py makemigrations core && migrate`) and query `Item.objects`.
3. Relabel the placeholder stat cards for real metrics (or remove them).
4. Add a page by copying a view in `core/views.py` + a route in `core/urls.py` + a
   `core/templates/core/<name>.html` (extend `core/shell.html`) + a sidebar link.

## Rules
- **Reuse the tokens**: `bg-bg`, `bg-surface`, `bg-surface2`, `border-line`, `text-ink`,
  `text-muted`, `bg-brand text-brand-fg`, `bg-accent`. Never hard-code hex.
- For interactivity prefer **HTMX** + light **Alpine**. **Always** put `{% csrf_token %}`
  in POST forms.
- **Don't touch** `core/static/core/theme.css` (HELIX-LOCKED palette system) or the
  shell/nav. Keep the app running — run: `python manage.py runserver`.

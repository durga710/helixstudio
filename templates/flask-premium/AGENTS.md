# Premium Flask skeleton — how to build on it

A **complete, working, server-rendered** Flask app. Don't rebuild it — fill it in.

## Already done (do not recreate)
- **App/MVC**: `wsgi.py` (entry), `config.py` (env config + `APP_NAME`),
  `app/__init__.py` (app factory: registers the `pages` + `items` blueprints, injects
  `app_name` into every template), `app/models/item.py` (data layer),
  `app/pages/routes.py` (server-rendered pages), `app/items/routes.py` (HTMX).
- **Templates (Jinja)**: `app/templates/base.html` (Tailwind + HTMX + Alpine),
  `shell.html` (sidebar + topbar), `landing/login/dashboard/settings.html`, and
  `partials/_items.html` + `_sidebar.html` + `_topbar.html`.
- **HTMX feature**: the dashboard list — `hx-post /items/` → `items` route renders
  `partials/_items.html` → HTMX swaps it in. **This is the pattern to copy.**
- **Theming**: 6 palettes in `app/static/theme.css` (`[data-theme]`), live picker in the
  topbar (`app/static/app.js`). Alpine powers the topbar dropdown.

## Your job (the "blanks")
1. Set the product name in `config.py` (`APP_NAME`).
2. Replace the dashboard's main feature: add a `model` + a `route` + a Jinja partial,
   wired with HTMX like `items`.
3. Relabel the placeholder stat cards for real metrics (or remove them).
4. Add a page by copying a route in `app/pages/routes.py` + a `app/templates/<name>.html`
   (extend `shell.html`) + a link in `partials/_sidebar.html`.

## Rules
- **Reuse the tokens**: `bg-bg`, `bg-surface`, `bg-surface2`, `border-line`, `text-ink`,
  `text-muted`, `bg-brand text-brand-fg`, `bg-accent`. Never hard-code hex.
- For interactivity prefer **HTMX** (server-rendered partials) + light **Alpine**.
- **Don't touch** `app/static/theme.css` (HELIX-LOCKED palette system) or the layout/nav.
- Keep the app running — every page must render. Run: `flask --app wsgi run`.

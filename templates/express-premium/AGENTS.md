# Premium Express skeleton — how to build on it

A **complete, working, server-rendered** Express app. Don't rebuild it — fill it in.

## Already done (do not recreate)
- **Server/MVC**: `src/server.js` (boot), `src/app.js` (helmet/cors/EJS/static/routes/
  errors), `src/config.js` (env + `appName`), `src/routes/` (`pages.routes` +
  `items.routes`), `src/controllers/`, `src/models/items.model.js`, `src/middleware/error.js`.
- **Views (EJS)**: `views/partials/head` + `foot` + `sidebar` + `topbar`, plus
  `landing`, `login` (mock), `dashboard`, `settings`, and `partials/items-list`.
- **HTMX feature**: the dashboard list — `hx-post /items` → `items.controller` renders
  `views/partials/items-list.ejs` → HTMX swaps it in. **This is the pattern to copy.**
- **Theming**: 6 palettes in `public/theme.css` (`[data-theme]`), live picker in the
  topbar (`public/app.js`), no-flash script in `head.ejs`. Tailwind (CDN) maps the
  palette CSS vars to utilities. Alpine.js powers the topbar dropdown.

## Your job (the "blanks")
1. Set the product name in `src/config.js` (`appName`).
2. Replace the dashboard's main feature: add a `model` + `controller` + an EJS
   partial, wired with HTMX exactly like `items`.
3. Relabel the placeholder stat cards for real metrics (or remove them).
4. Add a page by copying a line in `src/routes/pages.routes.js` + a controller in
   `pages.controller.js` + a `views/<name>.ejs` + a link in `partials/sidebar.ejs`.
5. Rewrite the landing hero + feature cards for the product.

## Rules
- **Reuse the tokens**: `bg-bg`, `bg-surface`, `bg-surface2`, `border-line`,
  `text-ink`, `text-muted`, `bg-brand text-brand-fg`, `bg-accent`. Never hard-code hex.
- For interactivity prefer **HTMX** (server-rendered partials) + light **Alpine**;
  don't add a SPA framework.
- **Don't touch** `public/theme.css` (HELIX-LOCKED palette system) or the layout/nav.
- Keep `npm start` running at every step — every page must render.

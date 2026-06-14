# Premium app skeleton — how to build on it

This project is a **complete, working app shell**. Don't rebuild it — fill it in.

## Already done (do not recreate)
- **Auth**: login + signup pages with a mock `localStorage` session (`script.js`).
- **Layout**: sidebar + topbar + main content region (`index.html` `#view-app`).
- **Pages + nav**: Dashboard and Settings, switched by `route()` — add pages by
  copying the `[data-page]` section + its `.nav-item` button.
- **Theming**: 6 palettes in `style.css` (`[data-theme="…"]`), live theme `<select>`
  in the topbar. Colors are CSS-variable tokens, so never hard-code hex.

## Your job (the "blanks")
1. Set the app name everywhere `data-app-name` appears + the `<title>`.
2. Replace the region marked **"AI: BUILD THE APP'S MAIN FEATURE HERE"** in
   `index.html` with the user's actual app (list, board, table, form, chart…).
3. Relabel the placeholder stat cards for real metrics (or remove them).
4. Add logic in `script.js` for the user's feature (keep the mock auth + routing).

## Rules
- **Reuse the component kit + color tokens**: `bg-bg`, `bg-surface`, `bg-surface2`,
  `border-line`, `text-ink`, `text-muted`, `bg-brand text-brand-fg`, `bg-accent`,
  `.nav-item`. This keeps everything on-theme automatically.
- Tailwind is loaded via CDN — use Tailwind classes; **no build step, no ES module
  imports** (the preview inlines `style.css` + `script.js`).
- Keep it runnable at every step — the preview must always render.

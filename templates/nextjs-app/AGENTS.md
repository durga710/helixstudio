# Project notes

Next.js (App Router) + TypeScript + Tailwind CSS v4 + ESLint.

- Routes live under `app/` (folders → routes; `page.tsx`, `layout.tsx`, `loading.tsx`, `route.ts`).
- Use Server Components by default; add `"use client"` only when you need state/effects/browser APIs.
- Styling is Tailwind v4 (`app/globals.css` with `@import "tailwindcss"`); the `@/*` import alias maps to the project root.
- Keep `npm run build` and `npm run lint` green.

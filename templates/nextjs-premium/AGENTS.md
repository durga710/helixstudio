# Premium Next.js skeleton — how to build on it

This is a **complete, working Next.js App Router app**. Don't rebuild it — fill it in.

## Already done (do not recreate)
- **Stack/config**: `package.json`, `next.config.ts`, `tsconfig.json`,
  `eslint.config.mjs`, `postcss.config.mjs`. No extra dependencies — keep it that way
  so it always builds.
- **Landing**: `app/page.tsx` — a public marketing front (hero + features + CTAs).
- **Auth**: `app/login/page.tsx` (login/signup) + `lib/auth.ts` (mock `localStorage`
  session). Swap the four functions in `lib/auth.ts` for a real provider later; the
  pages stay.
- **App shell**: `app/(app)/layout.tsx` guards the session and renders
  `components/sidebar.tsx` + `components/topbar.tsx` around every app page.
- **Pages**: Dashboard (`app/(app)/dashboard`) and Settings (`app/(app)/settings`).
- **Component kit**: `components/ui.tsx` — `Card`, `Button`, `Input`, `Field`,
  `StatCard`, `cn`.
- **Theming**: 6 palettes in `app/globals.css` (`[data-theme="…"]`), live picker in
  `components/theme-picker.tsx`, no-flash script in `app/layout.tsx`. Colors are
  CSS-variable tokens exposed as Tailwind utilities.

## Your job (the "blanks")
1. Set the product name + tagline in `lib/config.ts` (used in nav, login, landing).
2. Replace the region marked **"AI: BUILD THE APP'S MAIN FEATURE HERE"** in
   `app/(app)/dashboard/page.tsx` with the user's real feature.
3. Relabel the placeholder `StatCard`s for real metrics (or remove them).
4. Add a page by copying `app/(app)/settings/page.tsx` to a new
   `app/(app)/<route>/page.tsx` and adding a `NAV` entry in `components/sidebar.tsx`.
5. Rewrite the landing hero + feature cards for the product.

## Rules
- **Reuse the kit + tokens**: `bg-bg`, `bg-surface`, `bg-surface2`, `border-line`,
  `text-ink`, `text-muted`, `bg-brand text-brand-fg`, `bg-accent`. Never hard-code hex.
- **No new dependencies** unless truly required — every dep is a build risk.
- **Don't touch** the palette system (HELIX-LOCKED: `app/globals.css` +
  `components/theme-picker.tsx`) or the auth/layout/nav scaffold.
- Client pages that use hooks/state start with `"use client"`.
- Keep it building at every step — `npm run dev` must always render.

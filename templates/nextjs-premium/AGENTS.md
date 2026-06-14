# Premium Next.js skeleton — how to build on it

A **complete, working Next.js App Router app with a real component library**. Don't
rebuild it — fill it in.

## Already done (do not recreate)
- **Stack/config**: `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`,
  `postcss.config.mjs`. Dependencies are pinned — don't change them by hand.
- **Component library** (`components/ui/*`): shadcn-style components on **Radix UI**,
  styled with the Helix theme tokens so they re-theme with the palette — `button`, `card`,
  `input`, `label`, `badge`, `separator`, `skeleton`, `avatar`, `dropdown-menu`, `dialog`,
  `tabs`, `tooltip`, `sonner` (toast), `form` (react-hook-form + zod), `table` + `data-table`
  (TanStack). Helper `lib/utils.ts` (`cn`). Icons: **lucide-react**. Animation:
  `components/fade-in.tsx` (**framer-motion**). Toasts: `import { toast } from "sonner"`.
- **Landing**: `app/page.tsx`. **Auth**: `app/login` + `lib/auth.ts` (mock localStorage
  session). **App shell**: `app/(app)/layout.tsx` (sidebar + topbar, session guard).
- **Pages**: Dashboard (a real TanStack `DataTable`) + Settings (a real RHF + zod form).
- **Theming**: 6 palettes in `app/globals.css` (`[data-theme]`), live picker
  `components/theme-picker.tsx`, no-flash script in `app/layout.tsx`.

## Your job (the "blanks")
1. Set the product name + tagline in `lib/config.ts`.
2. Replace the region marked **"AI: BUILD THE APP'S MAIN FEATURE HERE"** in
   `app/(app)/dashboard/page.tsx` — the `DataTable` (columns + data) is the pattern.
3. Relabel the placeholder stat cards for real metrics (or remove them).
4. Add a page by copying `app/(app)/settings/page.tsx` to `app/(app)/<route>/page.tsx`
   and adding a `NAV` entry in `components/sidebar.tsx`.
5. Build forms with `components/ui/form` (react-hook-form + zod); show feedback with `toast`.

## Rules
- **Reuse `components/ui/*` + tokens**: `bg-bg`, `bg-surface`, `bg-surface2`, `border-line`,
  `text-ink`, `text-muted`, `bg-brand text-brand-fg`, `bg-accent`, `bg-danger text-danger-fg`.
  Never hard-code hex.
- **Don't** re-init shadcn, add dependencies unless truly required, rebuild the auth/layout/
  nav, swap Tailwind out, or touch the palette system (HELIX-LOCKED: `app/globals.css` +
  `components/theme-picker.tsx`).
- Client components that use hooks/state start with `"use client"`.
- Keep it building at every step — `npm run dev` must always render.

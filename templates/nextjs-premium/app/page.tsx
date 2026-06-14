// Landing page — a polished public marketing front. AI: rewrite the hero copy +
// feature cards for the user's product; keep the layout + tokens.
import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { Button } from "@/components/ui";

const FEATURES = [
  { title: "Fast by default", body: "Built on the Next.js App Router with sensible, production-ready defaults." },
  { title: "Beautifully themed", body: "Six swappable color palettes, applied instantly across the whole app." },
  { title: "Ready to ship", body: "Auth flow, dashboard, and settings already wired — just add your idea." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-fg font-bold">
            {APP_NAME.charAt(0).toUpperCase()}
          </span>
          <span className="font-semibold">{APP_NAME}</span>
        </div>
        <Link href="/login">
          <Button variant="outline" className="h-9 px-4">
            Sign in
          </Button>
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-20 text-center sm:py-28">
          <span className="inline-block rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
            Built with Helix Studio
          </span>
          <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {APP_TAGLINE}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
            A premium, themeable starter — sign-in, dashboard, and settings included — so you can ship
            the idea, not the boilerplate.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/login">
              <Button className="h-11 px-6">Get started</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" className="h-11 px-6">
                View the app
              </Button>
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-surface p-6">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-6 py-6 text-sm text-muted">
          © {APP_NAME}. Built with Helix Studio.
        </div>
      </footer>
    </div>
  );
}

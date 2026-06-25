"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Moon, Palette, Plus, Search, Sun } from "lucide-react";
import { ACCENTS, useTheme } from "@/components/theme-provider";
import { useShell } from "./shell-context";
import { NAV_ITEMS } from "./rail";
import { cn } from "@/lib/utils";

// Breadcrumb titles, keyed by first path segment. The rail's NAV_ITEMS are the
// source of truth (add a nav item → its breadcrumb appears automatically);
// EXTRA_TITLES covers pages reachable outside the rail. Anything still unmapped
// is humanized from its path, so a new page can never wrongly show "Home".
const EXTRA_TITLES: Record<string, string> = {
  "/deployments": "Deployments",
  "/team": "Team",
  "/settings": "Settings",
};
const TITLES: Record<string, string> = {
  ...Object.fromEntries(NAV_ITEMS.map((i) => [i.href, i.title])),
  ...EXTRA_TITLES,
};

/** "/space/gradebook" → "Space"; "/foo-bar" → "Foo Bar"; "/" → "Home". */
function resolveTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const seg = pathname.split("/")[1] ?? "";
  if (!seg) return "Home";
  if (TITLES[`/${seg}`]) return TITLES[`/${seg}`];
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme, accent, setAccent } = useTheme();
  const { setPaletteOpen, accentPopOpen, setAccentPopOpen } = useShell();
  const popRef = useRef<HTMLDivElement>(null);

  const title = resolveTitle(pathname);

  useEffect(() => {
    if (!accentPopOpen) return;
    function onClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setAccentPopOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setAccentPopOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [accentPopOpen, setAccentPopOpen]);

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-[color-mix(in_srgb,var(--bg-2)_82%,transparent)] px-3.5 backdrop-blur-md">
      <div className="flex items-center gap-[7px] text-[12.5px] text-txt2">
        <b className="font-semibold text-txt">Helix</b>
        <span className="text-txt3">/</span>
        <span className="text-txt">{title}</span>
      </div>

      {/* Redundant with the "New" button on the right — hide on small screens
          where space is tight. */}
      <button
        onClick={() => router.push("/editor")}
        className="hidden cursor-pointer items-center gap-1.5 rounded-card-sm border border-border2 bg-panel px-[9px] py-1 text-xs text-txt transition-colors hover:border-accent sm:inline-flex"
      >
        <Plus className="h-[13px] w-[13px]" strokeWidth={1.7} />
        Start new project
      </button>

      {/* Icon-only on small screens; expands to the full search field at md+. */}
      <button
        onClick={() => setPaletteOpen(true)}
        aria-label="Search or ask Helix"
        className="ml-auto flex cursor-pointer items-center gap-2 rounded-lg border border-border2 bg-panel px-2.5 py-1.5 text-[12.5px] text-txt3 transition-colors hover:border-accent hover:text-txt2 md:w-[300px] md:max-w-[30vw]"
      >
        <Search className="h-[15px] w-[15px] shrink-0" strokeWidth={1.7} />
        <span className="hidden md:inline">Search or ask Helix…</span>
        <span className="ml-auto hidden gap-[3px] md:flex">
          {["⌘", "K"].map((k) => (
            <span key={k} className="rounded border border-border bg-panel2 px-[5px] font-mono text-[10.5px] text-txt2">
              {k}
            </span>
          ))}
        </span>
      </button>

      <button
        title="Accent color"
        aria-label="Accent color"
        onClick={(e) => {
          e.stopPropagation();
          setAccentPopOpen(!accentPopOpen);
        }}
        className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-transparent bg-transparent text-txt2 transition-colors hover:bg-panel2 hover:text-txt"
      >
        <Palette className="h-[15px] w-[15px]" strokeWidth={1.7} />
      </button>

      <button
        title="Toggle theme"
        aria-label="Toggle theme"
        onClick={toggleTheme}
        className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-transparent bg-transparent text-txt2 transition-colors hover:bg-panel2 hover:text-txt"
      >
        {theme === "dark" ? <Moon className="h-[15px] w-[15px]" strokeWidth={1.7} /> : <Sun className="h-[15px] w-[15px]" strokeWidth={1.7} />}
      </button>

      <button
        onClick={() => router.push("/editor")}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-[0_6px_20px_-6px_color-mix(in_srgb,var(--accent)_75%,transparent)] transition-[transform,box-shadow,filter] duration-150 hover:-translate-y-px hover:shadow-[0_10px_28px_-6px_color-mix(in_srgb,var(--accent)_90%,transparent)] hover:brightness-110 active:translate-y-0"
      >
        <Plus className="h-[15px] w-[15px]" strokeWidth={2} />
        New
      </button>

      {/* Accent popover */}
      {accentPopOpen && (
        <div
          ref={popRef}
          className="fade-up glass absolute right-24 top-[46px] z-40 rounded-xl p-3 shadow-pop"
        >
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-txt3">Accent</div>
          <div className="flex gap-2">
            {ACCENTS.map(([hex, name]) => (
              <button
                key={hex}
                title={name}
                aria-label={`Accent: ${name}`}
                onClick={() => setAccent(hex)}
                className={cn(
                  "h-6 w-6 cursor-pointer rounded-card-sm border-2 transition-transform hover:scale-110",
                  accent === hex ? "border-txt" : "border-transparent"
                )}
                style={{ background: hex }}
              />
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

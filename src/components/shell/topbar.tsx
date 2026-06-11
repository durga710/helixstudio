"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Moon, Palette, Plus, Search, Sun } from "lucide-react";
import { ACCENTS, useTheme } from "@/components/theme-provider";
import { useShell } from "./shell-context";
import { cn } from "@/lib/utils";

const TITLES: Record<string, string> = {
  "/": "Home",
  "/editor": "Editor",
  "/analysis": "Repository Analysis",
  "/agents": "Agents",
  "/skills": "Skills",
  "/deployments": "Deployments",
  "/team": "Team",
  "/settings": "Settings",
};

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.34c-2.2.48-2.67-1.06-2.67-1.06-.36-.92-.88-1.16-.88-1.16-.72-.49.05-.48.05-.48.8.06 1.22.82 1.22.82.71 1.21 1.86.86 2.31.66.07-.52.28-.86.5-1.06-1.75-.2-3.6-.88-3.6-3.9 0-.86.31-1.56.82-2.11-.08-.2-.36-1 .08-2.09 0 0 .67-.21 2.2.8a7.6 7.6 0 0 1 4 0c1.53-1.01 2.2-.8 2.2-.8.44 1.09.16 1.89.08 2.09.51.55.82 1.25.82 2.11 0 3.03-1.85 3.7-3.61 3.89.29.24.54.72.54 1.45v2.15c0 .21.15.45.55.38A8 8 0 0 0 8 0z" />
    </svg>
  );
}

export function Topbar({ activeProjectName }: { activeProjectName: string }) {
  const pathname = usePathname();
  const { theme, toggleTheme, accent, setAccent } = useTheme();
  const { setPaletteOpen, setNewProjectOpen, accentPopOpen, setAccentPopOpen } = useShell();
  const popRef = useRef<HTMLDivElement>(null);

  const title = TITLES[pathname] ?? TITLES[`/${pathname.split("/")[1]}`] ?? "Home";

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
    <header className="relative flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg2 px-3.5">
      <div className="flex items-center gap-[7px] text-[12.5px] text-txt2">
        <b className="font-semibold text-txt">Helix</b>
        <span className="text-txt3">/</span>
        <span>{title}</span>
      </div>

      <button
        onClick={() => setNewProjectOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-card-sm border border-border2 bg-panel px-[9px] py-1 text-xs text-txt transition-colors hover:border-accent"
      >
        <GitHubMark className="h-[13px] w-[13px]" />
        {activeProjectName}
        <ChevronDown className="h-[13px] w-[13px]" strokeWidth={1.7} />
      </button>

      <span className="inline-flex items-center gap-[5px] rounded-full border border-border2 px-2 py-[3px] text-[11.5px] text-txt2">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" />
        main
      </span>

      <button
        onClick={() => setPaletteOpen(true)}
        className="ml-auto flex w-[300px] max-w-[30vw] cursor-pointer items-center gap-2 rounded-lg border border-border2 bg-panel px-2.5 py-1.5 text-[12.5px] text-txt3 transition-colors hover:border-accent hover:text-txt2"
      >
        <Search className="h-[15px] w-[15px]" strokeWidth={1.7} />
        Search or ask Helix…
        <span className="ml-auto flex gap-[3px]">
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
        onClick={() => setNewProjectOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition hover:brightness-110"
      >
        <Plus className="h-[15px] w-[15px]" strokeWidth={2} />
        New
      </button>

      {/* Accent popover */}
      {accentPopOpen && (
        <div
          ref={popRef}
          className="fade-up absolute right-24 top-[46px] z-40 rounded-xl border border-border2 bg-panel p-3 shadow-pop"
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

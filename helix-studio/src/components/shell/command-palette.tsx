"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  ChartLine,
  Code2,
  Home,
  Moon,
  Palette,
  Play,
  Plus,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useShell } from "./shell-context";
import { cn } from "@/lib/utils";

interface PaletteItem {
  id: string;
  group: "Navigate" | "Customize" | "Actions";
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  shortcut?: string;
  run: () => void;
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setNewProjectOpen, setAccentPopOpen } = useShell();
  const { toggleTheme } = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<PaletteItem[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      { id: "home", group: "Navigate", label: "Go to Home", icon: Home, shortcut: "G H", run: go("/") },
      { id: "editor", group: "Navigate", label: "Open Editor", icon: Code2, shortcut: "G E", run: go("/editor") },
      { id: "analysis", group: "Navigate", label: "Repository Analysis", icon: ChartLine, run: go("/analysis") },
      { id: "agents", group: "Navigate", label: "Agents", icon: Bot, run: go("/agents") },
      { id: "skills", group: "Navigate", label: "Skills", icon: ShieldCheck, run: go("/skills") },
      { id: "deployments", group: "Navigate", label: "Deployments", icon: Rocket, run: go("/deployments") },
      { id: "team", group: "Navigate", label: "Team", icon: Users, run: go("/team") },
      { id: "theme", group: "Customize", label: "Toggle dark / light theme", icon: Moon, shortcut: "⌘ ⇧ L", run: toggleTheme },
      { id: "accent", group: "Customize", label: "Change accent color", icon: Palette, run: () => setAccentPopOpen(true) },
      { id: "settings", group: "Customize", label: "Open Settings", icon: Settings, run: go("/settings") },
      { id: "new", group: "Actions", label: "New project / import repo", icon: Plus, run: () => setNewProjectOpen(true) },
      { id: "run", group: "Actions", label: "Run full agent workflow", icon: Play, run: go("/agents?run=1") },
    ];
  }, [router, toggleTheme, setNewProjectOpen, setAccentPopOpen]);

  const filtered = useMemo(
    () => items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase())),
    [items, query]
  );

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [paletteOpen]);

  useEffect(() => setSelected(0), [query]);

  if (!paletteOpen) return null;

  function runItem(item: PaletteItem) {
    setPaletteOpen(false);
    item.run();
  }

  const groups: Array<PaletteItem["group"]> = ["Navigate", "Customize", "Actions"];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setPaletteOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className="fade-up mx-auto mt-[16vh] w-[min(580px,92vw)] overflow-hidden rounded-card-lg border border-border2 bg-panel shadow-pop"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
          <Search className="h-[15px] w-[15px] text-txt3" strokeWidth={1.7} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPaletteOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, filtered.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              }
              if (e.key === "Enter" && filtered[selected]) runItem(filtered[selected]);
            }}
            placeholder="Search files, run a command, or ask Helix…"
            autoComplete="off"
            className="w-full border-none bg-transparent font-sans text-[13.5px] text-txt outline-none placeholder:text-txt3"
          />
          <span className="rounded border border-border bg-panel2 px-[5px] font-mono text-[10.5px] text-txt2">esc</span>
        </div>
        <div className="scroll-area max-h-[46vh] overflow-auto p-1.5">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-txt3">No matching commands.</div>
          )}
          {groups.map((group) => {
            const groupItems = filtered.filter((i) => i.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group}>
                <div className="px-3 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-txt3">
                  {group}
                </div>
                {groupItems.map((item) => {
                  const idx = filtered.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      onClick={() => runItem(item)}
                      onMouseEnter={() => setSelected(idx)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none px-3 py-2 text-left text-[12.5px] transition-colors",
                        idx === selected ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-txt" : "bg-transparent text-txt2"
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
                      {item.label}
                      {item.shortcut && (
                        <span className="ml-auto font-mono text-[10.5px] text-txt3">{item.shortcut}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

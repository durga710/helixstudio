"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Code2,
  Home,
  Moon,
  Palette,
  Plus,
  Search,
  Settings,
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
  const { paletteOpen, setPaletteOpen } = useShell();
  // Mounted only while open, so query/selection state starts fresh each time.
  if (!paletteOpen) return null;
  return <PaletteDialog onClose={() => setPaletteOpen(false)} />;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const { setNewProjectOpen, setAccentPopOpen } = useShell();
  const { toggleTheme } = useTheme();
  const router = useRouter();
  const [query, setQueryState] = useState("");
  const [selected, setSelected] = useState(0);

  const items = useMemo<PaletteItem[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      { id: "home", group: "Navigate", label: "Go to Home", icon: Home, shortcut: "G H", run: go("/") },
      { id: "editor", group: "Navigate", label: "Open Editor", icon: Code2, shortcut: "G E", run: go("/editor") },
      { id: "theme", group: "Customize", label: "Toggle dark / light theme", icon: Moon, shortcut: "⌘ ⇧ L", run: toggleTheme },
      { id: "accent", group: "Customize", label: "Change accent color", icon: Palette, run: () => setAccentPopOpen(true) },
      { id: "settings", group: "Customize", label: "Open Settings", icon: Settings, run: go("/settings") },
      { id: "new", group: "Actions", label: "New project / import repo", icon: Plus, run: () => setNewProjectOpen(true) },
    ];
  }, [router, toggleTheme, setNewProjectOpen, setAccentPopOpen]);

  const filtered = useMemo(
    () => items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase())),
    [items, query]
  );

  // Selection resets alongside query edits and is clamped to the result count.
  const activeIndex = Math.min(selected, Math.max(filtered.length - 1, 0));

  function setQuery(q: string) {
    setQueryState(q);
    setSelected(0);
  }

  function runItem(item: PaletteItem) {
    onClose();
    item.run();
  }

  const groups: Array<PaletteItem["group"]> = ["Navigate", "Customize", "Actions"];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
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
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected(Math.min(activeIndex + 1, filtered.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected(Math.max(activeIndex - 1, 0));
              }
              if (e.key === "Enter" && filtered[activeIndex]) runItem(filtered[activeIndex]);
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
                        idx === activeIndex
                          ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-txt"
                          : "bg-transparent text-txt2"
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

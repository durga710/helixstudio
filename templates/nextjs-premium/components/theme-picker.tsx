"use client";

// HELIX-LOCKED: the palette switcher. Sets [data-theme] on <html> and persists it.
// Add a theme by adding a palette block in globals.css and a row here.
import { useEffect, useState } from "react";

const THEMES = ["midnight", "ocean", "forest", "sunset", "grape", "paper"] as const;
type Theme = (typeof THEMES)[number];

export default function ThemePicker() {
  const [theme, setTheme] = useState<Theme>("midnight");

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) || "midnight";
    setTheme(current);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <select
      aria-label="Theme"
      value={theme}
      onChange={(e) => apply(e.target.value as Theme)}
      className="h-9 rounded-lg border border-line bg-surface px-2 text-sm capitalize text-ink outline-none focus:border-brand"
    >
      {THEMES.map((t) => (
        <option key={t} value={t} className="capitalize">
          {t}
        </option>
      ))}
    </select>
  );
}

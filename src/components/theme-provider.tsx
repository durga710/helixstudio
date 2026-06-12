"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const ACCENTS: ReadonlyArray<readonly [hex: string, name: string]> = [
  ["#3b82f6", "Electric Blue"],
  ["#0fd6c0", "Circuit Cyan"],
  ["#c084fc", "Violet"],
  ["#6366f1", "Indigo"],
  ["#10b981", "Emerald"],
  ["#f43f5e", "Rose"],
];

export type Theme = "dark" | "light";
export type Density = "comfortable" | "compact";

interface ThemeContextValue {
  theme: Theme;
  accent: string;
  density: Density;
  fontSize: number;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setAccent: (hex: string) => void;
  setDensity: (d: Density) => void;
  setFontSize: (px: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const LS = (k: string) => `helix_${k}`;

function load(key: string, fallback: string): string {
  try {
    return localStorage.getItem(LS(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(LS(key), value);
  } catch {
    // storage unavailable (private mode) — preferences just won't persist
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [accent, setAccentState] = useState("#3b82f6");
  const [density, setDensityState] = useState<Density>("comfortable");
  const [fontSize, setFontSizeState] = useState(13);

  // Hydrate from localStorage (the inline script in layout.tsx already applied
  // these to the DOM before paint; this syncs React state with it).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-hydration sync with localStorage; SSR can't read it
    setThemeState(load("theme", "dark") === "light" ? "light" : "dark");
    setAccentState(load("accent", "#3b82f6"));
    setDensityState(load("density", "comfortable") === "compact" ? "compact" : "comfortable");
    const ft = parseInt(load("ft", "13"), 10);
    if (!Number.isNaN(ft)) setFontSizeState(ft);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    document.documentElement.dataset.theme = t;
    save("theme", t);
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  }, [setTheme]);

  const setAccent = useCallback((hex: string) => {
    document.documentElement.style.setProperty("--accent", hex);
    document.documentElement.style.setProperty("--accent-ink", "#fff");
    save("accent", hex);
    setAccentState(hex);
  }, []);

  const setDensity = useCallback((d: Density) => {
    document.documentElement.dataset.density = d;
    save("density", d);
    setDensityState(d);
  }, []);

  const setFontSize = useCallback((px: number) => {
    document.documentElement.style.setProperty("--ft", `${px}px`);
    save("ft", String(px));
    setFontSizeState(px);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, accent, density, fontSize, setTheme, toggleTheme, setAccent, setDensity, setFontSize }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// The before-paint init script lives in src/lib/theme-init.ts (server-safe;
// this module is "use client" so exports from here reach the server layout as
// client-reference proxies, not values). Keep its storage keys in sync.

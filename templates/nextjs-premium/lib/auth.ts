// Client-side mock auth — a localStorage "session" so the app skeleton runs with
// no backend. Swap these four functions for real auth (NextAuth, Clerk, your API)
// when you're ready; the pages/components only depend on this small surface.
"use client";

export interface User {
  name: string;
  email: string;
}

const KEY = "helix_session";

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function signIn(user: User): void {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function signOut(): void {
  localStorage.removeItem(KEY);
}

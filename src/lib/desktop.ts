/* Desktop bridge detection. The Electron shell (desktop/) exposes
 * window.helixDesktop via contextBridge; the web app feature-detects it and
 * unlocks native powers (real local shell, folder picker). */

export interface DesktopPlatform {
  platform: string;
  arch: string;
  version: string;
  cwd: string;
}

export interface DesktopCommandResult {
  ok: boolean;
  output: string;
  code: number;
  cwd?: string;
}

export interface HelixDesktopBridge {
  platform: () => Promise<DesktopPlatform>;
  chooseFolder: () => Promise<{ cwd: string; changed: boolean }>;
  runCommand: (command: string) => Promise<DesktopCommandResult>;
}

declare global {
  interface Window {
    helixDesktop?: HelixDesktopBridge;
  }
}

export function desktopBridge(): HelixDesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.helixDesktop ?? null;
}

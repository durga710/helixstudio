# Helix Studio Desktop

The desktop app (`desktop/`) is an Electron shell around helixstudio.org that
unlocks what a browser tab can't have: a **real local shell** in a folder you
choose, with more native powers coming (local folder editing, git, file watch).

## Architecture

- **The engine runs locally (v0.2).** The packaged app bundles the Next.js
  standalone server (`extraResources` → `app-server/`); on launch `main.js`
  boots it on `127.0.0.1` (Electron's binary doubles as Node via
  `ELECTRON_RUN_AS_NODE`) and points the window at it. Instant startup,
  offline-capable, data stays on the machine; the cloud is reached only for
  the Claude API (your key) and GitHub imports. Dev fallback order:
  `HELIX_DESKTOP_URL` → bundled server → helixstudio.org.
- `desktop/main.js` — hardened BrowserWindow. Navigation is locked to the app
  origin; external links open in the OS browser.
- `desktop/preload.js` — the only bridge between web and native, via
  `contextBridge`: `platform()`, `chooseFolder()`, `runCommand()`. Context
  isolation on, node integration off, command origin re-checked in the main
  process, output capped at 200 KB, 30 s timeout.
- The web app feature-detects `window.helixDesktop` (`src/lib/desktop.ts`).
  When present, the editor's Terminal tab becomes **Local shell**: commands run
  on the user's machine in their chosen folder, with a native folder picker in
  the toolbar. In a browser the same tab stays the allowlisted sandbox.

## Run locally

```bash
cd desktop
npm install
npm start                                  # loads helixstudio.org
HELIX_DESKTOP_URL=http://localhost:3000 npm start   # against a local dev server
```

## Ship installers

GitHub Actions (`.github/workflows/desktop.yml`) builds on a macOS / Windows /
Linux matrix with electron-builder:

- **Tag a release:** `git tag desktop-v0.1.0 && git push origin desktop-v0.1.0`
  → builds `.dmg`, `.exe` (NSIS), and `.AppImage`, then creates a **draft
  GitHub Release** with all three attached. Review and publish it.
- Or run the workflow manually (workflow_dispatch) to get the installers as
  build artifacts without a release.

Unsigned builds: macOS users right-click → Open on first launch; Windows
SmartScreen needs "Run anyway". Code signing (Apple Developer ID + Windows
cert) plugs into electron-builder config when you have certificates.

## Roadmap

- Open a local folder in the Editor (read/write through the bridge)
- Apply AI diffs to local files with accept/reject
- Local git operations + auto-updates (electron-updater)

// Helix Studio desktop shell.
//
// Loads the hosted app (helixstudio.org) inside a hardened BrowserWindow and
// exposes a narrow native bridge (see preload.js): a real local shell and a
// folder picker — the powers a browser tab can't have. Navigation is locked
// to the app origin so no other site can ever reach the bridge.

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const APP_URL = process.env.HELIX_DESKTOP_URL || "https://helixstudio.org";
const APP_ORIGIN = new URL(APP_URL).origin;

const COMMAND_TIMEOUT_MS = 30_000;
const OUTPUT_CAP_BYTES = 200 * 1024;

/** Working directory for the local shell — set via the folder picker. */
let workspaceDir = os.homedir();

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0b0d11",
    title: "Helix Studio",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Lock navigation to the app origin; external links open in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).origin !== APP_ORIGIN) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== APP_ORIGIN) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(APP_URL);
  return win;
}

ipcMain.handle("helix:platform", () => ({
  platform: process.platform,
  arch: process.arch,
  version: app.getVersion(),
  cwd: workspaceDir,
}));

ipcMain.handle("helix:choose-folder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    title: "Open a folder in Helix Studio",
  });
  if (result.canceled || result.filePaths.length === 0) return { cwd: workspaceDir, changed: false };
  workspaceDir = result.filePaths[0];
  return { cwd: workspaceDir, changed: true };
});

// Real local shell. This runs on the user's own machine at their request —
// the same trust model as any terminal. Output is capped and time-boxed.
ipcMain.handle("helix:run-command", async (event, command) => {
  if (typeof command !== "string" || command.length === 0 || command.length > 2000) {
    return { ok: false, output: "invalid command", code: -1 };
  }
  const senderOrigin = new URL(event.sender.getURL()).origin;
  if (senderOrigin !== APP_ORIGIN) {
    return { ok: false, output: "blocked: untrusted origin", code: -1 };
  }

  const shellBin = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  const shellArgs = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-c", command];

  return new Promise((resolve) => {
    const child = spawn(shellBin, shellArgs, {
      cwd: workspaceDir,
      env: process.env,
      windowsHide: true,
    });
    let output = "";
    let truncated = false;
    const append = (chunk) => {
      if (output.length < OUTPUT_CAP_BYTES) {
        output += chunk.toString("utf8");
        if (output.length >= OUTPUT_CAP_BYTES) truncated = true;
      }
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      output += "\n[killed: 30s timeout]";
    }, COMMAND_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        output: output.slice(0, OUTPUT_CAP_BYTES) + (truncated ? "\n[output truncated]" : ""),
        code: code ?? -1,
        cwd: workspaceDir,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, output: String(err.message ?? err), code: -1, cwd: workspaceDir });
    });
  });
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Helix Studio desktop shell — v0.2: the full engine runs locally.
//
// The packaged app bundles the Next.js standalone server (extraResources →
// app-server/). On launch we boot it on 127.0.0.1 and point the window at it:
// instant startup, works offline, your data stays on your machine. The cloud
// is only reached for what is genuinely remote (Claude API via your key,
// GitHub repo imports). If no bundled server is present (dev), the shell
// falls back to HELIX_DESKTOP_URL or helixstudio.org.

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const COMMAND_TIMEOUT_MS = 30_000;
const OUTPUT_CAP_BYTES = 200 * 1024;

/** Working directory for the local shell — set via the folder picker. */
let workspaceDir = os.homedir();
let appOrigin = null;
let serverProcess = null;

function bundledServerPath() {
  const candidate = path.join(process.resourcesPath ?? "", "app-server", "server.js");
  return fs.existsSync(candidate) ? candidate : null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForServer(url, timeoutMs = 20_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    (function probe() {
      const req = http.get(`${url}/api/health`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) reject(new Error("local server did not start"));
        else setTimeout(probe, 250);
      });
    })();
  });
}

async function startLocalServer() {
  const serverJs = bundledServerPath();
  if (!serverJs) return null;

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  // Electron's binary doubles as Node when ELECTRON_RUN_AS_NODE is set.
  serverProcess = spawn(process.execPath, [serverJs], {
    cwd: path.dirname(serverJs),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      AUTH_URL: origin,
      AUTH_TRUST_HOST: "true",
      NEXT_PUBLIC_APP_URL: origin,
    },
    stdio: "ignore",
  });
  serverProcess.on("exit", () => {
    serverProcess = null;
  });

  await waitForServer(origin);
  return origin;
}

function createWindow(url) {
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
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (new URL(target).origin !== appOrigin) shell.openExternal(target);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== appOrigin) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });

  win.loadURL(url);
  return win;
}

ipcMain.handle("helix:platform", () => ({
  platform: process.platform,
  arch: process.arch,
  version: app.getVersion(),
  cwd: workspaceDir,
  localEngine: serverProcess !== null,
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
  if (senderOrigin !== appOrigin) {
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

app.whenReady().then(async () => {
  let url;
  try {
    url = process.env.HELIX_DESKTOP_URL || (await startLocalServer()) || "https://helixstudio.org";
  } catch {
    url = "https://helixstudio.org";
  }
  appOrigin = new URL(url).origin;

  createWindow(url);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  if (serverProcess) serverProcess.kill();
});

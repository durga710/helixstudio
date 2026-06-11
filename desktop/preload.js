// Narrow, typed bridge between the hosted app and the desktop shell.
// The web app feature-detects `window.helixDesktop` and upgrades the
// sandboxed terminal to a real local shell when present.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("helixDesktop", {
  /** Static info + current shell working directory. */
  platform: () => ipcRenderer.invoke("helix:platform"),
  /** Native folder picker; sets the shell working directory. */
  chooseFolder: () => ipcRenderer.invoke("helix:choose-folder"),
  /** Run a command in the user's real shell (time-boxed, output-capped). */
  runCommand: (command) => ipcRenderer.invoke("helix:run-command", command),
});

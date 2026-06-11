// electron-builder afterPack hook: ad-hoc sign macOS builds.
//
// Apple Silicon refuses to launch binaries with no signature at all. CI has
// no Apple Developer certificate yet, so we ad-hoc sign ("-") after packing —
// users then get the standard right-click -> Open flow instead of a dead app.
// Replace with real Developer ID signing + notarization when certs exist.

const { execSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: "inherit" });
  execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: "inherit" });
};

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Electron shell — plain CommonJS, built separately (see docs/DESKTOP.md).
    "desktop/**",
    // Dev tooling — CommonJS scripts run with plain node.
    "scripts/**",
    // Generated Prisma client (built by postinstall).
    "src/generated/**",
    // Scaffold starters — templates for OTHER projects, each with its own
    // framework/conventions; Helix's lint rules don't apply to them.
    "templates/**",
    // Vendored ffmpeg.wasm bundle (self-hosted for the reel MP4 export) —
    // third-party minified code, not ours to lint.
    "public/ffmpeg/**",
  ]),
]);

export default eslintConfig;

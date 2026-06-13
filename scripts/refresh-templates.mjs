/**
 * Regenerates CLI-based starter templates from their framework's OWN official
 * CLI, re-applies our overlay, and BUILD-GATES the result — a template is only
 * updated on disk if it actually builds. Overlay-only templates (no CLI) are
 * left untouched. Run by .github/workflows/refresh-templates.yml.
 *
 * Why CLI + build-gate (not scraping/AI): the official CLI is the canonical,
 * framework-blessed starting point, and the build gate is ground truth — we
 * never ship a starter that doesn't compile.
 *
 * Per template (templates/<id>/template.json with a real `cli`):
 *   1. run the CLI into a temp dir
 *   2. copy templates/<id>/overlay/** over the generated base (if present)
 *   3. npm install && npm run build  (the gate)
 *   4. on green: sync the text files back into templates/<id>/ (keep
 *      template.json + overlay/), excluding node_modules/lockfiles/build output
 *   5. on red: leave templates/<id>/ unchanged, record a failure
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "templates");
const SKIP = new Set(["node_modules", ".git", "dist", ".next", "build", "out", "__pycache__", ".venv", "venv"]);
const SKIP_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, CI: "1" } });
}

function copyDir(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name) || SKIP_FILES.has(e.name)) continue;
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      copyDir(src, dst);
    } else if (e.isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
}

/** Replace templates/<id>/ content with `from`, preserving template.json + overlay/. */
function syncBack(from, templateDir) {
  for (const e of fs.readdirSync(templateDir, { withFileTypes: true })) {
    if (e.name === "template.json" || e.name === "overlay") continue;
    fs.rmSync(path.join(templateDir, e.name), { recursive: true, force: true });
  }
  copyDir(from, templateDir);
}

const failures = [];
const ids = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

for (const id of ids) {
  const dir = path.join(ROOT, id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "template.json"), "utf8"));
  const cli = manifest.cli;
  if (!cli || cli === "overlay-only") {
    console.log(`[refresh] ${id}: overlay-only, skipping CLI regen`);
    continue;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `tpl-${id}-`));
  try {
    console.log(`[refresh] ${id}: ${cli}`);
    run(cli, tmp);

    const overlay = path.join(dir, "overlay");
    if (fs.existsSync(overlay)) copyDir(overlay, tmp);

    // Build-gate (node templates). Non-node frameworks would branch here.
    run("npm install --no-audit --no-fund", tmp);
    run("npm run build", tmp);

    syncBack(tmp, dir);
    console.log(`[refresh] ${id}: build green — synced`);
  } catch (e) {
    console.error(`[refresh] ${id}: build FAILED — leaving template unchanged`);
    failures.push(id);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (failures.length) console.log(`[refresh] failed (unchanged): ${failures.join(", ")}`);
console.log("[refresh] done");

import "server-only";

/**
 * Live admin preview: spin a stored template up in a Vercel Sandbox, serve it on
 * an exposed port, and hand back a public URL so the admin can click-and-test a
 * (newly added or freshness-flagged) template before trusting it. The sandbox
 * self-expires after its timeout, so no explicit teardown is needed.
 *
 * Needs the live Vercel env (OIDC). The JS/static runners are straightforward;
 * the Python ones depend on python being present in the node sandbox (unverified).
 */

import { Sandbox } from "@vercel/sandbox";
import { HOME } from "./refresh";
import { getTemplate } from "./store";

const PORT = 3000;
const TIMEOUT_MS = 10 * 60 * 1000;

/** Per-template: blocking setup, then a serve command that binds 0.0.0.0:PORT. */
const SERVE: Record<string, { setup?: string; serve: string; note?: string }> = {
  "nextjs-premium": { setup: "npm install --no-audit --no-fund && npm run build", serve: `PORT=${PORT} HOSTNAME=0.0.0.0 npm start` },
  "express-premium": { setup: "npm install --no-audit --no-fund", serve: `PORT=${PORT} node src/server.js` },
  "static-premium": { serve: `npx --yes serve -l tcp://0.0.0.0:${PORT} .` },
  "game-2d-premium": { serve: `npx --yes serve -l tcp://0.0.0.0:${PORT} .` },
  "game-3d-premium": { serve: `npx --yes serve -l tcp://0.0.0.0:${PORT} .` },
  "flask-premium": { setup: "pip install -q -r requirements.txt", serve: `python -m flask --app wsgi run -h 0.0.0.0 -p ${PORT}`, note: "Python in the node sandbox is unverified." },
  "django-premium": { setup: "pip install -q -r requirements.txt", serve: `DJANGO_ALLOWED_HOSTS=* python manage.py runserver 0.0.0.0:${PORT}`, note: "Python in the node sandbox is unverified." },
};

export function previewableTemplates(): string[] {
  return Object.keys(SERVE);
}

export async function previewTemplate(templateId: string): Promise<{ url: string; note?: string } | { error: string }> {
  const tpl = await getTemplate(templateId);
  if (!tpl) return { error: "Unknown template." };
  const cfg = SERVE[templateId];
  if (!cfg) return { error: "No preview runner for this template." };

  const sbx = await Sandbox.create({ runtime: "node24", timeout: TIMEOUT_MS, ports: [PORT], resources: { vcpus: 4 } });
  try {
    const dir = `${HOME}/${templateId}`;
    await sbx.runCommand({ cmd: "sh", args: ["-c", `rm -rf ${dir} && mkdir -p ${dir}`] });
    await sbx.writeFiles(tpl.files.map((f) => ({ path: `${dir}/${f.path}`, content: Buffer.from(f.content, "utf8") })));

    if (cfg.setup) {
      const res = await sbx.runCommand({ cmd: "sh", args: ["-c", `cd ${dir} && ${cfg.setup}`], timeoutMs: 5 * 60 * 1000 });
      if (res.exitCode !== 0) {
        const err = await res.stderr().catch(() => "");
        await sbx.stop().catch(() => {});
        return { error: `Setup failed: ${(err || "").split("\n").slice(-3).join(" ")}`.slice(0, 300) };
      }
    }

    // Start the server detached; it keeps running in the sandbox after we return.
    await sbx.runCommand({ cmd: "sh", args: ["-c", `cd ${dir} && ${cfg.serve}`], detached: true });
    return { url: sbx.domain(PORT), note: cfg.note };
  } catch (e) {
    await sbx.stop().catch(() => {});
    return { error: e instanceof Error ? e.message : "Preview failed." };
  }
}

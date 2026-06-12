/** Reproduce the live-preview hang: create a Vite workspace, start the run,
 * poll status, dump logs. Usage: node scripts/repro-vite-run.mjs [baseUrl] */
const BASE = process.argv[2] ?? "http://localhost:3000";
let cookies = {};
const ch = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
const store = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";");
    const i = p.indexOf("=");
    cookies[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
};
async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { cookie: ch(), ...(opts.headers ?? {}) }, redirect: "manual" });
  store(res);
  return res;
}
async function api(path, opts = {}) {
  const res = await req(path, opts);
  return { status: res.status, json: await res.json().catch(() => null) };
}

// login
const { json: csrfJson } = await api("/api/auth/csrf");
await req("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken: csrfJson.csrfToken, email: "demo@helixstudio.org", password: "helix-demo" }),
});

// workspace with a minimal Vite React app (mirrors the user's package.json)
const create = await api("/api/workspaces", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "SCRATCH", name: "vite-repro" }),
});
const wsId = create.json?.data?.id;
console.log("workspace:", wsId);

const FILES = [
  {
    path: "package.json",
    content: JSON.stringify(
      {
        name: "finance-dashboard",
        version: "1.0.0",
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
        devDependencies: { "@vitejs/plugin-react": "^4.3.1", vite: "^5.4.2" },
      },
      null,
      2,
    ),
  },
  {
    path: "vite.config.js",
    content: "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n",
  },
  {
    path: "index.html",
    content: "<!doctype html><html><head><title>repro</title></head><body><div id='root'></div><script type='module' src='/src/main.jsx'></script></body></html>",
  },
  {
    path: "src/main.jsx",
    content: "import React from 'react';\nimport { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root')).render(<h1>hello</h1>);\n",
  },
];
const save = await api(`/api/workspaces/${wsId}/files`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ files: FILES }),
});
console.log("files saved:", save.json?.ok);

// start the run
const start = await api(`/api/workspaces/${wsId}/run`, { method: "POST" });
console.log("start:", start.status, JSON.stringify({ ...start.json?.data, logs: undefined } ?? start.json));

// poll up to 4 minutes
for (let i = 0; i < 48; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await api(`/api/workspaces/${wsId}/run`);
  const d = s.json?.data ?? {};
  console.log(`[${(i + 1) * 5}s] status=${d.status} port=${d.port} reachable=${d.reachable} url=${d.url}`);
  if (i % 4 === 3 || d.status === "error" || (d.status === "running" && d.reachable)) {
    console.log("--- logs ---\n" + (d.logs ?? []).slice(-25).join("\n") + "\n------------");
  }
  if (d.status === "error" || (d.status === "running" && d.reachable)) break;
}

// cleanup
await api(`/api/workspaces/${wsId}/run`, { method: "DELETE" });
await api(`/api/workspaces/${wsId}`, { method: "DELETE" });
console.log("cleaned up");

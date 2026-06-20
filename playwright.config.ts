import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Helix Studio's public-surface smoke suite.
 *
 * The suite is deliberately DB-free: it exercises the marketing/auth pages,
 * which render in demo mode (no DATABASE_URL required), so CI needs no Postgres.
 * The webServer builds artifacts separately (CI runs `npm run build` first);
 * here we only `next start`. Locally, an already-running dev server is reused.
 */
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

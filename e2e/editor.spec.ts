import { test, expect } from "@playwright/test";

/**
 * Authenticated-surface smoke: sign in with the public demo account (works in
 * every mode — see DEMO_USER in src/lib/auth.ts) and confirm we land on the
 * authenticated editor home rather than bouncing back to /welcome or /login.
 *
 * This covers the (app) shell + auth round-trip. Exercising the workspace-panel
 * editor itself needs a seeded workspace (a DB-backed CI job); see the note in
 * playwright.config.ts.
 */
const DEMO = { email: "demo@helixstudio.org", password: "helix-demo" };

test("editor: demo sign-in reaches the authenticated home", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Credentials sign-in redirects to "/" (the editor home), not back to auth.
  await page.waitForURL((url) => new URL(url).pathname === "/", { timeout: 15_000 });

  // The hero greets the demo user ("Durga") by first name in every mode.
  await expect(page.getByRole("heading", { name: /Durga/ })).toBeVisible();
});

import { test, expect, type Page } from "@playwright/test";

/**
 * Public-surface smoke suite. No DB required — these pages render in demo mode.
 * Goal: catch the "whole app is broken" class of regression (build output that
 * 500s, a route that no longer renders, a crashing client component) before it
 * reaches main. Assertions lean on durable copy/headings, not styling.
 */

/** Fail a test if the page throws an uncaught error while we're on it. */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("landing: unauthenticated `/` lands on the marketing page", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/");
  // (app)/layout redirects unauthenticated visitors to /welcome.
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Build software/i);
  await expect(page.getByText("Helix Studio").first()).toBeVisible();
  expect(errors, `uncaught page errors: ${errors.join("; ")}`).toEqual([]);
});

test("login: renders the credentials sign-in form", async ({ page }) => {
  const errors = trackPageErrors(page);
  const res = await page.goto("/login");
  expect(res?.status(), "login should respond 2xx/3xx").toBeLessThan(400);
  // OAuth buttons are gated by AUTH_GITHUB/AUTH_GOOGLE env, so they're absent in
  // demo mode (CI). The credentials form always renders — anchor on that.
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  expect(errors, `uncaught page errors: ${errors.join("; ")}`).toEqual([]);
});

test("signup: renders the create-account screen", async ({ page }) => {
  const errors = trackPageErrors(page);
  const res = await page.goto("/signup");
  expect(res?.status(), "signup should respond 2xx/3xx").toBeLessThan(400);
  // Heading is present whether DB-backed signup is enabled or in demo mode.
  await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();
  expect(errors, `uncaught page errors: ${errors.join("; ")}`).toEqual([]);
});

test("health: /api/health responds ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok(), `health status ${res.status()}`).toBeTruthy();
});

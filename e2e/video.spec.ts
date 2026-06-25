import { test, expect, type Page } from "@playwright/test";

/**
 * HelixVideo coverage — the white-labeled text-to-video surface (PRs #75/#76).
 *
 * Like the rest of the suite this is DB-free: the marketing section renders in
 * demo mode, the `(app)/video` route is gated by the same auth round-trip as the
 * editor (demo account works in every mode — see DEMO_USER in src/lib/auth.ts),
 * and the API rejects unauthenticated callers before touching the DB or the
 * provider. Assertions anchor on durable copy/headings, never styling, and the
 * studio's heading/composer render regardless of plan (only the upgrade banner
 * is premium-gated), so these hold for the non-premium demo user too.
 */
const DEMO = { email: "demo@helixstudio.org", password: "helix-demo" };

/** Fail a test if the page throws an uncaught error while we're on it. */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** Sign in with the demo account and land on the authenticated home ("/"). */
async function signInAsDemo(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => new URL(url).pathname === "/", { timeout: 15_000 });
}

test("marketing: landing shows the HelixVideo section with a CTA to /video", async ({ page }) => {
  const errors = trackPageErrors(page);
  // Unauthenticated `/` redirects to the marketing page, which hosts the section.
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome/);

  const section = page.locator("#video");
  await expect(section.getByRole("heading", { name: /Ship the app/i })).toBeVisible();

  const cta = section.getByRole("link", { name: /Try HelixVideo/i });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "/video");

  expect(errors, `uncaught page errors: ${errors.join("; ")}`).toEqual([]);
});

test("video: `/video` requires auth and bounces unauthenticated visitors", async ({ page }) => {
  // The route lives under the (app) group, so its layout redirects to /welcome.
  await page.goto("/video");
  await expect(page).toHaveURL(/\/welcome/);
});

test("video: authenticated user reaches the HelixVideo studio", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signInAsDemo(page);

  await page.goto("/video");
  await expect(page).toHaveURL(/\/video/);
  // Header + composer render for every plan (the upgrade banner is the only
  // premium-gated piece), so anchor on those.
  await expect(page.getByRole("heading", { name: /^HelixVideo$/ })).toBeVisible();
  // Anchor on the composer's durable pieces: the Prompt label and the primary
  // action. (Avoid taglines/preview copy, which the studio rebrand churns.)
  await expect(page.getByText("Prompt", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate video/i })).toBeVisible();

  expect(errors, `uncaught page errors: ${errors.join("; ")}`).toEqual([]);
});

test("video: /api/video rejects unauthenticated callers", async ({ request }) => {
  // Both verbs gate on the session before any provider/DB work, so an
  // anonymous request must be refused (401), never a 2xx or a 500.
  const getRes = await request.get("/api/video?id=does-not-exist");
  expect(getRes.status(), `GET status ${getRes.status()}`).toBe(401);

  const postRes = await request.post("/api/video", {
    data: { prompt: "a calm seascape at golden hour", seconds: "4" },
  });
  expect(postRes.status(), `POST status ${postRes.status()}`).toBe(401);
});

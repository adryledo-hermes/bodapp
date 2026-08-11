import { test, expect } from "@playwright/test";

/**
 * DB-free harness smoke test.
 *
 * Hits the server-rendered welcome page (`/`) and asserts the page actually
 * rendered in a real browser: Bodapp title + the two entry actions (log in,
 * register a couple). Needs NO database — for anonymous visitors `/` is
 * rendered without any Prisma calls (no session cookie → no /panel redirect).
 *
 * Login → add guest → seat drag → invitation flows are added by later tasks.
 */
test("welcome page renders with title and auth links (no DB required)", async ({
  page,
}) => {
  await page.goto("/");

  // Landing heading — same copy in every locale.
  await expect(page.getByRole("heading", { name: "Bodapp" })).toBeVisible();

  // Both entry actions are present: login (existing couple) and setup (register).
  await expect(page.locator('a[href="/login"]')).toBeVisible();
  await expect(page.locator('a[href="/setup"]')).toBeVisible();

  // We stayed on the welcome page (no session → no redirect to /panel).
  await expect(page).toHaveURL(/\/$/);
});
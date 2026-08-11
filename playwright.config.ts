import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e harness — UI smoke tests live in tests/e2e.
 *
 * - Run:            npm run test:e2e          (headed: npm run test:e2e:headed)
 * - Docs:           tests/e2e/README.md
 * - App URL:        http://localhost:3000 (baseURL below)
 * - Database:       NOT required — the smoke spec only hits the server-rendered
 *                   welcome page (`/`), which renders without a DB for
 *                   anonymous visitors. DB-backed flows come in later tasks.
 *
 * RAM note (1.9GB dev box): `next dev` is lighter than `next build`. If the
 * box cannot spawn the dev server, start the app yourself (`npm run dev`) and
 * Playwright reuses it (reuseExistingServer) instead of starting a second one.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
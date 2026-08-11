# E2E UI tests (Playwright)

Playwright-based browser smoke tests for the Bodapp UI. They live in
`tests/e2e/` and are run with the `@playwright/test` runner — **not** vitest
(vitest excludes this directory; see `vitest.config.ts`).

## Run

```bash
npm run test:e2e            # headless
npm run test:e2e:headed     # headed (watch the browser)
```

The config (`playwright.config.ts`) auto-starts the app with `npm run dev`
against `http://localhost:3000` (`webServer.reuseExistingServer` is on outside
CI, so you can also start the app yourself first — e.g. for a manual test DB
setup — and Playwright will reuse it).

## What the smoke test covers

- **`smoke.spec.ts`** — DB-free: loads the welcome page (`/`) and asserts it
  renders (Bodapp heading + the log-in and register links). No database is
  required because an anonymous visitor gets the server-rendered landing page.

Later tasks extend the suite with DB-backed flows (login → add guest → drag to
a chair → create invitation). Those need a reachable database; the intended
setup is a **test database** configured via the app's normal env vars
(`DATABASE_URL` pointing at a disposable Postgres, e.g. `bodapp_test`), with
migrations applied (`npx prisma migrate deploy`) before running the suite.

## RAM note (dev box)

The 1.9GB development box cannot run `next build`, and `next dev` is the
lighter option — but installing the Playwright Chromium browser
(`npx playwright install chromium`) may still be too heavy there. Two
workarounds:

1. Run the e2e suite on a machine with more memory (CI, the Hetzner VPS, or a
   laptop) — there the one-time step is:
   ```bash
   npx playwright install chromium
   npm run test:e2e
   ```
2. On constrained boxes, at minimum `npm run test:e2e` against an
   already-running app will work **if** a browser binary is present; otherwise
   keep the suite green via CI and rely on tsc/vitest locally.

## CI usage

`playwright.config.ts` already behaves CI-friendly: `forbidOnly`, `retries: 2`,
`workers: 1`, and `reuseExistingServer: false`. Add a CI step that runs
`npx playwright install --with-deps chromium` then `npm run test:e2e`.
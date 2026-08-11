import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Playwright specs live in tests/e2e and are run by `npm run test:e2e`,
    // never by vitest (a default `*.spec.ts` include would otherwise pick them
    // up and fail, since they import @playwright/test fixtures).
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/tests/e2e/**",
    ],
  },
});

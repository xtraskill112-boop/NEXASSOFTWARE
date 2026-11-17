import { defineConfig } from "@playwright/test";

/**
 * End-to-end suite. Expects the API (:4000), storefront (:3000), console (:3001) and partner app
 * (:3002) to be running — see docs/TESTING.md for the one-command runner (scripts/e2e.sh).
 */
export default defineConfig({
  testDir: ".",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { trace: "off", screenshot: "only-on-failure", actionTimeout: 30_000, navigationTimeout: 90_000 },
});

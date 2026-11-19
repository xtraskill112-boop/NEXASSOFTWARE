import { defineConfig } from "@playwright/test";

/** Read-only checks against the deployed shop (see live.spec.ts). The free server may need a minute to wake up. */
export default defineConfig({
  testDir: ".",
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  use: { trace: "off", screenshot: "only-on-failure", actionTimeout: 30_000, navigationTimeout: 120_000 },
  outputDir: "../../test-results/live",
});

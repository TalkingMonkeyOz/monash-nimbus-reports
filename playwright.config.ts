import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  retries: 1,
  use: {
    // Base URL for API tests - loaded from env or default to test-monash
    baseURL: process.env.NIMBUS_BASE_URL || "https://test-monash.nimbus.cloud",
  },
  projects: [
    // Quick sanity checks (~5 seconds) - run before dev sessions
    {
      name: "quick",
      testMatch: /quick\.api\.spec\.ts/,
    },
    // Full regression tests (~15 seconds) - run before releases
    {
      name: "regression",
      testMatch: /regression\.api\.spec\.ts/,
    },
    // Data discovery - run to refresh test baseline data
    {
      name: "discover",
      testMatch: /discover-test-data\.api\.spec\.ts/,
    },
    // All API tests
    {
      name: "api",
      testMatch: /.*\.api\.spec\.ts/,
    },
    // E2E browser tests (future)
    {
      name: "e2e",
      testMatch: /.*\.e2e\.spec\.ts/,
      use: {
        headless: true,
      },
    },
  ],
});

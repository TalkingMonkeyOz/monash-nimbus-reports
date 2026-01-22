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
    {
      name: "api",
      testMatch: /.*\.api\.spec\.ts/,
    },
    {
      name: "e2e",
      testMatch: /.*\.e2e\.spec\.ts/,
      use: {
        // E2E tests need browser
        headless: true,
      },
    },
  ],
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 1,
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3002",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    // Setup: authenticates once and saves storage state for "app" tests
    {
      name: "setup",
      testMatch: /\.setup\.ts/,
    },
    // Auth tests: fresh context, no pre-existing auth
    {
      name: "auth",
      testMatch: /auth\.spec\.ts/,
    },
    // App tests: reuse auth from setup project (no per-test login)
    {
      name: "app",
      testIgnore: /auth\.spec\.ts|\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        storageState: "e2e/.auth/user.json",
      },
    },
  ],
  webServer: undefined,
});

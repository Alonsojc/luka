import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 1,
  workers: 1,
  use: {
    baseURL: "http://localhost:3002",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: "auth",
      testMatch: /auth\.spec\.ts/,
    },
    {
      name: "app",
      testIgnore: /auth\.spec\.ts/,
    },
  ],
  webServer: undefined,
});

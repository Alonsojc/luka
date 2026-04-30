import { defineConfig } from "@playwright/test";

delete process.env.NO_COLOR;
delete process.env.FORCE_COLOR;

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3002";
const apiURL = process.env.PLAYWRIGHT_API_URL || "http://localhost:3001/api";
const apiHealthURL = new URL("/api/health", apiURL).toString();

const e2eApiEnv = {
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgresql://luka:luka_dev_2024@localhost:5432/luka_system?schema=public",
  JWT_SECRET: process.env.JWT_SECRET || "test-secret-minimum-32-characters-long",
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET || "test-refresh-secret-minimum-32-chars",
  JWT_EXPIRATION: process.env.JWT_EXPIRATION || "20h",
  JWT_REFRESH_EXPIRATION: process.env.JWT_REFRESH_EXPIRATION || "7d",
  WEB_URL: baseURL,
  API_PORT: new URL(apiURL).port || "3001",
  NODE_ENV: "test",
  QUEUE_MODE: "disabled",
  CACHE_MODE: "disabled",
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function withEnv(command: string, env: Record<string, string>): string {
  return `env -u FORCE_COLOR ${Object.entries(env)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ")} ${command}`;
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 1,
  workers: 1,
  use: {
    baseURL,
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
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"
      ? undefined
      : [
          {
            command: withEnv("pnpm --filter @luka/api exec nest start", e2eApiEnv),
            url: apiHealthURL,
            timeout: 120000,
            reuseExistingServer: !process.env.CI,
          },
          {
            command: withEnv("pnpm --filter @luka/web dev", {
              NEXT_PUBLIC_API_URL: apiURL,
              NEXT_PUBLIC_WS_URL: apiURL.replace(/^http/, "ws").replace(/\/api$/, ""),
            }),
            url: new URL("/login", baseURL).toString(),
            timeout: 120000,
            reuseExistingServer: !process.env.CI,
          },
        ],
});

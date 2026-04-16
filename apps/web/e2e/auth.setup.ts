import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "fs";
import { TEST_USER, TEST_PASSWORD } from "./helpers/auth";

const AUTH_FILE = "e2e/.auth/user.json";

/**
 * Authenticates once via the login form and saves the browser storage
 * state (cookies + localStorage) so all "app" project tests can reuse
 * it without logging in again.
 */
setup("authenticate", async ({ page }) => {
  mkdirSync("e2e/.auth", { recursive: true });

  await page.goto("/login");
  await page.waitForSelector("#email", { timeout: 15000 });

  await page.fill("#email", TEST_USER);
  await page.fill("#password", TEST_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL("**/dashboard", { timeout: 30000 });
  await expect(page.locator("h1")).toBeVisible({ timeout: 15000 });

  await page.context().storageState({ path: AUTH_FILE });
});

import { test as base } from "@playwright/test";

/**
 * Extended test fixture that navigates to /dashboard before each test.
 * Authentication is handled by the "setup" project which saves
 * storageState (cookies + localStorage) reused by all "app" tests.
 */
export const test = base.extend<{ authedPage: void }>({
  authedPage: [
    async ({ page }, use) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("domcontentloaded");
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";

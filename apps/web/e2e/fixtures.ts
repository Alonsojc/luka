import { test as base } from "@playwright/test";
import { login } from "./helpers/auth";

/**
 * Extended test fixture that auto-authenticates via the login form
 * before each test. Uses the same UI flow as auth:5 which navigates
 * via client-side router.push (avoids the server-side middleware
 * cookie check that page.goto triggers).
 */
export const test = base.extend<{ authedPage: void }>({
  authedPage: [
    async ({ page }, use) => {
      await login(page);
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";

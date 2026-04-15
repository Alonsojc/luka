import { test as base } from "@playwright/test";

const API_URL = "http://localhost:3001/api";

/**
 * Extended test fixture that auto-authenticates by calling the login API
 * so the browser receives httpOnly auth cookies before each test.
 * Much faster than filling the UI form every time.
 */
export const test = base.extend<{ authedPage: void }>({
  authedPage: [
    async ({ page }, use) => {
      // Navigate first so the browser has the correct origin for cookies
      await page.goto("/login", { waitUntil: "commit" });

      // Call login API from the page context so cookies are set on the browser
      const userJson = await page.evaluate(async (apiUrl) => {
        const res = await fetch(`${apiUrl}/auth/login`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "admin@lukapoke.com", password: "Admin123!" }),
        });
        const data = await res.json();
        // Store user info (tokens come as httpOnly cookies automatically)
        localStorage.setItem("luka_user", JSON.stringify(data.user));
        return data.user;
      }, API_URL);

      if (!userJson) throw new Error("Failed to authenticate in fixture");

      // Navigate to dashboard so tests start from a known authed state
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";

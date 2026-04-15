import { type Page, expect } from "@playwright/test";

/**
 * Navigates to a given path and waits for the page to finish loading.
 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
}

/**
 * Asserts that the main heading (h1) on the page matches the given title.
 */
export async function expectPageTitle(page: Page, title: string) {
  const heading = page.locator("h1").first();
  await expect(heading).toContainText(title);
}

/**
 * Waits for all pending API calls (requests to the backend) to complete.
 * Useful after actions that trigger server-side mutations.
 */
export async function waitForApi(page: Page) {
  // Wait until the network is idle (no ongoing fetch requests for 500 ms)
  await page.waitForLoadState("networkidle");
}

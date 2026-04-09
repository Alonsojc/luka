import { type Page, expect } from '@playwright/test';

export const TEST_USER = 'admin@lukapoke.com';
export const TEST_PASSWORD = 'Admin123!';

/**
 * Fills email/password on the login page, submits, and waits for
 * the dashboard to load.
 */
export async function login(
  page: Page,
  email: string = TEST_USER,
  password: string = TEST_PASSWORD,
) {
  await page.goto('/login');
  await page.waitForSelector('#email');

  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');

  // Wait for navigation to the dashboard after successful login
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await expect(page.locator('h1')).toBeVisible();
}

/**
 * Clicks the logout button in the sidebar and waits for the
 * redirect back to the login page.
 */
export async function logout(page: Page) {
  await page.click('button[title="Cerrar sesion"]');
  await page.waitForURL('**/login', { timeout: 10000 });
}

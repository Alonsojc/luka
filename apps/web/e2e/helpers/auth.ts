import { type Page, expect } from '@playwright/test';

export const TEST_USER = 'admin@lukapoke.com';
export const TEST_PASSWORD = 'Admin123!';

const API_URL = 'http://localhost:3001/api';

/**
 * Fills email/password on the login page, submits, and waits for
 * the dashboard to load. Used by auth tests that exercise the UI flow.
 */
export async function login(
  page: Page,
  email: string = TEST_USER,
  password: string = TEST_PASSWORD,
) {
  await page.goto('/login');
  await page.waitForSelector('#email', { timeout: 10000 });

  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard', { timeout: 30000 });
  await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
}

/**
 * Fast login via API — triggers the login endpoint from within the page
 * so the browser receives httpOnly cookies directly. No UI interaction needed.
 */
export async function loginViaApi(page: Page) {
  await page.goto('/login');
  await page.evaluate(async (apiUrl) => {
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@lukapoke.com', password: 'Admin123!' }),
    });
    const data = await res.json();
    localStorage.setItem('luka_user', JSON.stringify(data.user));
  }, API_URL);
}

/**
 * Clicks the logout button in the sidebar and waits for the
 * redirect back to the login page.
 */
export async function logout(page: Page) {
  const logoutBtn = page.locator('button').filter({ hasText: /cerrar sesion/i });
  await logoutBtn.click();
  await page.waitForURL('**/login', { timeout: 15000 });
}

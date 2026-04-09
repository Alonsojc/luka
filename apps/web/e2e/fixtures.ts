import { test as base } from '@playwright/test';

const API_URL = 'http://localhost:3001/api';

// Cache tokens across tests in the same worker
let cachedTokens: { accessToken: string; refreshToken: string; user: string } | null = null;

async function getTokens(): Promise<typeof cachedTokens> {
  if (cachedTokens) return cachedTokens;

  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@lukapoke.com', password: 'Admin123!' }),
  });
  const data = await res.json();
  cachedTokens = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: JSON.stringify(data.user),
  };
  return cachedTokens;
}

/**
 * Extended test fixture that auto-authenticates by setting
 * localStorage tokens before each test. Much faster than UI login.
 */
export const test = base.extend<{ authedPage: void }>({
  authedPage: [async ({ page }, use) => {
    const tokens = await getTokens();
    if (!tokens) throw new Error('Failed to get auth tokens');

    // Navigate to login to get the correct domain for localStorage
    await page.goto('/login', { waitUntil: 'commit' });
    await page.evaluate((t) => {
      localStorage.setItem('luka_access_token', t.accessToken);
      localStorage.setItem('luka_refresh_token', t.refreshToken);
      localStorage.setItem('luka_user', t.user);
    }, tokens);

    // Navigate to dashboard so tests start from a known authed state
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await use();
  }, { auto: true }],
});

export { expect } from '@playwright/test';

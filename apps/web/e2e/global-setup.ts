import { chromium, type FullConfig } from '@playwright/test';

const API_URL = 'http://localhost:3001/api';

async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: config.projects[0]?.use?.baseURL || 'http://localhost:3002' });

  // Login via API and set tokens in localStorage
  await page.goto('/login');

  const res = await page.evaluate(async (apiUrl) => {
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@lukapoke.com', password: 'Admin123!' }),
    });
    const data = await response.json();
    localStorage.setItem('luka_access_token', data.accessToken);
    localStorage.setItem('luka_refresh_token', data.refreshToken);
    localStorage.setItem('luka_user', JSON.stringify(data.user));
    return !!data.accessToken;
  }, API_URL);

  if (!res) throw new Error('Global setup: login failed');

  // Save storage state for all tests to reuse
  await page.context().storageState({ path: 'e2e/.auth/storage-state.json' });
  await browser.close();
}

export default globalSetup;

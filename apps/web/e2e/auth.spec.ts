import { test, expect } from '@playwright/test';
import { login, logout, TEST_USER, TEST_PASSWORD } from './helpers/auth';

test.describe('Autenticacion', () => {
  test('login con credenciales validas redirige al dashboard', async ({ page }) => {
    await login(page, TEST_USER, TEST_PASSWORD);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('h1')).toContainText('Bienvenido');
  });

  test('login con contrasena incorrecta muestra error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', TEST_USER);
    await page.fill('#password', 'ContrasenaMala999');
    await page.click('button[type="submit"]');

    // The error banner should appear inside the form
    const errorBanner = page.locator('.bg-red-500\\/20');
    await expect(errorBanner).toBeVisible({ timeout: 10000 });
    await expect(errorBanner).toContainText(/error|incorrecta|invalid/i);

    // Should remain on the login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('login con email inexistente muestra error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'noexiste@lukapoke.com');
    await page.fill('#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    const errorBanner = page.locator('.bg-red-500\\/20');
    await expect(errorBanner).toBeVisible({ timeout: 10000 });

    await expect(page).toHaveURL(/\/login/);
  });

  test('logout redirige a la pagina de login', async ({ page }) => {
    // First log in
    await login(page);

    // Now log out
    await logout(page);

    await expect(page).toHaveURL(/\/login/);
    // The login form should be visible again
    await expect(page.locator('#email')).toBeVisible();
  });

  test('ruta protegida sin autenticacion redirige a login', async ({ page }) => {
    // Ensure no auth tokens exist
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.removeItem('luka_access_token');
      localStorage.removeItem('luka_refresh_token');
      localStorage.removeItem('luka_user');
    });

    // Try to access a protected route directly
    await page.goto('/dashboard');

    // Should be redirected to the login page
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});

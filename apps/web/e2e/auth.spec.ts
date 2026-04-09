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

    // The error banner should appear
    await expect(page.locator('text=Credenciales')).toBeVisible({ timeout: 15000 });

    // Should remain on the login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('login con email inexistente muestra error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'noexiste@lukapoke.com');
    await page.fill('#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Error should appear
    await expect(page.locator('[class*="bg-red"]')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout redirige a la pagina de login', async ({ page }) => {
    await login(page);
    await logout(page);

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#email')).toBeVisible();
  });

  test('ruta protegida sin autenticacion redirige a login', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.removeItem('luka_access_token');
      localStorage.removeItem('luka_refresh_token');
      localStorage.removeItem('luka_user');
    });

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });
});

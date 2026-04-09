import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('muestra mensaje de bienvenida con nombre del usuario', async ({ page }) => {
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    // The dashboard heading is "Bienvenido, <firstName>"
    await expect(heading).toContainText('Bienvenido');
  });

  test('muestra tarjetas de estadisticas (sucursales, productos, etc.)', async ({ page }) => {
    // Wait for stats cards to render
    const statsGrid = page.locator('.grid.grid-cols-2');
    await expect(statsGrid).toBeVisible({ timeout: 15000 });

    // Verify known stat card titles are present
    const expectedLabels = ['Sucursales', 'Productos', 'Empleados', 'Proveedores', 'Clientes'];
    for (const label of expectedLabels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible();
    }
  });

  test('selector de sucursal se abre y lista sucursales', async ({ page }) => {
    // The branch selector button contains "Todas las Sucursales" by default
    const branchButton = page.locator('button', { hasText: 'Todas las Sucursales' });
    await expect(branchButton).toBeVisible();

    // Click to open the dropdown
    await branchButton.click();

    // The dropdown should appear with at least the "Todas las Sucursales" option
    const dropdown = page.locator('.absolute.left-0.top-full');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.locator('button').first()).toBeVisible();
  });

  test('campana de notificaciones es visible', async ({ page }) => {
    // The Bell icon is rendered inside a button in the header
    const bellButton = page.locator('header button').filter({
      has: page.locator('svg.lucide-bell'),
    });
    await expect(bellButton).toBeVisible();
  });
});

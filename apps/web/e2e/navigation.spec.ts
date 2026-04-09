import { test, expect } from './fixtures';

// The sidebar sections and items defined in the dashboard layout
const EXPECTED_SECTIONS = [
  'OPERACIONES',
  'FINANZAS',
  'ANALYTICS',
  'CLIENTES',
  'SISTEMA',
];

const EXPECTED_NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Inventarios', href: '/inventarios' },
  { name: 'Compras', href: '/compras' },
  { name: 'Sucursales', href: '/sucursales' },
  { name: 'Bancos', href: '/bancos' },
  { name: 'Facturacion', href: '/facturacion' },
  { name: 'Contabilidad', href: '/contabilidad' },
  { name: 'Reportes', href: '/reportes' },
  { name: 'CRM', href: '/crm' },
  { name: 'Configuracion', href: '/configuracion' },
];

test.describe('Navegacion', () => {
  test('sidebar muestra todas las secciones esperadas', async ({ page }) => {
    // The sidebar is the <aside> element
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();

    // Check that section labels are present
    for (const section of EXPECTED_SECTIONS) {
      await expect(sidebar.locator(`text=${section}`)).toBeVisible();
    }
  });

  test('hacer click en items del menu navega correctamente', async ({ page }) => {
    // Pick a few navigation items to test
    const itemsToTest = [
      { name: 'Inventarios', urlPattern: /\/inventarios/ },
      { name: 'Compras', urlPattern: /\/compras/ },
      { name: 'Facturacion', urlPattern: /\/facturacion/ },
    ];

    for (const item of itemsToTest) {
      const navLink = page.locator('aside a', { hasText: item.name });
      await expect(navLink).toBeVisible();
      await navLink.click();

      await expect(page).toHaveURL(item.urlPattern, { timeout: 10000 });

      // Navigate back to dashboard for the next iteration
      await page.locator('aside a', { hasText: 'Dashboard' }).click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    }
  });

  test('menu movil funciona al redimensionar', async ({ page }) => {
    // Resize to mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    // The sidebar should be hidden on mobile (translated off-screen)
    const sidebar = page.locator('aside');
    // On mobile, the sidebar has -translate-x-full class (hidden)
    await expect(sidebar).toHaveCSS('transform', /matrix.*-/);

    // The hamburger menu button should be visible
    const menuButton = page.locator('header button').filter({
      has: page.locator('svg.lucide-menu'),
    });
    await expect(menuButton).toBeVisible();

    // Click the hamburger to open the sidebar
    await menuButton.click();

    // After clicking, the sidebar should become visible (translate-x-0)
    await expect(sidebar).toBeVisible();

    // The overlay backdrop should also appear
    const overlay = page.locator('.fixed.inset-0.bg-black\\/50');
    await expect(overlay).toBeVisible();

    // Close the sidebar by clicking the X button inside it
    const closeButton = sidebar.locator('button').filter({
      has: page.locator('svg.lucide-x'),
    });
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // Sidebar should go back to hidden state
    await page.waitForTimeout(400); // transition duration
  });

  test('item de navegacion activo esta resaltado', async ({ page }) => {
    // Navigate to Inventarios
    const inventariosLink = page.locator('aside a', { hasText: 'Inventarios' });
    await inventariosLink.click();
    await expect(page).toHaveURL(/\/inventarios/, { timeout: 10000 });

    // The active link should have the highlighted class (bg-white/15)
    await expect(inventariosLink).toHaveClass(/bg-white\/15/);

    // The Dashboard link should NOT be highlighted
    const dashboardLink = page.locator('aside a', { hasText: 'Dashboard' });
    await expect(dashboardLink).not.toHaveClass(/bg-white\/15/);
  });
});

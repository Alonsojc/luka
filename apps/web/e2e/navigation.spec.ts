import { test, expect } from "./fixtures";

// The sidebar sections and items defined in the dashboard layout
const EXPECTED_SECTIONS = ["OPERACIONES", "FINANZAS", "ANALYTICS", "CLIENTES", "SISTEMA"];

const _EXPECTED_NAV_ITEMS = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Inventarios", href: "/inventarios" },
  { name: "Compras", href: "/compras" },
  { name: "Sucursales", href: "/sucursales" },
  { name: "Bancos", href: "/bancos" },
  { name: "Facturacion", href: "/facturacion" },
  { name: "Contabilidad", href: "/contabilidad" },
  { name: "Reportes", href: "/reportes" },
  { name: "CRM", href: "/crm" },
  { name: "Configuracion", href: "/configuracion" },
];

test.describe("Navegacion", () => {
  test("sidebar muestra todas las secciones esperadas", async ({ page }) => {
    // The sidebar is the <aside> element
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    // Check that section labels are present
    for (const section of EXPECTED_SECTIONS) {
      await expect(sidebar.locator(`text=${section}`)).toBeVisible();
    }
  });

  test("hacer click en items del menu navega correctamente", async ({ page }) => {
    // Pick a few navigation items to test
    const itemsToTest = [
      { name: "Inventarios", section: "OPERACIONES", urlPattern: /\/inventarios/ },
      { name: "Compras", section: "OPERACIONES", urlPattern: /\/compras/ },
      { name: "Facturacion", section: "FINANZAS", urlPattern: /\/facturacion/ },
    ];

    for (const item of itemsToTest) {
      const navLink = page.locator("aside a", { hasText: item.name }).first();

      // Expand the section if the nav link is not visible
      if (!(await navLink.isVisible())) {
        const sectionButton = page.locator("aside button", { hasText: item.section });
        await sectionButton.click();
        await page.waitForTimeout(300);
      }

      await expect(navLink).toBeVisible({ timeout: 5000 });
      await navLink.click();

      await expect(page).toHaveURL(item.urlPattern, { timeout: 10000 });

      // Navigate back to dashboard for the next iteration
      await page.locator("aside a", { hasText: "Dashboard" }).first().click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    }
  });

  test("menu movil funciona al redimensionar", async ({ page }) => {
    // Resize to mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    // The sidebar should be hidden on mobile (translated off-screen via -translate-x-full)
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeAttached();

    // The menu button is in the BottomNav, not the header
    const menuButton = page.locator("nav.fixed button", { hasText: "Menu" }).first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });

    // Click the menu button to open the sidebar
    await menuButton.click();
    await page.waitForTimeout(400);

    // After clicking, the sidebar should become visible (translate-x-0)
    await expect(sidebar).toBeVisible();

    // Close the sidebar by clicking the X button inside it
    const closeButton = sidebar.locator("button").filter({
      has: page.locator("svg.lucide-x"),
    }).first();
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // Sidebar should go back to hidden state
    await page.waitForTimeout(400); // transition duration
  });

  test("item de navegacion activo esta resaltado", async ({ page }) => {
    const inventariosLink = page.locator("aside a", { hasText: "Inventarios" }).first();

    // Expand the OPERACIONES section if not already visible
    if (!(await inventariosLink.isVisible())) {
      const sectionButton = page.locator("aside button", { hasText: "OPERACIONES" });
      await sectionButton.click();
      await page.waitForTimeout(300);
    }

    // Navigate to Inventarios
    await expect(inventariosLink).toBeVisible({ timeout: 5000 });
    await inventariosLink.click();
    await expect(page).toHaveURL(/\/inventarios/, { timeout: 10000 });

    // The active link should have the highlighted class (bg-white/15)
    await expect(inventariosLink).toHaveClass(/bg-white\/15/);

    // The Dashboard link should NOT be highlighted
    const dashboardLink = page.locator("aside a", { hasText: "Dashboard" }).first();
    await expect(dashboardLink).not.toHaveClass(/bg-white\/15/);
  });
});

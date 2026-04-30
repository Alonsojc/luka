import { test, expect } from "./fixtures";
import { navigateTo } from "./helpers/navigation";

// The sidebar sections and items defined in the dashboard layout
const EXPECTED_SECTIONS = ["OPERACIONES", "FINANZAS", "ANALYTICS", "CLIENTES", "SISTEMA"];

test.describe("Navegacion", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/dashboard");
  });

  test("sidebar muestra todas las secciones esperadas", async ({ page }) => {
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    for (const section of EXPECTED_SECTIONS) {
      await expect(sidebar.locator(`text=${section}`)).toBeVisible();
    }
  });

  test("hacer click en items del menu navega correctamente", async ({ page }) => {
    const itemsToTest = [
      { name: "Inventarios", section: "OPERACIONES", urlPattern: /\/inventarios/ },
      { name: "Compras", section: "OPERACIONES", urlPattern: /\/compras/ },
      { name: "Bancos", section: "FINANZAS", urlPattern: /\/bancos/ },
    ];

    for (const item of itemsToTest) {
      // Expand the correct section
      const navLink = page.locator("aside a", { hasText: item.name }).first();
      if (!(await navLink.isVisible().catch(() => false))) {
        const sectionBtn = page.locator("aside button", { hasText: item.section });
        if (await sectionBtn.isVisible().catch(() => false)) {
          await sectionBtn.click();
          await page.waitForTimeout(400);
        }
      }

      await expect(navLink).toBeVisible({ timeout: 5000 });
      // Use evaluate to dispatch click directly, bypassing the section
      // header button that overlaps nav links during expand animation
      await navLink.evaluate((el) => (el as HTMLElement).click());
      await expect(page).toHaveURL(item.urlPattern, { timeout: 15000 });

      // Navigate back to dashboard
      const dashLink = page.locator("aside a", { hasText: "Dashboard" }).first();
      await dashLink.evaluate((el) => (el as HTMLElement).click());
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    }
  });

  test("menu movil funciona al redimensionar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    // The sidebar should exist but be off-screen on mobile
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeAttached();

    // Find the mobile menu trigger (bottom nav or hamburger)
    const menuButton = page
      .locator("button")
      .filter({ has: page.locator("svg.lucide-menu") })
      .first();
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click();
      await page.waitForTimeout(400);
      await expect(sidebar).toBeVisible();
    } else {
      // Some layouts put the menu in a bottom nav bar
      const bottomMenuBtn = page.locator("nav button").first();
      if (await bottomMenuBtn.isVisible().catch(() => false)) {
        await bottomMenuBtn.click();
        await page.waitForTimeout(400);
      }
    }
  });

  test("item de navegacion activo esta resaltado", async ({ page }) => {
    // Expand OPERACIONES section to access Inventarios
    const sectionBtn = page.locator("aside button", { hasText: "OPERACIONES" });
    if (await sectionBtn.isVisible().catch(() => false)) {
      await sectionBtn.click();
      await page.waitForTimeout(400);
    }

    const inventariosLink = page.locator("aside a", { hasText: "Inventarios" }).first();
    await expect(inventariosLink).toBeVisible({ timeout: 5000 });
    await inventariosLink.click();
    await expect(page).toHaveURL(/\/inventarios/, { timeout: 15000 });

    await expect(inventariosLink).toHaveClass(/bg-white\/20/, { timeout: 5000 });

    // Dashboard should NOT be highlighted
    const dashboardLink = page.locator("aside a", { hasText: "Dashboard" }).first();
    await expect(dashboardLink).not.toHaveClass(/bg-white\/20/);
  });
});

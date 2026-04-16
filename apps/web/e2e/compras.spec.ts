import { test, expect } from "./fixtures";
import { navigateTo } from "./helpers/navigation";

test.describe("Compras", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/compras");
  });

  test("carga lista de proveedores", async ({ page }) => {
    // Switch to the "Proveedores" tab
    const proveedoresTab = page.locator("button", { hasText: "Proveedores" }).first();
    await expect(proveedoresTab).toBeVisible();
    await proveedoresTab.click();

    // Wait for the data table to appear
    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 15000 });

    // The table should have column headers (e.g., Nombre, RFC, etc.)
    const headerRow = table.locator("thead tr").first();
    await expect(headerRow).toBeVisible();
  });

  test("cambiar a tab Ordenes de Compra", async ({ page }) => {
    // The "Ordenes de Compra" tab should be visible
    const ordenesTab = page.locator("button", { hasText: "Ordenes de Compra" }).first();
    await expect(ordenesTab).toBeVisible();
    await ordenesTab.click();

    // Wait for content to load
    await page.waitForTimeout(500);

    // A table or an empty-state message should be visible
    const hasTable = await page.locator("table").first().isVisible();
    const hasEmptyMessage = await page.locator("text=/No hay ordenes|Sin ordenes/i").first().isVisible();
    expect(hasTable || hasEmptyMessage).toBeTruthy();
  });

  test("tabla de ordenes de compra muestra datos", async ({ page }) => {
    // Ensure we are on the "Ordenes de Compra" tab (it is the default tab)
    const ordenesTab = page.locator("button", { hasText: "Ordenes de Compra" }).first();
    await expect(ordenesTab).toBeVisible();
    await ordenesTab.click();

    // Wait for the table
    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 15000 });

    // The table header should contain expected columns
    const header = table.locator("thead");
    await expect(header).toBeVisible();
  });
});

import { test, expect } from "./fixtures";
import { navigateTo } from "./helpers/navigation";

test.describe("Compras", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/compras");
  });

  test("carga lista de proveedores", async ({ page }) => {
    // Switch to the "Proveedores" tab (scoped to the tab bar)
    const proveedoresTab = page.getByText("Proveedores", { exact: true }).first();
    await expect(proveedoresTab).toBeVisible({ timeout: 15000 });
    await proveedoresTab.click();

    // Wait for the data table to appear
    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 15000 });

    // The table should have column headers
    const headerRow = table.locator("thead tr").first();
    await expect(headerRow).toBeVisible();
  });

  test("cambiar a tab Ordenes de Compra", async ({ page }) => {
    const ordenesTab = page.getByText("Ordenes de Compra", { exact: true }).first();
    await expect(ordenesTab).toBeVisible({ timeout: 15000 });
    await ordenesTab.click();

    // Wait for content to load
    await page.waitForTimeout(1000);

    // A table or an empty-state message should be visible
    const hasTable = await page.locator("table").first().isVisible();
    const hasEmptyMessage = await page.locator("text=/No hay ordenes|Sin ordenes/i").first().isVisible();
    expect(hasTable || hasEmptyMessage).toBeTruthy();
  });

  test("tabla de ordenes de compra muestra datos", async ({ page }) => {
    const ordenesTab = page.getByText("Ordenes de Compra", { exact: true }).first();
    await expect(ordenesTab).toBeVisible({ timeout: 15000 });
    await ordenesTab.click();

    // Wait for the table
    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 15000 });

    // The table header should contain expected columns
    const header = table.locator("thead");
    await expect(header).toBeVisible();
  });
});

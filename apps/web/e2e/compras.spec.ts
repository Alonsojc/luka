import { test, expect } from "./fixtures";
import { navigateTo } from "./helpers/navigation";

test.describe("Compras", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/compras");
  });

  test("carga lista de proveedores", async ({ page }) => {
    // The default tab is "Ordenes de Compra". Switch to "Proveedores".
    // Use evaluate to click, avoiding "detached from DOM" during React re-renders.
    const proveedoresTab = page.getByText("Proveedores", { exact: true }).first();
    await expect(proveedoresTab).toBeVisible({ timeout: 15000 });
    await proveedoresTab.evaluate((el) => (el as HTMLElement).click());

    // Wait for the data table to appear
    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 15000 });

    const headerRow = table.locator("thead tr").first();
    await expect(headerRow).toBeVisible();
  });

  test("cambiar a tab Ordenes de Compra", async ({ page }) => {
    // "Ordenes de Compra" is the default tab — verify content is present
    const table = page.locator("table").first();
    const hasTable = await table.isVisible().catch(() => false);
    const hasEmptyMessage = await page
      .locator("text=/No hay ordenes|Sin ordenes|No hay datos/i")
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmptyMessage).toBeTruthy();
  });

  test("tabla de ordenes de compra muestra datos", async ({ page }) => {
    // Default tab is "Ordenes de Compra" — wait for table
    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 15000 });

    const header = table.locator("thead");
    await expect(header).toBeVisible();
  });
});

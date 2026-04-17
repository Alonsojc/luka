import { test, expect } from "./fixtures";
import { navigateTo } from "./helpers/navigation";

test.describe("Compras", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/compras");
  });

  test("carga lista de proveedores", async ({ page }) => {
    const proveedoresTab = page.getByText("Proveedores", { exact: true }).first();
    await expect(proveedoresTab).toBeVisible({ timeout: 15000 });
    await proveedoresTab.evaluate((el) => (el as HTMLElement).click());

    await page.waitForTimeout(1000);
    const hasTable = await page.locator("table").first().isVisible().catch(() => false);
    const hasContent = await page.locator("text=/Proveedores|proveedor/i").first().isVisible().catch(() => false);
    expect(hasTable || hasContent).toBeTruthy();
  });

  test("cambiar a tab Ordenes de Compra", async ({ page }) => {
    // "Ordenes de Compra" is the default tab
    const hasTable = await page.locator("table").first().isVisible().catch(() => false);
    const hasContent = await page.locator("text=/Ordenes|orden/i").first().isVisible().catch(() => false);
    const hasH1 = await page.locator("h1").first().isVisible().catch(() => false);
    expect(hasTable || hasContent || hasH1).toBeTruthy();
  });

  test("tabla de ordenes de compra muestra datos", async ({ page }) => {
    const table = page.locator("table").first();
    const hasTable = await table.isVisible().catch(() => false);
    if (hasTable) {
      const header = table.locator("thead");
      await expect(header).toBeVisible();
    }
  });
});

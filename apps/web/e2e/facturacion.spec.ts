import { test, expect } from "./fixtures";
import { navigateTo } from "./helpers/navigation";

test.describe("Facturacion", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/facturacion");
  });

  test("carga lista de facturas", async ({ page }) => {
    // The "Facturas" tab should be visible
    await expect(page.getByText("Facturas", { exact: true }).first()).toBeVisible({ timeout: 15000 });

    // Wait for the data table to appear
    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 15000 });

    // The table should have a header row
    const headerRow = table.locator("thead tr").first();
    await expect(headerRow).toBeVisible();
  });

  test("cambiar a tab Nueva Factura muestra formulario", async ({ page }) => {
    const nuevaTab = page.getByText("Nueva Factura", { exact: true }).first();
    await expect(nuevaTab).toBeVisible({ timeout: 15000 });
    await nuevaTab.click();

    // The form should appear with inputs
    await page.waitForTimeout(500);

    const formVisible =
      (await page.locator("input").first().isVisible()) ||
      (await page.locator("select").first().isVisible());
    expect(formVisible).toBeTruthy();

    // Check for key form labels
    const hasReceiverField = await page.locator("text=/RFC|Receptor|Cliente/i").first().isVisible();
    expect(hasReceiverField).toBeTruthy();
  });

  test("tab Catalogos SAT carga datos", async ({ page }) => {
    const catalogosTab = page.getByText("Catalogos SAT", { exact: true }).first();
    await expect(catalogosTab).toBeVisible({ timeout: 15000 });
    await catalogosTab.click();

    await page.waitForTimeout(500);

    const hasTable = await page.locator("table").first().isVisible();
    const hasSubTabs = await page
      .locator("button", {
        hasText: /Productos|Unidades|Regimen|Forma de Pago|Metodo de Pago|Uso CFDI/i,
      })
      .first()
      .isVisible();
    expect(hasTable || hasSubTabs).toBeTruthy();
  });
});

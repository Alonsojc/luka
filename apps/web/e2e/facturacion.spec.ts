import { test, expect } from "./fixtures";
import { navigateTo } from "./helpers/navigation";

test.describe("Facturacion", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/facturacion");
  });

  test("carga lista de facturas", async ({ page }) => {
    // The "Facturas" tab should be active by default
    const facturasTab = page.locator("button", { hasText: "Facturas" }).first();
    await expect(facturasTab).toBeVisible();

    // Wait for the data table to appear
    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 15000 });

    // The table should have a header row
    const headerRow = table.locator("thead tr").first();
    await expect(headerRow).toBeVisible();
  });

  test("cambiar a tab Nueva Factura muestra formulario", async ({ page }) => {
    // Click the "Nueva Factura" tab
    const nuevaTab = page.locator("button", { hasText: "Nueva Factura" }).first();
    await expect(nuevaTab).toBeVisible();
    await nuevaTab.click();

    // The form should appear with inputs for the new invoice
    // Look for typical form elements (RFC, name fields, selects, etc.)
    await page.waitForTimeout(500);

    const formVisible =
      (await page.locator("input").first().isVisible()) ||
      (await page.locator("select").first().isVisible());
    expect(formVisible).toBeTruthy();

    // Check for key form labels or headings related to invoice creation
    const hasReceiverField = await page.locator("text=/RFC|Receptor|Cliente/i").first().isVisible();
    expect(hasReceiverField).toBeTruthy();
  });

  test("tab Catalogos SAT carga datos", async ({ page }) => {
    // Click the "Catalogos SAT" tab
    const catalogosTab = page.locator("button", { hasText: "Catalogos SAT" }).first();
    await expect(catalogosTab).toBeVisible();
    await catalogosTab.click();

    // Wait for catalog content to load
    await page.waitForTimeout(500);

    // The catalog section should show a table or a sub-tab navigation
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

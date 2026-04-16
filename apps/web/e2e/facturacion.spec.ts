import { test, expect } from "./fixtures";
import { navigateTo } from "./helpers/navigation";

test.describe("Facturacion", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/facturacion");
  });

  test("carga lista de facturas", async ({ page }) => {
    // The "Facturas" tab should be visible
    await expect(page.getByText("Facturas", { exact: true }).first()).toBeVisible({ timeout: 15000 });

    // The page should show either a data table or an empty state
    const hasTable = await page.locator("table").first().isVisible().catch(() => false);
    const hasContent = await page.locator("h1").first().isVisible().catch(() => false);
    expect(hasTable || hasContent).toBeTruthy();
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

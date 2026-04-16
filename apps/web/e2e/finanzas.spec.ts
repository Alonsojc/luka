import { test, expect } from "./fixtures";

test.describe("Modulos Financieros", () => {
  test("Bancos - muestra cuentas bancarias", async ({ page }) => {
    await page.goto("/bancos");
    await expect(page.locator("h1").first()).toContainText("Bancos", { timeout: 15000 });
    await expect(page.locator("text=Cuentas Bancarias").first()).toBeVisible({ timeout: 10000 });
  });

  test("Facturacion - lista facturas", async ({ page }) => {
    await page.goto("/facturacion");
    await expect(page.locator("h1").first()).toContainText("Facturacion", { timeout: 15000 });
    await expect(page.locator("text=Facturas").first()).toBeVisible({ timeout: 10000 });
  });

  test("Contabilidad - muestra catalogo", async ({ page }) => {
    await page.goto("/contabilidad");
    await expect(page.locator("h1").first()).toContainText("Contabilidad", { timeout: 15000 });
    await expect(page.locator("text=Catalogo").first()).toBeVisible({ timeout: 10000 });
  });

  test("Nomina - muestra empleados", async ({ page }) => {
    await page.goto("/nomina");
    await expect(page.locator("h1").first()).toContainText("mina", { timeout: 15000 });
    await expect(page.locator("text=Empleados").first()).toBeVisible({ timeout: 10000 });
  });
});

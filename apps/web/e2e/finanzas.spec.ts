import { test, expect } from "./fixtures";

test.describe("Modulos Financieros", () => {
  test("Bancos - muestra cuentas bancarias", async ({ page }) => {
    await page.goto("/bancos");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Cuentas Bancarias", { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test("Facturacion - lista facturas", async ({ page }) => {
    await page.goto("/facturacion");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Facturas", { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test("Contabilidad - muestra catalogo", async ({ page }) => {
    await page.goto("/contabilidad");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=/Cat[aá]logo/i").first()).toBeVisible({ timeout: 15000 });
  });

  test("Nomina - muestra empleados", async ({ page }) => {
    await page.goto("/nomina");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Empleados", { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });
});

import { test, expect } from "./fixtures";

test.describe("Modulos Financieros", () => {
  test("Bancos - muestra cuentas bancarias", async ({ page }) => {
    await page.goto("/bancos");
    await expect(page.locator("h1")).toContainText("Bancos", { timeout: 15000 });
    await expect(page.locator("text=Cuentas").first()).toBeVisible({ timeout: 10000 });
  });

  test("Facturacion - lista facturas", async ({ page }) => {
    await page.goto("/facturacion");
    await expect(page.locator("h1")).toContainText("Facturacion", { timeout: 15000 });
    await expect(page.locator("text=Emitidas").first()).toBeVisible({ timeout: 10000 });
  });

  test("Contabilidad - muestra catalogo", async ({ page }) => {
    await page.goto("/contabilidad");
    await expect(page.locator("h1")).toContainText("Contabilidad", { timeout: 15000 });
    await expect(page.locator("text=Catalogo").first()).toBeVisible({ timeout: 10000 });
  });

  test("Nomina - muestra empleados", async ({ page }) => {
    await page.goto("/nomina");
    await expect(page.locator("h1")).toContainText("Nomina", { timeout: 15000 });
    await expect(page.locator("text=Empleados").first()).toBeVisible({ timeout: 10000 });
  });
});

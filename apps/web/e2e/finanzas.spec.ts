import { test, expect } from "./fixtures";
import { navigateTo } from "./helpers/navigation";

test.describe("Modulos Financieros", () => {
  test("Bancos - muestra cuentas bancarias", async ({ page }) => {
    await navigateTo(page, "/bancos");
    await expect(page.locator("h1").first()).toContainText("Bancos", { timeout: 15000 });
    await expect(page.locator("text=Cuentas").first()).toBeVisible({ timeout: 10000 });
  });

  test("Facturacion - lista facturas", async ({ page }) => {
    await navigateTo(page, "/facturacion");
    await expect(page.locator("h1").first()).toContainText("Facturacion", { timeout: 15000 });
    await expect(page.locator("text=Emitidas").first()).toBeVisible({ timeout: 10000 });
  });

  test("Contabilidad - muestra catalogo", async ({ page }) => {
    await navigateTo(page, "/contabilidad");
    await expect(page.locator("h1").first()).toContainText("Contabilidad", { timeout: 15000 });
    await expect(page.locator("text=Catalogo").first()).toBeVisible({ timeout: 10000 });
  });

  test("Nomina - muestra empleados", async ({ page }) => {
    await navigateTo(page, "/nomina");
    await expect(page.locator("h1").first()).toContainText("Nomina", { timeout: 15000 });
    await expect(page.locator("text=Empleados").first()).toBeVisible({ timeout: 10000 });
  });
});

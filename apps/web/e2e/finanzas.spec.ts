import { test, expect } from "./fixtures";

test.describe("Modulos Financieros", () => {
  test("Bancos - muestra cuentas bancarias", async ({ page }) => {
    // Use sidebar navigation to avoid auth hydration timing issue with page.goto
    const sectionBtn = page.locator("aside button", { hasText: "FINANZAS" });
    if (await sectionBtn.isVisible().catch(() => false)) {
      await sectionBtn.click();
      await page.waitForTimeout(400);
    }
    const bancosLink = page.locator("aside a", { hasText: "Bancos" }).first();
    await expect(bancosLink).toBeVisible({ timeout: 5000 });
    await bancosLink.evaluate((el) => (el as HTMLElement).click());
    await expect(page).toHaveURL(/\/bancos/, { timeout: 15000 });

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

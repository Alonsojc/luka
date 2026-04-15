import { test, expect } from "./fixtures";

test.describe("Dashboard", () => {
  test("muestra mensaje de bienvenida con nombre del usuario", async ({ page }) => {
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("Bienvenido");
  });

  test("muestra tarjetas de estadisticas", async ({ page }) => {
    // Verify known stat labels are present on the dashboard
    const labels = ["Sucursales", "Productos", "Empleados"];
    for (const label of labels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test("selector de sucursal se abre", async ({ page }) => {
    const branchButton = page.locator("button", { hasText: "Todas las Sucursales" });
    await expect(branchButton).toBeVisible({ timeout: 10000 });
    await branchButton.click();

    // Dropdown should appear
    await expect(page.locator("button", { hasText: /Luka/ }).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("header muestra nombre del usuario", async ({ page }) => {
    await expect(page.locator("text=Alonso").first()).toBeVisible({ timeout: 10000 });
  });
});

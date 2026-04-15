import { test, expect } from "./fixtures";

test.describe("Modulos Analytics", () => {
  test("Reportes - muestra tabs de reportes", async ({ page }) => {
    await page.goto("/reportes");
    await expect(page.locator("h1")).toContainText("Reportes", { timeout: 15000 });

    // Should show report tabs
    await expect(page.locator("text=Ventas").first()).toBeVisible({ timeout: 10000 });
  });

  test("Presupuesto - muestra presupuesto con datos", async ({ page }) => {
    await page.goto("/presupuesto");
    await expect(page.locator("h1")).toContainText("Presupuesto", { timeout: 15000 });

    // Should show budget amounts (from seed data)
    await expect(page.locator("text=Presupuesto Total")).toBeVisible();
    await expect(page.locator("text=Gasto Real")).toBeVisible();

    // Should have at least one category row
    await expect(page.locator("text=Nomina").first()).toBeVisible({ timeout: 10000 });
  });

  test("Inversionistas - muestra KPIs financieros", async ({ page }) => {
    await page.goto("/inversionistas");
    await expect(page.locator("h1")).toContainText("Inversionistas", { timeout: 15000 });

    // Should show key financial metrics
    await expect(page.locator("text=Ingresos Totales")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Utilidad Neta")).toBeVisible();
    await expect(page.locator("text=Ticket Promedio")).toBeVisible();
    await expect(page.locator("text=ROI")).toBeVisible();

    // Ticket Promedio should not be $0.00 (we fixed this)
    const ticketValue = page.locator("text=Ticket Promedio").locator("..").locator("p").last();
    await expect(ticketValue).not.toContainText("$0.00");
  });
});

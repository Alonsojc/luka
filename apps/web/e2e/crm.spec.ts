import { test, expect } from "./fixtures";

test.describe("CRM y Lealtad", () => {
  test("CRM - muestra clientes con tiers variados", async ({ page }) => {
    await page.goto("/crm");
    await expect(page.locator("h1")).toContainText("CRM");

    // Should show KPI cards
    await expect(page.locator("text=Total Clientes")).toBeVisible();
    await expect(page.locator("text=Clientes Gold")).toBeVisible();

    // Gold count should be 3 (from seed polish)
    const goldCard = page.locator("text=Clientes Gold").locator("..").locator("p").last();
    await expect(goldCard).toContainText("3");

    // Table should show tier badges
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
  });

  test("CRM - tabs de Clientes, Lealtad, Promociones", async ({ page }) => {
    await page.goto("/crm");

    await expect(page.locator("button", { hasText: "Clientes" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Lealtad" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Promociones" })).toBeVisible();
  });

  test("Lealtad - muestra miembros del programa", async ({ page }) => {
    await page.goto("/lealtad");
    await expect(page.locator("h1")).toContainText("Lealtad");

    // Should show tabs
    await expect(page.locator("button", { hasText: "Miembros" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Recompensas" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Dashboard" })).toBeVisible();

    // Members table should have data
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
  });
});

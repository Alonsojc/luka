import { test, expect } from "./fixtures";

test.describe("CRM y Lealtad", () => {
  test("CRM - muestra clientes con tiers variados", async ({ page }) => {
    await page.goto("/crm");
    await expect(page.locator("h1")).toContainText("CRM", { timeout: 15000 });

    // Should show KPI cards
    await expect(page.locator("text=Total Clientes").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Clientes Gold").first()).toBeVisible({ timeout: 10000 });

    // Gold count should be 3 (from seed polish)
    const goldCard = page.locator("text=Clientes Gold").first().locator("..").locator("p").last();
    await expect(goldCard).toContainText("3");

    // Table should show tier badges
    await expect(page.locator("table").first()).toBeVisible({ timeout: 10000 });
  });

  test("CRM - tabs de Clientes, Lealtad, Promociones", async ({ page }) => {
    await page.goto("/crm");

    await expect(page.locator("button", { hasText: "Clientes" }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button", { hasText: "Lealtad" }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button", { hasText: "Promociones" }).first()).toBeVisible({ timeout: 10000 });
  });

  test("Lealtad - muestra miembros del programa", async ({ page }) => {
    await page.goto("/lealtad");
    await expect(page.locator("h1")).toContainText("Lealtad", { timeout: 15000 });

    // Should show tabs
    await expect(page.locator("button", { hasText: "Miembros" }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button", { hasText: "Recompensas" }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button", { hasText: "Dashboard" }).first()).toBeVisible({ timeout: 10000 });

    // Members table should have data
    await expect(page.locator("table").first()).toBeVisible({ timeout: 10000 });
  });
});

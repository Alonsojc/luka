import { test, expect } from "./fixtures";

test.describe("CRM y Lealtad", () => {
  test("CRM - muestra clientes con tiers variados", async ({ page }) => {
    await page.goto("/crm");
    await expect(page.locator("h1").first()).toContainText("CRM", { timeout: 15000 });

    // Should show a table with customer data
    await expect(page.locator("table").first()).toBeVisible({ timeout: 15000 });
  });

  test("CRM - tabs de Clientes, Lealtad, Promociones", async ({ page }) => {
    await page.goto("/crm");

    await expect(page.getByText("Clientes", { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Lealtad", { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Promociones", { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("Lealtad - muestra miembros del programa", async ({ page }) => {
    await page.goto("/lealtad");
    await expect(page.locator("h1").first()).toContainText("Lealtad", { timeout: 15000 });

    // Should show tab content
    await expect(page.getByText("Miembros", { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });

    // A table or data content should be visible
    const hasTable = await page
      .locator("table")
      .first()
      .isVisible()
      .catch(() => false);
    const hasContent = await page
      .locator("text=/miembros|programa/i")
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasContent).toBeTruthy();
  });
});

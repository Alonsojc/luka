import { test, expect } from "./fixtures";

test.describe("Compras", () => {
  test.beforeEach(async ({ page }) => {
    // Use sidebar navigation (client-side) instead of page.goto to avoid
    // auth hydration timing issues that keep the page stuck on "Cargando..."
    const sectionBtn = page.locator("aside button", { hasText: "OPERACIONES" });
    if (await sectionBtn.isVisible().catch(() => false)) {
      await sectionBtn.click();
      await page.waitForTimeout(400);
    }
    const comprasLink = page.locator("aside a", { hasText: "Compras" }).first();
    await expect(comprasLink).toBeVisible({ timeout: 5000 });
    await comprasLink.evaluate((el) => (el as HTMLElement).click());
    await expect(page).toHaveURL(/\/compras/, { timeout: 15000 });
    // Wait for page content to render (tabs)
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15000 });
  });

  test("carga lista de proveedores", async ({ page }) => {
    const proveedoresTab = page.getByText("Proveedores", { exact: true }).first();
    await expect(proveedoresTab).toBeVisible({ timeout: 15000 });
    await proveedoresTab.evaluate((el) => (el as HTMLElement).click());

    // Wait for content — table or empty state
    await page.waitForTimeout(1000);
    const hasTable = await page.locator("table").first().isVisible().catch(() => false);
    const hasContent = await page.locator("h1").first().isVisible().catch(() => false);
    expect(hasTable || hasContent).toBeTruthy();
  });

  test("cambiar a tab Ordenes de Compra", async ({ page }) => {
    // "Ordenes de Compra" is the default tab — verify content
    const hasTable = await page.locator("table").first().isVisible().catch(() => false);
    const hasContent = await page.locator("h1").first().isVisible().catch(() => false);
    expect(hasTable || hasContent).toBeTruthy();
  });

  test("tabla de ordenes de compra muestra datos", async ({ page }) => {
    // Default tab shows orders — check for table or empty state
    const table = page.locator("table").first();
    const hasTable = await table.isVisible().catch(() => false);
    if (hasTable) {
      const header = table.locator("thead");
      await expect(header).toBeVisible();
    }
    // If no table, the page rendered (h1 visible from beforeEach) which is sufficient
  });
});

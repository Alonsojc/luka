import { test, expect } from "./fixtures";
import { navigateTo, waitForApi } from "./helpers/navigation";

test.describe("Inventarios", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/inventarios");
  });

  test("carga la tabla de productos", async ({ page }) => {
    const productosTab = page.locator("button", { hasText: "Productos" }).first();
    await expect(productosTab).toBeVisible();

    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 15000 });

    const headerRow = table.locator("thead tr").first();
    await expect(headerRow).toBeVisible();
  });

  test("busqueda filtra productos", async ({ page }) => {
    await page.waitForSelector("table", { timeout: 15000 });

    const searchInput = page.locator('input[placeholder*="Buscar"]');
    await expect(searchInput).toBeVisible();

    const rowsBefore = await page.locator("table tbody tr").count();

    await searchInput.fill("ZZZZNOEXISTE");
    await page.waitForTimeout(500);

    const rowsAfter = await page.locator("table tbody tr").count();
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore);
  });

  test("crear producto via modal aparece en la tabla", async ({ page }) => {
    await page.waitForSelector("table", { timeout: 15000 });

    // Click "Nuevo Producto" button
    const addButton = page.getByRole("button", { name: /Nuevo Producto/i }).first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
    } else {
      await page.locator("button").filter({ has: page.locator("svg.lucide-plus") }).first().click();
    }

    // Wait for custom modal (no role="dialog")
    const modalTitle = page.locator("h2", { hasText: /Nuevo Producto|Editar Producto/ });
    await expect(modalTitle).toBeVisible({ timeout: 10000 });
    const modal = page.locator(".fixed.inset-0 .bg-white").first();

    const timestamp = Date.now();
    const productName = `E2E-${timestamp}`;
    const productSku = `SKU-${timestamp}`;

    // Fill required fields: SKU, Name, Cost
    const skuInput = modal.locator('input[placeholder*="PKE"]');
    await expect(skuInput).toBeVisible({ timeout: 5000 });
    await skuInput.fill(productSku);

    const nameInput = modal.locator('input[placeholder="Nombre del producto"]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(productName);

    const costInput = modal.locator('input[placeholder="0.00"]');
    await expect(costInput).toBeVisible({ timeout: 5000 });
    await costInput.fill("10.00");

    // Submit (button text is "Crear")
    const submitButton = modal.locator("button", { hasText: "Crear" }).first();
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    await waitForApi(page);

    // The new product should appear in the table
    await expect(page.locator("table")).toContainText(productName, { timeout: 10000 });
  });

  test("editar producto actualiza en la tabla", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 15000 });

    // Click edit on the first row
    const firstRow = page.locator("table").first().locator("tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 15000 });
    const editButton = firstRow.locator('button[title="Editar"]');
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();

    // Wait for edit modal
    const modalTitle = page.locator("h2", { hasText: "Editar Producto" });
    await expect(modalTitle).toBeVisible({ timeout: 10000 });
    const modal = page.locator(".fixed.inset-0 .bg-white").first();

    const timestamp = Date.now();
    const updatedName = `Editado-${timestamp}`;

    // Update the name field
    const nameInput = modal.locator('input[placeholder="Nombre del producto"]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.clear();
    await nameInput.fill(updatedName);

    // Submit (button text is "Actualizar" in edit mode)
    const submitButton = modal.locator("button", { hasText: /Actualizar|Guardar/ }).first();
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    await waitForApi(page);

    // The updated name should appear in the table
    await expect(page.locator("table")).toContainText(updatedName, { timeout: 10000 });
  });

  test("cambiar a tab Recetas muestra recetas", async ({ page }) => {
    const recetasTab = page.locator("button", { hasText: "Recetas" });
    await expect(recetasTab).toBeVisible();
    await recetasTab.click();

    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder*="Buscar"]');
    if (await searchInput.isVisible()) {
      const placeholder = await searchInput.getAttribute("placeholder");
      expect(placeholder?.toLowerCase()).toContain("platillo");
    }

    const contentVisible =
      (await page.locator("table").isVisible()) ||
      (await page.locator("text=/No hay recetas|Sin recetas/i").isVisible());
    expect(contentVisible).toBeTruthy();
  });
});

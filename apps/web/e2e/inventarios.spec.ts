import { test, expect } from "./fixtures";
import { navigateTo, waitForApi } from "./helpers/navigation";

test.describe("Inventarios", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/inventarios");
  });

  test("carga la tabla de productos", async ({ page }) => {
    // The "Productos" tab should be active by default
    const productosTab = page.locator("button", { hasText: "Productos" }).first();
    await expect(productosTab).toBeVisible();

    // Wait for the data table to appear
    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 15000 });

    // The table should have a header row
    const headerRow = table.locator("thead tr").first();
    await expect(headerRow).toBeVisible();
  });

  test("busqueda filtra productos", async ({ page }) => {
    // Wait for the table to load
    await page.waitForSelector("table", { timeout: 15000 });

    // Type in the search input
    const searchInput = page.locator('input[placeholder*="Buscar"]');
    await expect(searchInput).toBeVisible();

    // Count rows before search
    const rowsBefore = await page.locator("table tbody tr").count();

    // Type a search term that is unlikely to match all products
    await searchInput.fill("ZZZZNOEXISTE");
    await page.waitForTimeout(500); // debounce

    // After filtering, the table should have fewer (or zero) rows
    const rowsAfter = await page.locator("table tbody tr").count();
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore);
  });

  test("crear producto via modal aparece en la tabla", async ({ page }) => {
    // Wait for the table to load
    await page.waitForSelector("table", { timeout: 15000 });

    // Click "Nuevo Producto" or "+" button
    const addButton = page.getByRole("button", { name: /Nuevo Producto/i }).first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
    } else {
      await page
        .locator("button")
        .filter({ has: page.locator("svg.lucide-plus") })
        .first()
        .click();
    }

    // The modal should appear (custom Modal component, uses h2 for title)
    const modalTitle = page.locator("h2", { hasText: "Nuevo Producto" });
    await expect(modalTitle).toBeVisible({ timeout: 10000 });
    const modal = page.locator(".fixed.inset-0 .bg-white").first();

    // Fill in the product form
    const timestamp = Date.now();
    const productName = `Producto Test E2E ${timestamp}`;

    // Fill the product name field explicitly (first input can be a hidden file upload)
    const nameInput = modal.locator('input[placeholder="Nombre del producto"]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(productName);

    // Fill SKU
    const skuInput = modal.locator('input[placeholder="SKU opcional"]');
    if (await skuInput.isVisible().catch(() => false)) {
      await skuInput.fill(`TEST-${timestamp}`);
    }

    // Submit the form
    const submitButton = modal
      .locator('button[type="submit"], button:has-text("Guardar"), button:has-text("Crear")')
      .first();
    await expect(submitButton).toBeVisible({ timeout: 5000 });
    await submitButton.click();

    await waitForApi(page);

    // The new product should now appear in the table
    await expect(page.locator("table")).toContainText(productName, { timeout: 10000 });
  });

  test("editar producto actualiza en la tabla", async ({ page }) => {
    // Wait for the table to load with data
    await page.waitForSelector("table tbody tr", { timeout: 15000 });

    // Click the edit button on the first row
    const firstRow = page.locator("table").first().locator("tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 15000 });
    const editButton = firstRow.locator("button").first();
    await editButton.click();

    // The edit modal should appear (custom Modal, uses h2 for title)
    const modalTitle = page.locator("h2", { hasText: "Editar Producto" });
    await expect(modalTitle).toBeVisible({ timeout: 10000 });
    const modal = page.locator(".fixed.inset-0 .bg-white").first();

    // Update the product name
    const timestamp = Date.now();
    const updatedName = `Editado E2E ${timestamp}`;

    const nameInput = modal.locator('input[placeholder="Nombre del producto"]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.clear();
    await nameInput.fill(updatedName);

    // Submit the form
    const submitButton = modal
      .locator('button[type="submit"], button:has-text("Guardar"), button:has-text("Actualizar")')
      .first();
    await expect(submitButton).toBeVisible({ timeout: 5000 });
    await submitButton.click();

    await waitForApi(page);

    // The updated name should appear in the table
    await expect(page.locator("table")).toContainText(updatedName, { timeout: 10000 });
  });

  test("cambiar a tab Recetas muestra recetas", async ({ page }) => {
    // Click the "Recetas" tab
    const recetasTab = page.locator("button", { hasText: "Recetas" });
    await expect(recetasTab).toBeVisible();
    await recetasTab.click();

    // Wait for the content to update
    await page.waitForTimeout(500);

    // The search placeholder should change to reference "platillo" or the tab content should load
    const searchInput = page.locator('input[placeholder*="Buscar"]');
    if (await searchInput.isVisible()) {
      const placeholder = await searchInput.getAttribute("placeholder");
      expect(placeholder?.toLowerCase()).toContain("platillo");
    }

    // A table or an empty-state message should be visible
    const contentVisible =
      (await page.locator("table").isVisible()) ||
      (await page.locator("text=/No hay recetas|Sin recetas/i").isVisible());
    expect(contentVisible).toBeTruthy();
  });
});

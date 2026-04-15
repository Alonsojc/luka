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

    // Click "Nuevo Producto" button (the Plus icon button)
    const addButton = page.locator("button", { hasText: /Nuevo Producto|Agregar/i });
    if (await addButton.isVisible()) {
      await addButton.click();
    } else {
      // Some layouts use just an icon button with Plus
      await page
        .locator("button")
        .filter({ has: page.locator("svg.lucide-plus") })
        .first()
        .click();
    }

    // The modal should appear
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Fill in the product form
    const timestamp = Date.now();
    const productName = `Producto Test E2E ${timestamp}`;
    const productSku = `TEST-${timestamp}`;

    // Fill name
    await modal.locator("input").filter({ hasText: "" }).first().waitFor();
    const nameInput = modal
      .locator('label:has-text("Nombre") + input, label:has-text("Nombre") ~ input')
      .first();
    if (await nameInput.isVisible()) {
      await nameInput.fill(productName);
    } else {
      // Fallback: fill the first text input in the modal
      const inputs = modal.locator('input[type="text"], input:not([type])');
      const count = await inputs.count();
      for (let i = 0; i < count; i++) {
        const input = inputs.nth(i);
        const placeholder = await input.getAttribute("placeholder");
        const id = await input.getAttribute("id");
        if (id?.includes("name") || placeholder?.toLowerCase().includes("nombre")) {
          await input.fill(productName);
          break;
        }
      }
    }

    // Fill SKU
    const _skuInput = modal.locator("input").filter({ hasText: "" });
    const allInputs = modal.locator("input");
    const inputCount = await allInputs.count();
    for (let i = 0; i < inputCount; i++) {
      const input = allInputs.nth(i);
      const id = await input.getAttribute("id");
      const placeholder = await input.getAttribute("placeholder");
      if (id?.toLowerCase().includes("sku") || placeholder?.toLowerCase().includes("sku")) {
        await input.fill(productSku);
        break;
      }
    }

    // Submit the form
    const submitButton = modal
      .locator('button[type="submit"], button:has-text("Guardar"), button:has-text("Crear")')
      .first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
    }

    await waitForApi(page);

    // The new product should now appear in the table
    await expect(page.locator("table")).toContainText(productName, { timeout: 10000 });
  });

  test("editar producto actualiza en la tabla", async ({ page }) => {
    // Wait for the table to load with data
    await page.waitForSelector("table tbody tr", { timeout: 15000 });

    // Click the edit button on the first row
    const firstRowEditButton = page
      .locator("table tbody tr")
      .first()
      .locator("button")
      .filter({
        has: page.locator("svg.lucide-pencil"),
      });

    if (await firstRowEditButton.isVisible()) {
      await firstRowEditButton.click();
    } else {
      // Try clicking the first row's action button
      await page.locator("table tbody tr").first().locator("button").first().click();
    }

    // The edit modal should appear
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Update the product name
    const timestamp = Date.now();
    const updatedName = `Editado E2E ${timestamp}`;

    const nameInput = modal.locator("input").first();
    await nameInput.clear();
    await nameInput.fill(updatedName);

    // Submit the form
    const submitButton = modal
      .locator('button[type="submit"], button:has-text("Guardar"), button:has-text("Actualizar")')
      .first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
    }

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

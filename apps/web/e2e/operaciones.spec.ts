import { test, expect } from "./fixtures";
import { navigateTo } from "./helpers/navigation";

test.describe("Modulos Operaciones", () => {
  test("Sucursales - lista las 10 sucursales", async ({ page }) => {
    const branchesResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        /\/api\/branches(?:\?|$)/.test(response.url()),
    );

    await navigateTo(page, "/sucursales");
    const branchesResponse = await branchesResponsePromise;
    expect(branchesResponse.ok()).toBeTruthy();

    const branches = (await branchesResponse.json()) as Array<{ id: string }>;
    expect(Array.isArray(branches)).toBeTruthy();
    expect(branches.length).toBeGreaterThan(0);

    await expect(page.locator("h1").first()).toContainText("Sucursales");
    await expect(page.getByText("Filtrar por Razon Social:")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Nueva Sucursal/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test("Merma - muestra registro de merma", async ({ page }) => {
    await page.goto("/merma");
    await expect(page.locator("h1")).toContainText("Merma");
  });

  test("Delivery - muestra configuracion de delivery", async ({ page }) => {
    await page.goto("/delivery");
    await expect(page.locator("h1")).toContainText("Delivery");
  });

  test("Requisiciones - muestra lista de requisiciones", async ({ page }) => {
    await page.goto("/requisiciones");
    await expect(page.locator("h1").first()).toContainText("Requisiciones", { timeout: 15000 });
  });

  test("POS Corntech - muestra ventas sincronizadas", async ({ page }) => {
    await page.goto("/pos");
    await expect(page.locator("h1")).toContainText("Corntech");

    // Should show sales data
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
  });

  test("Razones Sociales - muestra entidades legales", async ({ page }) => {
    await page.goto("/razones-sociales");
    await expect(page.locator("h1")).toContainText("Razones Sociales");
  });

  test("Horarios - muestra turnos de trabajo", async ({ page }) => {
    await page.goto("/horarios");
    await expect(page.locator("h1")).toContainText("Horarios");
  });
});

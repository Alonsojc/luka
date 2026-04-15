import { test, expect } from "./fixtures";

test.describe("Modulos Operaciones", () => {
  test("Sucursales - lista las 10 sucursales", async ({ page }) => {
    await page.goto("/sucursales");
    await expect(page.locator("h1")).toContainText("Sucursales");

    // Should show branch table with data
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
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
    await expect(page.locator("h1")).toContainText("Requisiciones");
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

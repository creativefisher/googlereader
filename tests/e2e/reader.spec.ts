import { expect, test } from "@playwright/test";

test.describe("RSS Reader", () => {
  test("loads seeded articles and supports read/star flows", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Reader" })).toBeVisible();
    await page.getByRole("button", { name: "All items" }).click();
    await expect(page.getByText("Welcome to the RSS Reader").first()).toBeVisible({ timeout: 15_000 });

    const firstArticle = page.getByRole("button").filter({ hasText: "Welcome to the RSS Reader" }).first();
    await firstArticle.click();
    await expect(page.getByRole("heading", { level: 2, name: "Welcome to the RSS Reader" })).toBeVisible();

    await page.getByRole("main").getByRole("button", { name: "Star", exact: true }).click();
    await expect(page.getByRole("main").getByRole("button", { name: "Starred" })).toBeVisible();

    await page.getByRole("navigation").getByRole("button", { name: "Unread" }).click();
    await page.getByRole("navigation").getByRole("button", { name: "Starred" }).click();
    await expect(page.getByText("Welcome to the RSS Reader").first()).toBeVisible();
  });

  test("searches articles", async ({ page }) => {
    await page.goto("/");
    await page.locator("#reader-search").fill("Keyboard");
    await page.locator("#reader-search").press("Enter");
    await expect(page.getByText("Keyboard shortcuts").first()).toBeVisible({ timeout: 10_000 });
  });
});

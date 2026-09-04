// The same page served without Tauri is the player view (design.md §6):
// the party tier, no DM chrome, and it says so.

import { expect, test } from "@playwright/test";

const box = "tw-spotlight";
const page_ = "tw-entry-view";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__tablewright !== undefined);
});

test("the player view says whose it is and hides the DM chrome", async ({ page }) => {
  await expect(page.locator("#role")).toHaveText("Player view");
  await expect(page.locator("#role")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open map" })).toBeHidden();
  await expect(page).toHaveTitle(/Player view$/);
});

test("a player searches the world, never the bestiary", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  const tiles = page.locator(`${box} li`);
  await expect(tiles).toHaveCount(4);
  await expect(tiles.locator(".name")).toHaveText([
    "Fire Bolt",
    "Fireball",
    "Wall of Fire",
    "Flame Tongue",
  ]);
  await expect(page.getByRole("button", { name: /^Bestiary/ })).toHaveCount(0);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("goblin");
  await expect(tiles).toHaveCount(0);
});

test("a player's page has no Place on board", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire bolt");
  await page.keyboard.press("Enter");
  await expect(page.locator(`${page_} h1`)).toHaveText("Fire Bolt");
  await expect(page.locator(page_).getByRole("button", { name: "Place on board" })).toHaveCount(0);
  await expect(page.locator(page_).getByRole("button", { name: "Close" })).toBeVisible();
});

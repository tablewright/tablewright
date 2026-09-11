import { expect, test } from "@playwright/test";
import { box, entryPage, openTable, retype } from "./helpers.js";

// The player feature of docs/stories.md: the same page served without
// Tauri is the player view (design.md §6).

test("The player's view", async ({ page }) => {
  await openTable(page, "player");

  await test.step("The page served without Tauri is the player view: the party tier, no DM chrome, and it says so.", async () => {
    // The label that says whose view this is shows only on a player's page.
    await expect(page.locator("#role")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open map" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Campaigns" })).toBeHidden();
    await expect(page.locator("tw-tool-rail")).toBeHidden();
    // At the party tier the bestiary is the DM's: a monster's name finds nothing.
    await page.keyboard.press("Control+Space");
    await page.keyboard.type("goblin");
    await expect(page.locator(`${box} footer`)).toContainText("No matches");
    await expect(page.locator(`${box} li`)).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  await test.step("A player sees the scene's name and nothing more.", async () => {
    const tab = page.locator("tw-scenes");
    await expect(tab.getByText("The Rusty Flagon")).toBeVisible();
    await expect(tab.getByRole("button")).toHaveCount(0);
  });

  await test.step("A player's entry page has no Place on board.", async () => {
    await page.keyboard.press("Control+Space");
    await retype(page, "fire bolt");
    await page.keyboard.press("Enter");
    await expect(page.locator(`${entryPage} h1`)).toHaveText("Fire Bolt");
    await expect(
      page.locator(entryPage).getByRole("button", { name: "Place on board" })
    ).toHaveCount(0);
    await expect(page.locator(entryPage).getByRole("button", { name: "Close" })).toBeVisible();
    await expect(page.locator(`${box} li`)).toHaveCount(1);
  });
});

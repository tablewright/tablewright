import { expect, test } from "@playwright/test";
import { box, cellOnScreen, drag, entryPage, openTable, retype } from "./helpers.js";

// The player feature of docs/stories.md: the same page served without
// Tauri is the player view (design.md §6).

test("The player's view", async ({ page }) => {
  await openTable(page, "player");

  await test.step("The page served without Tauri is the player view: the party tier, no DM chrome, and it says so.", async () => {
    // The label that says whose view this is shows only on a player's page.
    await expect(page.locator("#role")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open map" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Campaigns" })).toBeHidden();
    // At the party tier the bestiary is the DM's: a monster's name finds nothing.
    await page.keyboard.press("Control+Space");
    await page.keyboard.type("goblin");
    await expect(page.locator(`${box} footer`)).toContainText("No matches");
    await expect(page.locator(`${box} li`)).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  await test.step("A player's rail draws freely, moves tokens and measures, and keeps none of the DM's other pens, undo or history.", async () => {
    const tools = page.locator("tw-tool-rail");
    await expect(tools.getByRole("button", { name: "Move" })).toBeVisible();
    await expect(tools.getByRole("button", { name: "Ruler" })).toBeVisible();
    // The notes and the jokes are the table's; the walls are the DM's.
    await expect(tools.getByRole("button", { name: "Free ink" })).toBeVisible();
    for (const name of ["Ground", "Wall", "Height", "Undo", "History", "Topology"]) {
      await expect(tools.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
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

  await test.step("A player measures with the R key.", async () => {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator(entryPage)).not.toHaveAttribute("open", "");
    await page.keyboard.press("r");
    await expect(page.locator("#board")).toHaveAttribute("data-tool", "ruler");
    // Clear of the palette the column opens beside the rail.
    await drag(
      page,
      await cellOnScreen(page, { col: 8, row: 2 }),
      await cellOnScreen(page, { col: 11, row: 6 })
    );
    const found = await page.evaluate(() => {
      const measured = window.__tablewright?.measurement();
      return measured === undefined
        ? undefined
        : { distance: measured.distance, cost: measured.route?.cost };
    });
    expect(found).toEqual({ distance: 20, cost: 20 });
  });
});

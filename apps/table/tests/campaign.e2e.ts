import { expect, test } from "@playwright/test";
import { drag, edgeCount, edgeOnScreen, openTable, tokenCount } from "./helpers.js";

// The campaign feature of docs/stories.md: the intro, and the scenes a
// campaign holds.

test("A DM sets up a campaign", async ({ page }) => {
  await openTable(page);
  const intro = page.locator("tw-campaigns");
  const tab = page.locator("tw-scenes");
  const leave = page.getByRole("button", { name: "Campaigns" });
  // A campaign's line in the intro: the one with its Open button.
  const listed = (name: string) =>
    intro.getByRole("listitem").filter({ has: page.getByRole("button", { name: `Open ${name}` }) });

  await test.step("The first run makes the example campaign: the tavern, with the mansion and the hill as scenes.", async () => {
    await expect(page).toHaveTitle(/The Rusty Flagon/);
    await tab.getByRole("button", { name: "The Rusty Flagon" }).click();
    await expect(tab.getByRole("menuitem", { name: "Halloway House", exact: true })).toBeVisible();
    await expect(tab.getByRole("menuitem", { name: "Terrace Hill", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  await test.step("The intro lists every campaign the app knows, with its system and where it lives.", async () => {
    await expect(intro).toBeHidden();
    await leave.click();
    await expect(intro).toBeVisible();
    await expect(intro.getByRole("listitem")).toHaveCount(1);
    const flagon = listed("The Rusty Flagon");
    await expect(flagon).toContainText("5e");
    await expect(flagon).toContainText("2024");
    await expect(flagon).toContainText("Documents/Tablewright/campaigns/the-rusty-flagon");
    await expect.poll(() => tokenCount(page)).toBe(0);
  });

  await test.step("A new campaign goes under the Tablewright home and opens on a tavern of its own.", async () => {
    await intro.getByLabel("New campaign name").fill("Winter's Reach");
    await intro.getByRole("button", { name: "Create", exact: true }).click();
    await expect(intro).toBeHidden();
    await expect.poll(() => tokenCount(page)).toBe(3);
    await tab.getByRole("button", { name: "The Rusty Flagon" }).click();
    await expect(tab.getByRole("menuitem", { name: "Halloway House", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await leave.click();
    await expect(listed("Winter's Reach")).toContainText(
      "Documents/Tablewright/campaigns/winter-s-reach"
    );
  });

  await test.step("Leaving a campaign returns to the intro, and the window's title says which campaign is open.", async () => {
    await expect(intro).toBeVisible();
    await expect(page).not.toHaveTitle(/Winter's Reach|The Rusty Flagon/);
    await intro.getByRole("button", { name: "Open Winter's Reach" }).click();
    await expect(intro).toBeHidden();
    await expect(page).toHaveTitle(/Winter's Reach/);
    await leave.click();
    await intro.getByRole("button", { name: "Open The Rusty Flagon" }).click();
    await expect(page).toHaveTitle(/The Rusty Flagon/);
    await expect.poll(() => tokenCount(page)).toBe(3);
  });
});

test("A DM sets up scenes", async ({ page }) => {
  await openTable(page);
  const tab = page.locator("tw-scenes");
  const tools = page.locator("tw-tool-rail");
  const heights = () => page.evaluate(() => window.__tablewright?.heights());
  const doorState = () =>
    page.evaluate(() => {
      const data = window.__tablewright?.topology().edges.get("south:15:6");
      return data?.kind === "threshold" ? data.state : undefined;
    });

  await test.step("A new scene is blank, or a reference drawing.", async () => {
    await tab.getByRole("button", { name: "The Rusty Flagon" }).click();
    await tab.getByLabel("New scene name").fill("Cellar");
    await tab.getByRole("button", { name: "Add", exact: true }).click();
    await expect(tab.getByRole("button", { name: "Cellar" })).toBeVisible();
    await expect.poll(() => tokenCount(page)).toBe(0);
    expect(await edgeCount(page)).toBe(0);
    await tab.getByRole("button", { name: "Cellar" }).click();
    await tab.getByRole("menuitem", { name: "Add Halloway House" }).click();
    await expect.poll(() => edgeCount(page)).toBe(110);
    await expect(tab.getByRole("button", { name: "Halloway House" })).toBeVisible();
  });

  await test.step("The scene tab switches scenes.", async () => {
    await tab.getByRole("button", { name: "Halloway House" }).click();
    await tab.getByRole("menuitem", { name: "The Rusty Flagon" }).click();
    await expect.poll(() => edgeCount(page)).toBe(0);
    await expect.poll(() => tokenCount(page)).toBe(3);
    await tab.getByRole("button", { name: "The Rusty Flagon" }).click();
    // The reference just added is the second Halloway House; the example's own is first.
    await tab.getByRole("menuitem", { name: "Halloway House", exact: true }).nth(1).click();
    await expect.poll(() => edgeCount(page)).toBe(110);
  });

  await test.step("A scene remembers its strokes, its display, and the state play left its thresholds in.", async () => {
    await tools.getByRole("button", { name: "Wall" }).click();
    await tools.getByRole("button", { name: "Line" }).click();
    await drag(
      page,
      await edgeOnScreen(page, { col: 9, row: 3 }, { col: 10, row: 4 }),
      await edgeOnScreen(page, { col: 9, row: 7 }, { col: 10, row: 8 })
    );
    await expect.poll(() => edgeCount(page)).toBe(114);
    await tools.getByRole("button", { name: "Height" }).click();
    await tools.getByRole("button", { name: "Marked" }).click();
    await expect.poll(async () => (await heights())?.mode).toBe("marked");
    await tools.getByRole("button", { name: "Move" }).click();
    const door = await edgeOnScreen(page, { col: 15, row: 6 }, { col: 15, row: 7 });
    await page.mouse.click(door.x, door.y);
    await expect.poll(doorState).toBe("open");
    await tab.getByRole("button", { name: "Halloway House" }).click();
    await tab.getByRole("menuitem", { name: "The Rusty Flagon" }).click();
    await expect.poll(() => edgeCount(page)).toBe(0);
    await tab.getByRole("button", { name: "The Rusty Flagon" }).click();
    await tab.getByRole("menuitem", { name: "Halloway House", exact: true }).nth(1).click();
    await expect.poll(() => edgeCount(page)).toBe(114);
    expect((await heights())?.mode).toBe("marked");
    expect(await doorState()).toBe("open");
  });
});

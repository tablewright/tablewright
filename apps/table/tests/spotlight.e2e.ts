import { expect, test } from "@playwright/test";

// The panel runs against the dev fixture searcher here: no Tauri, no core.
// What is under test is the panel itself: opening, typing, grouping,
// keyboard driving, selection, tabs, sharing, and the latency readout.

const box = "tw-spotlight";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__tablewright !== undefined);
});

test("Ctrl+Space opens the box focused and Escape closes it", async ({ page }) => {
  await expect(page.locator(box)).not.toHaveAttribute("open", "");
  await page.keyboard.press("Control+Space");
  await expect(page.locator(box)).toHaveAttribute("open", "");
  await expect(page.locator(`${box} input`)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(box)).not.toHaveAttribute("open", "");
});

test("the Search button opens it too", async ({ page }) => {
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.locator(box)).toHaveAttribute("open", "");
});

test("tiles arrive grouped by category as you type, and the readout reports timing", async ({
  page,
}) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  const tiles = page.locator(`${box} li`);
  await expect(tiles).toHaveCount(5);
  await expect(page.locator(`${box} .group > span:first-child`)).toHaveText([
    "Spells",
    "Bestiary",
    "Items",
  ]);
  await expect(tiles.first().locator(".name")).toHaveText("Fire Bolt");
  await expect(tiles.first().locator(".ring")).toHaveText("C");
  await expect(tiles.nth(3).locator(".badge")).toHaveText("CR 5");
  await expect(tiles.nth(4).locator(".badge")).toHaveText("Rare");
  await expect(page.locator(`${box} footer`)).toContainText(
    /5 hits of 7 · core [\d.]+ ms · to paint \d+ ms/
  );
  await page.keyboard.type(" bolt");
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first().locator(".name")).toHaveText("Fire Bolt");
});

test("arrows move the selection with wrap-around and Enter selects", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  const tiles = page.locator(`${box} li`);
  await expect(tiles.first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(tiles.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(tiles.nth(4)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page.locator(box)).not.toHaveAttribute("open", "");
  await expect(page.locator(".notice[data-level='info']")).toContainText("Flame Tongue");
});

test("category tabs narrow the tiles, and an unmatched query says so", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  const tiles = page.locator(`${box} li`);
  await page.getByRole("button", { name: "Bestiary 1" }).click();
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first().locator(".name")).toHaveText("Fire Elemental");
  await page.getByRole("button", { name: "All 5" }).click();
  await expect(tiles).toHaveCount(5);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("zzz");
  await expect(tiles).toHaveCount(0);
  await expect(page.locator(`${box} footer`)).toContainText("No matches");
});

test("a type filter in the query lists only that kind", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("type:monster");
  const tiles = page.locator(`${box} li`);
  await expect(tiles).toHaveCount(2);
  await expect(page.locator(`${box} .group > span:first-child`)).toHaveText(["Bestiary"]);
});

test("the share button puts a dismissable card on the table", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  await page.getByRole("button", { name: "Share Fire Bolt with the table" }).click();
  const card = page.locator(".shares tw-share-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Fire Bolt");
  await expect(card).toContainText("Shared by you");
  await card.getByRole("button", { name: "Dismiss" }).click();
  await expect(card).toHaveCount(0);
});

test("dragging a tile out of the box shares it", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit's synthetic drag does not fire HTML drag events");
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  await page.dragAndDrop(`${box} li >> nth=1`, `${box} .scrim`, {
    targetPosition: { x: 900, y: 400 },
  });
  const card = page.locator(".shares tw-share-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Fireball");
});

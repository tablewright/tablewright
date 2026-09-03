import { expect, test } from "@playwright/test";

// The panel runs against the dev fixture here: no Tauri, no core. Under
// test are the panel, the share queue, the entry page they open, and how
// the three layer.

const box = "tw-spotlight";
const card = "tw-share-tray tw-share-card";
const page_ = "tw-entry-view";

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

test("arrows move the selection with wrap-around, and Enter opens the entry without closing the box", async ({
  page,
}) => {
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
  await expect(page.locator(page_)).toHaveAttribute("open", "");
  await expect(page.locator(`${page_} h1`)).toHaveText("Flame Tongue");
  await expect(page.locator(`${page_} article`)).toContainText("flames to sheathe its blade");
  await expect(page.locator(box)).toHaveAttribute("open", "");
  await expect(page.locator(`${box} input`)).toBeFocused();
  // A second choice turns the page without closing anything.
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(page.locator(`${page_} h1`)).toHaveText("Fire Bolt");
  await expect(page.locator(box)).toHaveAttribute("open", "");
});

test("Tab walks tile, share, tile, share, and lands on the selected tile first", async ({
  page,
}) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  const tiles = page.locator(`${box} li`);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(tiles.nth(1)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Share Fireball with the table" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(tiles.nth(2)).toBeFocused();
  await expect(tiles.nth(2)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page.locator(`${page_} h1`)).toHaveText("Wall of Fire");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Share Wall of Fire with the table" })
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("ArrowUp");
  await expect(tiles.nth(1)).toBeFocused();
  // Share, then three more tiles with their Shares, then the category tabs.
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(page.getByRole("button", { name: "All 5" })).toBeFocused();
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

test("shares queue one card at a time, and a card opens its entry", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  await page.getByRole("button", { name: "Share Fire Bolt with the table" }).click();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("button", { name: "Share Fireball with the table" }).click();
  const shown = page.locator(card);
  await expect(shown).toHaveCount(1);
  await expect(shown).toContainText("Fire Bolt");
  await expect(shown).toContainText("Shared by you · 1 more waits");
  await shown.getByRole("button", { name: "Dismiss" }).click();
  await expect(shown).toHaveCount(1);
  await expect(shown).toContainText("Fireball");
  await expect(shown).not.toContainText("waits");
  await shown.getByRole("button", { name: "Open Fireball" }).click();
  await expect(page.locator(page_)).toHaveAttribute("open", "");
  await expect(page.locator(`${page_} h1`)).toHaveText("Fireball");
  // Opening is also a dismissal: the reader has the entry now.
  await expect(shown).toHaveCount(0);
});

test("sharing the entry already open as a page raises no card", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fireball");
  await page.keyboard.press("Enter");
  await expect(page.locator(`${page_} h1`)).toHaveText("Fireball");
  await page.getByRole("button", { name: "Share Fireball with the table" }).click();
  await expect(page.locator(card)).toHaveCount(0);
});

test("Escape peels the layers back: card, then box, then page", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  await page.keyboard.press("Enter");
  await expect(page.locator(page_)).toHaveAttribute("open", "");
  await page.keyboard.press("ArrowDown");
  await page.getByRole("button", { name: "Share Fireball with the table" }).click();
  await expect(page.locator(card)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(card)).toHaveCount(0);
  await expect(page.locator(box)).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(page.locator(box)).not.toHaveAttribute("open", "");
  await expect(page.locator(page_)).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(page.locator(page_)).not.toHaveAttribute("open", "");
});

test("dragging a tile out of the box shares it", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit's synthetic drag does not fire HTML drag events");
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  await page.dragAndDrop(`${box} li >> nth=1`, `${box} .scrim`, {
    targetPosition: { x: 900, y: 400 },
  });
  const shown = page.locator(card);
  await expect(shown).toHaveCount(1);
  await expect(shown).toContainText("Fireball");
});

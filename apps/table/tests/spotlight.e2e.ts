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
  // Empty, the box is just the search bar; typing grows it into the panel.
  await expect(page.locator(`${box} .box`)).toHaveClass(/idle/);
  await page.keyboard.type("fire");
  await expect(page.locator(`${box} .box`)).not.toHaveClass(/idle/);
  await page.keyboard.press("Escape");
  await expect(page.locator(box)).not.toHaveAttribute("open", "");
});

test("words that narrow the answer to one category light its tab", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("cr<=4");
  const tiles = page.locator(`${box} li`);
  await expect(tiles).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Bestiary 1" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator("tw-filter-tray")).toHaveAttribute("compact", "");
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
  // A second choice turns the page without closing anything; Down wraps
  // from the last tile to the first.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator(`${page_} h1`)).toHaveText("Fire Bolt");
  await expect(page.locator(box)).toHaveAttribute("open", "");
});

test("the page shows the body as the core rendered it: a table is a table", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("longsword");
  await page.keyboard.press("Enter");
  await expect(page.locator(`${page_} h1`)).toHaveText("Longsword");
  const body = page.locator(`${page_} article .body`);
  await expect(body.locator("p").first()).toHaveText("A longsword.");
  await expect(body.locator("table th")).toHaveText(["Cost", "Weight"]);
  await expect(body.locator("table td")).toHaveText(["15 gp", "3 lb"]);
  // Bold reached the page as markup, not as the asterisks that wrote it.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire bolt");
  await page.keyboard.press("Enter");
  await expect(page.locator(`${page_} article strong`)).toHaveText("Cantrip Upgrade.");
  await expect(page.locator(`${page_} article`)).not.toContainText("**");
});

test("the page shows an entry's parts under their headings", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("goblin");
  await page.keyboard.press("Enter");
  await expect(page.locator(`${page_} h1`)).toHaveText("Goblin Warrior");
  const parts = page.locator(`${page_} article .parts`);
  await expect(parts.locator("h2")).toHaveText(["Traits", "Actions"]);
  await expect(parts.nth(1).locator("h3")).toHaveText(["Scimitar", "Shortbow"]);
  await expect(parts.nth(1).locator(".part").first().locator("em").first()).toHaveText(
    "Melee Attack Roll:"
  );
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

test("a click outside the page closes it, once the box is shut", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  await page.keyboard.press("Enter");
  await expect(page.locator(page_)).toHaveAttribute("open", "");
  // The scrim takes the first click and closes the box; the page stays.
  await page.mouse.click(600, 500);
  await expect(page.locator(box)).not.toHaveAttribute("open", "");
  await expect(page.locator(page_)).toHaveAttribute("open", "");
  // A click on the page itself is not outside.
  await page.locator(page_).click({ position: { x: 40, y: 200 } });
  await expect(page.locator(page_)).toHaveAttribute("open", "");
  await page.mouse.click(600, 500);
  await expect(page.locator(page_)).not.toHaveAttribute("open", "");
});

test("a creature's page can place it on the board as a token", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("goblin");
  await page.keyboard.press("Enter");
  await expect(page.locator(`${page_} h1`)).toHaveText("Goblin Warrior");
  await page.locator(page_).getByRole("button", { name: "Place on board" }).click();
  await expect.poll(() => page.evaluate(() => window.__tablewright?.tokens().length)).toBe(4);
  const placed = await page.evaluate(() => window.__tablewright?.tokens().at(-1));
  expect(placed?.label).toBe("GW");
  expect(placed?.id).toBe("tok-1");
  // A spell's page offers no such thing. The click left focus on the
  // page's button, so the search is retyped from the box.
  await page.locator(`${box} input`).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("fireball");
  await page.keyboard.press("Enter");
  await expect(page.locator(`${page_} h1`)).toHaveText("Fireball");
  await expect(page.locator(page_).getByRole("button", { name: "Place on board" })).toHaveCount(0);
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

test("the tray shows the category controls and narrows the tiles", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  const tiles = page.locator(`${box} li`);
  await expect(tiles).toHaveCount(5);
  await page.getByRole("button", { name: "Spells 3" }).click();
  await expect(tiles).toHaveCount(3);
  const tray = page.locator("tw-filter-tray");
  await expect(tray).toHaveCount(0);
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(tray).toBeVisible();
  const level = tray.getByRole("group", { name: "Level" });
  await expect(level).toBeVisible();
  await level.getByRole("button", { name: "3", exact: true }).click();
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first().locator(".name")).toHaveText("Fireball");
  await tray.getByRole("button", { name: "Clear" }).click();
  await expect(tiles).toHaveCount(3);
});

test("typed filters light the tab, open the tray, and stay underlined until the tray overrules them", async ({
  page,
}) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("type:spell level<=3");
  const tiles = page.locator(`${box} li`);
  await expect(tiles).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Spells 2" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  const tray = page.locator("tw-filter-tray");
  await expect(tray).toBeVisible();
  const level = tray.getByRole("group", { name: "Level" });
  await expect(level.locator("button[aria-pressed='true']")).toHaveCount(4);
  await expect(page.locator(`${box} .mask u`)).toHaveCount(2);
  // Folded: only the chosen cells show until the funnel unfolds the tray.
  await expect(tray).toHaveAttribute("compact", "");
  await expect(level.locator("button")).toHaveCount(4);
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(tray).not.toHaveAttribute("compact", "");
  await expect(level.locator("button")).toHaveCount(6);
  // A click toggles a cell: 4 joins the run the words chose, and the tray
  // now owns the level, so the typed bound is set aside.
  await level.getByRole("button", { name: "4", exact: true }).click();
  await expect(tiles).toHaveCount(3);
  await expect(page.locator(`${box} .mask .masked`)).toHaveText("level<=3");
  await expect(page.locator(`${box} .mask u`)).toHaveCount(1);
  await level.getByRole("button", { name: "4", exact: true }).click();
  await expect(tiles).toHaveCount(2);
  await level.getByRole("button", { name: "Cantrip", exact: true }).click();
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first().locator(".name")).toHaveText("Fireball");
});

test("a folded slider reads as a range", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("type:monster cr<=4");
  const tray = page.locator("tw-filter-tray");
  await expect(tray).toHaveAttribute("compact", "");
  await expect(tray.getByRole("group", { name: "Challenge rating" })).toHaveText(/up to 4/);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("type:monster cr>=2 cr<=4");
  await expect(tray.getByRole("group", { name: "Challenge rating" })).toHaveText(/2 – 4/);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("type:monster cr>=5");
  await expect(tray.getByRole("group", { name: "Challenge rating" })).toHaveText(/5\+/);
});

test("Home and End move the caret in the input", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  await page.keyboard.press("Home");
  await page.keyboard.type("z");
  await expect(page.locator(`${box} input`)).toHaveValue("zfire");
  await page.keyboard.press("End");
  await page.keyboard.type("q");
  await expect(page.locator(`${box} input`)).toHaveValue("zfireq");
});

test("closing the box lets the tray filters go", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  const tiles = page.locator(`${box} li`);
  await page.getByRole("button", { name: "Spells 3" }).click();
  await page.getByRole("button", { name: "Filters" }).click();
  const level = page.locator("tw-filter-tray").getByRole("group", { name: "Level" });
  await level.getByRole("button", { name: "3", exact: true }).click();
  await expect(tiles).toHaveCount(1);
  // Focus is on the rail: the first Escape returns to the input, the
  // second closes the box.
  await page.keyboard.press("Escape");
  await expect(page.locator(`${box} input`)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(box)).not.toHaveAttribute("open", "");
  await page.keyboard.press("Control+Space");
  await expect(tiles).toHaveCount(3);
  await expect(page.locator("tw-filter-tray")).toHaveCount(0);
});

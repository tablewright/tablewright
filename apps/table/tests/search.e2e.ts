import { expect, test } from "@playwright/test";
import { box, card, entryPage, openTable, retype, searchField } from "./helpers.js";

// The search feature of docs/stories.md, against the cast the seed wrote
// from the real compendium (src/dev/fixture.json).

test("A player searches the compendium", async ({ page }) => {
  await openTable(page, "player");
  const tiles = page.locator(`${box} li`);
  const groups = page.locator(`${box} .group > span:first-child`);

  await test.step("Ctrl+Space opens the box with the cursor in it; empty, it is just the bar, and typing grows it.", async () => {
    await expect(page.locator(box)).not.toHaveAttribute("open", "");
    await page.keyboard.press("Control+Space");
    await expect(page.locator(box)).toHaveAttribute("open", "");
    await expect(searchField(page)).toBeFocused();
    await expect(page.locator(`${box} .box`)).toHaveClass(/idle/);
    await page.keyboard.type("fire");
    await expect(page.locator(`${box} .box`)).not.toHaveClass(/idle/);
  });

  await test.step("A spell's name finds the spell, grouped under Spells, with its level on the tile.", async () => {
    await retype(page, "fire bolt");
    await expect(tiles).toHaveCount(1);
    await expect(groups).toHaveText(["Spells"]);
    await expect(tiles.first().locator(".name")).toHaveText("Fire Bolt");
    await expect(tiles.first().locator(".ring")).toHaveText("C");
  });

  await test.step("A condition's name finds it under Rules.", async () => {
    await retype(page, "blinded");
    await expect(tiles).toHaveCount(1);
    await expect(groups).toHaveText(["Rules"]);
    await expect(tiles.first().locator(".name")).toHaveText("Blinded");
  });

  await test.step("A school's name brings that school's spells together.", async () => {
    await retype(page, "school:evocation");
    await expect(tiles.locator(".name")).toHaveText(["Fire Bolt", "Fireball", "Wall of Fire"]);
  });

  await test.step("The bestiary is not there: a monster's name finds nothing.", async () => {
    await retype(page, "goblin");
    await expect(tiles).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Bestiary/ })).toHaveCount(0);
  });

  await test.step("The readout says how many hits there are, and how long the core and the paint took.", async () => {
    await retype(page, "fire");
    await expect(tiles).toHaveCount(4);
    await expect(page.locator(`${box} footer`)).toContainText(
      /4 hits of \d+, core [\d.]+ ms, to paint \d+ ms/
    );
  });
});

test("A DM searches the compendium", async ({ page }) => {
  await openTable(page);
  const tiles = page.locator(`${box} li`);
  const tray = page.locator("tw-filter-tray");

  await test.step("The same queries, with the bestiary among the answers.", async () => {
    await page.keyboard.press("Control+Space");
    await page.keyboard.type("fire");
    await expect(tiles).toHaveCount(5);
    await expect(page.locator(`${box} .group > span:first-child`)).toHaveText([
      "Spells",
      "Bestiary",
      "Items",
    ]);
    await expect(tiles.nth(3).locator(".name")).toHaveText("Fire Elemental");
    await expect(tiles.nth(3).locator(".badge")).toHaveText("CR 5");
    await retype(page, "goblin");
    await expect(tiles.locator(".name")).toHaveText(["Goblin Warrior"]);
  });

  await test.step("Small creatures below CR 4 come back as a list, each with its CR.", async () => {
    await retype(page, "type:monster size:small cr<4");
    await expect(tiles.locator(".name")).toHaveText(["Giant Rat", "Goblin Warrior"]);
    await expect(tiles.nth(0).locator(".badge")).toHaveText(/^CR /);
    await expect(tiles.nth(1).locator(".badge")).toHaveText(/^CR /);
  });

  await test.step("Words that narrow the answer to one category light its tab and fold the tray.", async () => {
    await retype(page, "cr<=4");
    await expect(tiles).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Bestiary 2" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(tray).toHaveAttribute("compact", "");
  });

  await test.step("A hit from another rule version wears its year.", async () => {
    await retype(page, "feeblemind");
    await expect(tiles.first().locator(".name")).toHaveText("Feeblemind");
    await expect(tiles.first().locator(".year")).toHaveText("2014");
    await retype(page, "fire bolt");
    await expect(tiles.first().locator(".name")).toHaveText("Fire Bolt");
    await expect(page.locator(`${box} li .year`)).toHaveCount(0);
  });

  await test.step("The Search button opens the box too.", async () => {
    await page.keyboard.press("Escape");
    await expect(page.locator(box)).not.toHaveAttribute("open", "");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator(box)).toHaveAttribute("open", "");
  });
});

test("Opening a result", async ({ page }) => {
  await openTable(page);
  const tiles = page.locator(`${box} li`);
  const heading = page.locator(`${entryPage} h1`);
  const article = page.locator(`${entryPage} article`);

  await test.step("Enter opens the chosen entry as a page, and the box stays open with the cursor in it.", async () => {
    await page.keyboard.press("Control+Space");
    await page.keyboard.type("fire");
    await expect(tiles.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page.locator(entryPage)).toHaveAttribute("open", "");
    await expect(heading).toHaveText("Fire Bolt");
    await expect(page.locator(box)).toHaveAttribute("open", "");
    await expect(searchField(page)).toBeFocused();
  });

  await test.step("The arrows choose a tile; a second Enter turns the page to it.", async () => {
    await page.keyboard.press("ArrowDown");
    await expect(tiles.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(heading).toHaveText("Fireball");
    await expect(page.locator(box)).toHaveAttribute("open", "");
  });

  await test.step("The page shows the body as the core rendered it: a table is a table, and bold is bold.", async () => {
    await retype(page, "staff of fire");
    await page.keyboard.press("Enter");
    await expect(heading).toHaveText("Staff of Fire");
    const body = article.locator(".body");
    await expect(body.locator("p").first()).toHaveText(
      "You have Resistance to Fire damage while you hold this staff."
    );
    await expect(body.locator("table th")).toHaveText(["Spell", "Charge Cost"]);
    await expect(body.locator("table td")).toHaveText([
      "Burning Hands",
      "1",
      "Fireball",
      "3",
      "Wall of Fire",
      "4",
    ]);
    await retype(page, "fire bolt");
    await page.keyboard.press("Enter");
    await expect(article.locator("strong")).toHaveText("Cantrip Upgrade.");
    await expect(article).not.toContainText("**");
  });

  await test.step("An entry's parts sit under their headings.", async () => {
    await retype(page, "goblin");
    await page.keyboard.press("Enter");
    await expect(heading).toHaveText("Goblin Warrior");
    const parts = article.locator(".parts");
    await expect(parts.locator("h2")).toHaveText(["Actions", "Bonus actions"]);
    await expect(parts.nth(0).locator("h3")).toHaveText(["Scimitar", "Shortbow"]);
    await expect(parts.nth(0).locator(".part").first()).toContainText("Melee Attack Roll: +4");
    await expect(parts.nth(1).locator("h3")).toHaveText(["Nimble Escape"]);
  });

  await test.step("The page's rail turns the thing to its other rule version.", async () => {
    await retype(page, "fireball");
    await expect(tiles).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(heading).toHaveText("Fireball");
    const rail = page.locator(`${entryPage} footer .versions button`);
    await expect(rail).toHaveText(["2014", "2024"]);
    await expect(rail.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(article).toContainText("flashes from you to a point");
    await rail.nth(0).click();
    await expect(rail.nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect(article).toContainText("from your pointing finger");
    await expect(page.locator(`${entryPage} footer code`)).toHaveText("5e-2014-srd:spell:fireball");

    await test.step("A thing one version lacks offers no turn there.", async () => {
      await retype(page, "feeblemind");
      await page.keyboard.press("Enter");
      await expect(heading).toHaveText("Feeblemind");
      await expect(rail.nth(0)).toHaveAttribute("aria-pressed", "true");
      await expect(rail.nth(1)).toBeDisabled();
    });
  });

  await test.step("A creature's page places it on the board as a token; a spell's page cannot.", async () => {
    await retype(page, "goblin");
    await page.keyboard.press("Enter");
    await expect(heading).toHaveText("Goblin Warrior");
    await page.locator(entryPage).getByRole("button", { name: "Place on board" }).click();
    await expect.poll(() => page.evaluate(() => window.__tablewright?.tokens().length)).toBe(4);
    const placed = await page.evaluate(() => window.__tablewright?.tokens().at(-1));
    expect(placed?.label).toBe("GW");
    await retype(page, "fireball");
    await page.keyboard.press("Enter");
    await expect(heading).toHaveText("Fireball");
    await expect(
      page.locator(entryPage).getByRole("button", { name: "Place on board" })
    ).toHaveCount(0);
  });
});

test("Sharing an entry", async ({ page, browserName }) => {
  await openTable(page);
  const shown = page.locator(card);
  const heading = page.locator(`${entryPage} h1`);

  await test.step("A share from a tile, or a tile dragged out of the box, raises a card on the table.", async () => {
    await page.keyboard.press("Control+Space");
    await page.keyboard.type("fire");
    await page.getByRole("button", { name: "Share Fire Bolt with the table" }).click();
    await expect(shown).toHaveCount(1);
    await expect(shown).toContainText("Fire Bolt");
    await shown.getByRole("button", { name: "Dismiss" }).click();
    await expect(shown).toHaveCount(0);
    // WebKit's synthetic drag fires no HTML drag events; the tile's button is its way.
    if (browserName !== "webkit") {
      await page.dragAndDrop(`${box} li >> nth=1`, `${box} .scrim`, {
        targetPosition: { x: 900, y: 400 },
      });
      await expect(shown).toHaveCount(1);
      await expect(shown).toContainText("Fireball");
      await shown.getByRole("button", { name: "Dismiss" }).click();
      await expect(shown).toHaveCount(0);
    }
  });

  await test.step("Cards queue one at a time; dismissing one lets the next up.", async () => {
    await page.getByRole("button", { name: "Share Fire Bolt with the table" }).click();
    await page.getByRole("button", { name: "Share Wall of Fire with the table" }).click();
    await expect(shown).toHaveCount(1);
    await expect(shown).toContainText("Fire Bolt");
    await expect(shown).toContainText("Shared by you — 1 more waits");
    await shown.getByRole("button", { name: "Dismiss" }).click();
    await expect(shown).toHaveCount(1);
    await expect(shown).toContainText("Wall of Fire");
    await expect(shown).not.toContainText("waits");
  });

  await test.step("Opening a card's entry dismisses the card: the reader has it now.", async () => {
    await shown.getByRole("button", { name: "Open Wall of Fire" }).click();
    await expect(page.locator(entryPage)).toHaveAttribute("open", "");
    await expect(heading).toHaveText("Wall of Fire");
    await expect(shown).toHaveCount(0);
  });

  await test.step("Sharing the entry already open as a page raises no card.", async () => {
    await page.getByRole("button", { name: "Share Wall of Fire with the table" }).click();
    await expect(shown).toHaveCount(0);
  });
});

test("Filtering the search", async ({ page }) => {
  await openTable(page);
  const tiles = page.locator(`${box} li`);
  const tray = page.locator("tw-filter-tray");
  const level = () => tray.getByRole("group", { name: "Level" });
  const reopen = async (): Promise<void> => {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator(box)).not.toHaveAttribute("open", "");
    await page.keyboard.press("Control+Space");
    await expect(page.locator(box)).toHaveAttribute("open", "");
  };

  await test.step("A type filter typed into the query lists only that kind.", async () => {
    await page.keyboard.press("Control+Space");
    await page.keyboard.type("type:monster");
    await expect(tiles).toHaveCount(3);
    await expect(page.locator(`${box} .group > span:first-child`)).toHaveText(["Bestiary"]);
  });

  await test.step("A category tab narrows the tiles; an unmatched query says so.", async () => {
    await retype(page, "fire");
    await page.getByRole("button", { name: "Bestiary 1" }).click();
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first().locator(".name")).toHaveText("Fire Elemental");
    await page.getByRole("button", { name: "All 5" }).click();
    await expect(tiles).toHaveCount(5);
    await retype(page, "zzz");
    await expect(tiles).toHaveCount(0);
    await expect(page.locator(`${box} footer`)).toContainText("No matches");
  });

  await test.step("The tray shows the category's controls, and a control narrows the tiles.", async () => {
    await retype(page, "fire");
    await page.getByRole("button", { name: "Spells 3" }).click();
    await expect(tiles).toHaveCount(3);
    await expect(tray).toHaveCount(0);
    await page.getByRole("button", { name: "Filters" }).click();
    await expect(tray).toBeVisible();
    await level().getByRole("button", { name: "3", exact: true }).click();
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first().locator(".name")).toHaveText("Fireball");
    await tray.getByRole("button", { name: "Clear" }).click();
    await expect(tiles).toHaveCount(3);
  });

  await test.step("Typed filters light the tray, folded; the tray unfolded overrules them, and the words they came from are set aside.", async () => {
    await reopen();
    await retype(page, "type:spell level<=3");
    await expect(tiles).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Spells 2" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(tray).toBeVisible();
    await expect(tray).toHaveAttribute("compact", "");
    await expect(level().locator("button[aria-pressed='true']")).toHaveCount(4);
    await expect(level().locator("button")).toHaveCount(4);
    await expect(page.locator(`${box} .mask u`)).toHaveCount(2);
    await page.getByRole("button", { name: "Filters" }).click();
    await expect(tray).not.toHaveAttribute("compact", "");
    await expect(level().locator("button")).toHaveCount(10);
    await level().getByRole("button", { name: "4", exact: true }).click();
    await expect(tiles).toHaveCount(3);
    await expect(page.locator(`${box} .mask .masked`)).toHaveText("level<=3");
    await expect(page.locator(`${box} .mask u`)).toHaveCount(1);
    await level().getByRole("button", { name: "4", exact: true }).click();
    await expect(tiles).toHaveCount(2);
    await level().getByRole("button", { name: "Cantrip", exact: true }).click();
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first().locator(".name")).toHaveText("Fireball");
  });

  await test.step("A folded slider reads as a range.", async () => {
    await reopen();
    await retype(page, "type:monster cr<=4");
    await expect(tray).toHaveAttribute("compact", "");
    const rating = tray.getByRole("group", { name: "Challenge rating" });
    await expect(rating).toHaveText(/up to 4/);
    await retype(page, "type:monster cr>=2 cr<=4");
    await expect(rating).toHaveText(/2 – 4/);
    await retype(page, "type:monster cr>=5");
    await expect(rating).toHaveText(/5\+/);
  });

  await test.step("Closing the box lets the tray's filters go.", async () => {
    await reopen();
    await retype(page, "fire");
    await page.getByRole("button", { name: "Spells 3" }).click();
    await page.getByRole("button", { name: "Filters" }).click();
    await level().getByRole("button", { name: "3", exact: true }).click();
    await expect(tiles).toHaveCount(1);
    // Focus is on the rail: the first Escape returns to the input, the second closes the box.
    await page.keyboard.press("Escape");
    await expect(searchField(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(box)).not.toHaveAttribute("open", "");
    await page.keyboard.press("Control+Space");
    await expect(tiles).toHaveCount(3);
    await expect(tray).toHaveCount(0);
  });
});

test("Leaving the search", async ({ page }) => {
  await openTable(page);
  const shown = page.locator(card);

  await test.step("Escape peels the layers back one at a time: the card, then the box, then the page.", async () => {
    await page.keyboard.press("Control+Space");
    await page.keyboard.type("fire");
    await page.keyboard.press("Enter");
    await expect(page.locator(entryPage)).toHaveAttribute("open", "");
    await page.keyboard.press("ArrowDown");
    await page.getByRole("button", { name: "Share Fireball with the table" }).click();
    await expect(shown).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(shown).toHaveCount(0);
    await expect(page.locator(box)).toHaveAttribute("open", "");
    await page.keyboard.press("Escape");
    await expect(page.locator(box)).not.toHaveAttribute("open", "");
    await expect(page.locator(entryPage)).toHaveAttribute("open", "");
    await page.keyboard.press("Escape");
    await expect(page.locator(entryPage)).not.toHaveAttribute("open", "");
  });

  await test.step("A click outside the page closes it, once the box is shut.", async () => {
    await page.keyboard.press("Control+Space");
    await retype(page, "fire");
    await page.keyboard.press("Enter");
    await expect(page.locator(entryPage)).toHaveAttribute("open", "");
    // The scrim takes the first click and closes the box; the page stays.
    await page.mouse.click(600, 500);
    await expect(page.locator(box)).not.toHaveAttribute("open", "");
    await expect(page.locator(entryPage)).toHaveAttribute("open", "");
    // A click on the page itself is not outside.
    await page.locator(entryPage).click({ position: { x: 40, y: 200 } });
    await expect(page.locator(entryPage)).toHaveAttribute("open", "");
    await page.mouse.click(600, 500);
    await expect(page.locator(entryPage)).not.toHaveAttribute("open", "");
  });
});

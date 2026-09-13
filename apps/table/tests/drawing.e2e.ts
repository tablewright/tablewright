import { expect, test } from "@playwright/test";
import {
  cellOnScreen,
  cellsOf,
  drag,
  edgeCount,
  edgeOnScreen,
  openTable,
  routeCost,
  tokenById,
  tokenOnScreen,
} from "./helpers.js";

// The drawing feature of docs/stories.md, on the tavern: every ink, what
// the record keeps of it, and the history that holds it all.

const looksOf = (page: Parameters<typeof edgeCount>[0]) =>
  page.evaluate(() =>
    [...(window.__tablewright?.topology().edges.values() ?? [])].map((edge) => edge.look)
  );

const tallsOf = (page: Parameters<typeof edgeCount>[0]) =>
  page.evaluate(() =>
    [...(window.__tablewright?.topology().edges.values() ?? [])].map((edge) => edge.tall)
  );

test("A DM draws ground", async ({ page }) => {
  await openTable(page);
  const tools = page.locator("tw-tool-rail");

  await test.step("A rect, a free shape, or a brush; the brush converts every cell it touches.", async () => {
    await tools.getByRole("button", { name: "Ground" }).click();
    await tools.getByRole("button", { name: "Rect" }).click();
    await tools.getByRole("button", { name: "Difficult" }).click();
    await drag(
      page,
      await cellOnScreen(page, { col: 6, row: 5 }),
      await cellOnScreen(page, { col: 8, row: 7 })
    );
    await expect.poll(() => cellsOf(page, 2)).toBe(9);
    await tools.getByRole("button", { name: "Free shape" }).click();
    await tools.getByRole("button", { name: "Void" }).click();
    await drag(
      page,
      await cellOnScreen(page, { col: 10, row: 9 }),
      await cellOnScreen(page, { col: 14, row: 9 }),
      await cellOnScreen(page, { col: 12, row: 12 })
    );
    await expect.poll(() => cellsOf(page, 0)).toBeGreaterThan(0);
    await tools.getByRole("button", { name: "Brush" }).click();
    await tools.getByRole("button", { name: "Air" }).click();
    await drag(
      page,
      await cellOnScreen(page, { col: 10, row: 5 }),
      await cellOnScreen(page, { col: 13, row: 5 })
    );
    await expect.poll(() => cellsOf(page, 3)).toBeGreaterThanOrEqual(4);
  });

  await test.step("A state: ground, difficult, air, or void.", async () => {
    const states = tools.getByRole("group", { name: "Ground state" });
    await expect(states.getByRole("button")).toHaveCount(4);
    for (const state of ["Ground", "Difficult", "Air", "Void"]) {
      await expect(states.getByRole("button", { name: state, exact: true })).toBeVisible();
    }
    await expect(states.getByRole("button", { name: "Air" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  await test.step("As data alone, or as data and texture: a textured floor is painted, difficult ground hatched, air a hole.", async () => {
    const textured = () =>
      page.evaluate(
        () => window.__tablewright?.topology().texture.filter((flag) => flag === 1).length ?? 0
      );
    expect(await textured()).toBe(0);
    await tools.getByRole("button", { name: "Rect" }).click();
    await tools.getByRole("button", { name: "Data + texture" }).click();
    await tools.getByRole("button", { name: "Ground", exact: true }).nth(1).click();
    await drag(
      page,
      await cellOnScreen(page, { col: 15, row: 3 }),
      await cellOnScreen(page, { col: 16, row: 4 })
    );
    await expect.poll(textured).toBe(4);
    await tools.getByRole("button", { name: "Difficult" }).click();
    await drag(
      page,
      await cellOnScreen(page, { col: 15, row: 6 }),
      await cellOnScreen(page, { col: 16, row: 6 })
    );
    await expect.poll(textured).toBe(6);
    await tools.getByRole("button", { name: "Air" }).click();
    await drag(
      page,
      await cellOnScreen(page, { col: 17, row: 6 }),
      await cellOnScreen(page, { col: 17, row: 6 })
    );
    await expect.poll(textured).toBe(7);
  });

  await test.step("A stroke started anywhere on the board lands, the corner beneath the palette included.", async () => {
    await tools.getByRole("button", { name: "Difficult" }).click();
    const palette = await tools.locator(".panel").first().boundingBox();
    const rail = await tools.locator(".rail").boundingBox();
    expect(palette).not.toBeNull();
    expect(rail).not.toBeNull();
    const from = { x: (palette?.x ?? 0) + 40, y: (palette?.y ?? 0) + (palette?.height ?? 0) + 24 };
    expect(from.y).toBeLessThan((rail?.y ?? 0) + (rail?.height ?? 0));
    const before = await cellsOf(page, 2);
    await drag(page, from, { x: from.x + 90, y: from.y + 90 });
    await expect.poll(() => cellsOf(page, 2)).toBeGreaterThan(before);
  });

  // One stroke where it took two: the Height pen is not needed to raise a
  // floor the same hand is laying down.
  await test.step("Ground at a height raises the cells it paints, so a platform is one stroke.", async () => {
    await tools
      .getByRole("group", { name: "Ground state" })
      .getByRole("button", { name: "Ground", exact: true })
      .click();
    await tools.getByRole("button", { name: "Rect" }).click();
    await tools
      .getByRole("group", { name: "Sits at" })
      .getByRole("button", { name: "A height" })
      .click();
    await tools.getByLabel("Height of the ground").fill("10");
    await drag(
      page,
      await cellOnScreen(page, { col: 6, row: 5 }),
      await cellOnScreen(page, { col: 8, row: 7 })
    );
    await expect.poll(async () => (await tokenById(page, "seed-b"))?.height).toBe(10);
    await tools.getByRole("button", { name: "History" }).click();
    await expect(tools.getByText("Ground, ground, 3 × 3 cells, at +10")).toBeVisible();
  });
});

test("A DM draws walls", async ({ page }) => {
  await openTable(page);
  const tools = page.locator("tw-tool-rail");

  await test.step("A line along the grid, or a rect for four walls at once.", async () => {
    await tools.getByRole("button", { name: "Wall" }).click();
    await tools.getByRole("button", { name: "Line" }).click();
    // Vertices sit between cell centres: a line down x = 10 from row 4 to row 8.
    await drag(
      page,
      await edgeOnScreen(page, { col: 9, row: 3 }, { col: 10, row: 4 }),
      await edgeOnScreen(page, { col: 9, row: 7 }, { col: 10, row: 8 })
    );
    await expect.poll(() => edgeCount(page)).toBe(4);
    await tools.getByRole("button", { name: "Rect" }).click();
    await drag(
      page,
      await cellOnScreen(page, { col: 12, row: 8 }),
      await cellOnScreen(page, { col: 13, row: 9 })
    );
    await expect.poll(() => edgeCount(page)).toBe(12);
  });

  await test.step("As data, a hint over art that draws its own walls; as texture, a solid wall.", async () => {
    expect((await looksOf(page)).every((look) => look === "data")).toBe(true);
    await tools.getByRole("button", { name: "Data + texture" }).click();
    await tools.getByRole("button", { name: "Line" }).click();
    await drag(
      page,
      await edgeOnScreen(page, { col: 5, row: 9 }, { col: 6, row: 10 }),
      await edgeOnScreen(page, { col: 5, row: 12 }, { col: 6, row: 13 })
    );
    await expect.poll(() => edgeCount(page)).toBe(15);
    expect((await looksOf(page)).filter((look) => look === "both").length).toBe(3);
  });

  // Nothing drawn so far said a word about height, and every wall of it
  // stands at the ceiling of convention all the same.
  await test.step("A wall stands ten feet unless it is told otherwise, and the record says how tall.", async () => {
    expect((await tallsOf(page)).every((tall) => tall === 10)).toBe(true);
    await tools.getByLabel("How tall it stands").fill("3");
    await tools.getByRole("button", { name: "Line" }).click();
    // A balustrade down x = 16, from row 5 to row 7: two edges, knee high.
    // Out in the open floor to the east, clear of the palette, which grows
    // with the words in it.
    await drag(
      page,
      await edgeOnScreen(page, { col: 15, row: 4 }, { col: 16, row: 5 }),
      await edgeOnScreen(page, { col: 15, row: 6 }, { col: 16, row: 7 })
    );
    await expect
      .poll(async () => (await tallsOf(page)).filter((tall) => tall === 3).length)
      .toBe(2);
    await tools.getByRole("button", { name: "History" }).click();
    await expect(tools.getByText("Wall along 2 edges, 3 ft tall")).toBeVisible();
  });
});

test("A DM places thresholds", async ({ page }) => {
  await openTable(page);
  const tools = page.locator("tw-tool-rail");
  const thresholdAt = (key: string) =>
    page.evaluate((k) => {
      const data = window.__tablewright?.topology().edges.get(k);
      return data?.kind === "threshold"
        ? { kind: data.threshold, state: data.state, size: data.size }
        : undefined;
    }, key);

  await test.step("A click on a cell edge places the kind, state and size chosen.", async () => {
    await tools.getByRole("button", { name: "Threshold" }).click();
    await tools.getByRole("group", { name: "State" }).getByRole("button", { name: "Open" }).click();
    const door = await edgeOnScreen(page, { col: 8, row: 7 }, { col: 9, row: 7 });
    await page.mouse.click(door.x, door.y);
    await expect
      .poll(() => thresholdAt("east:8:7"))
      .toEqual({
        kind: "door",
        state: "open",
        size: "small",
      });
    await tools
      .getByRole("group", { name: "Kind" })
      .getByRole("button", { name: "Window" })
      .click();
    await tools
      .getByRole("group", { name: "State" })
      .getByRole("button", { name: "Closed" })
      .click();
    await tools.getByRole("group", { name: "Size" }).getByRole("button", { name: "Large" }).click();
    const window_ = await edgeOnScreen(page, { col: 12, row: 4 }, { col: 12, row: 5 });
    await page.mouse.click(window_.x, window_.y);
    await expect
      .poll(() => thresholdAt("south:12:4"))
      .toEqual({
        kind: "window",
        state: "closed",
        size: "large",
      });
  });

  // A window two cells up a wall is a low thing to climb through, and the
  // record is where that is said until sight reads it.
  await test.step("A threshold stands as tall as it is given, and the record says how tall.", async () => {
    await tools.getByLabel("How tall it stands").fill("4");
    const low = await edgeOnScreen(page, { col: 10, row: 10 }, { col: 11, row: 10 });
    await page.mouse.click(low.x, low.y);
    await expect
      .poll(() =>
        page.evaluate(() => window.__tablewright?.topology().edges.get("east:10:10")?.tall)
      )
      .toBe(4);
    await tools.getByRole("button", { name: "History" }).click();
    await expect(tools.getByText("Window, closed, large, 4 ft tall")).toBeVisible();
  });

  await test.step("A secret door is the DM's alone until it is found.", async () => {
    await tools.getByRole("group", { name: "Kind" }).getByRole("button", { name: "Door" }).click();
    await tools
      .getByRole("group", { name: "State" })
      .getByRole("button", { name: "Secret" })
      .click();
    const secret = await edgeOnScreen(page, { col: 14, row: 9 }, { col: 15, row: 9 });
    await page.mouse.click(secret.x, secret.y);
    await expect.poll(async () => (await thresholdAt("east:14:9"))?.state).toBe("secret");
    // The record keeps it at the DM's tier, above what the party sees.
    expect(await page.evaluate(() => window.__tablewright?.strokes().at(-1))).toMatchObject({
      ink: "threshold",
      state: "secret",
      visibility: "dm",
    });
    // In play, a tap finds it, and it stands as a shut door.
    await tools.getByRole("button", { name: "Move", exact: true }).click();
    await page.mouse.click(secret.x, secret.y);
    await expect.poll(async () => (await thresholdAt("east:14:9"))?.state).toBe("closed");
  });
});

test("A DM paints height and level changes", async ({ page }) => {
  await openTable(page);
  const tools = page.locator("tw-tool-rail");
  const heightOf = async (id: string) => (await tokenById(page, id))?.height;
  const route = (from: { col: number; row: number }, to: { col: number; row: number }) =>
    routeCost(page, from, to);

  await test.step("An amount painted into the field, by rect or by brush, shows on the token standing there.", async () => {
    await tools.getByRole("button", { name: "Height" }).click();
    await tools.getByRole("button", { name: "Rect" }).click();
    await tools.getByLabel("Height amount").fill("10");
    await drag(
      page,
      await cellOnScreen(page, { col: 6, row: 5 }),
      await cellOnScreen(page, { col: 8, row: 7 })
    );
    await expect.poll(() => heightOf("seed-b")).toBe(10);
    await tools.getByRole("button", { name: "Brush" }).click();
    await tools.getByLabel("Height amount").fill("-5");
    await drag(
      page,
      await cellOnScreen(page, { col: 11, row: 9 }),
      await cellOnScreen(page, { col: 12, row: 9 })
    );
    await expect.poll(() => heightOf("seed-c")).toBe(-5);
  });

  await test.step("A level change is walked, not climbed.", async () => {
    // Up onto the raised block from the cell east of it: a 10 ft climb.
    expect(await route({ col: 9, row: 6 }, { col: 8, row: 6 })).toBe(25);
    await tools.getByRole("button", { name: "Level change" }).click();
    await drag(
      page,
      await cellOnScreen(page, { col: 8, row: 6 }),
      await cellOnScreen(page, { col: 9, row: 6 })
    );
    await expect.poll(() => route({ col: 9, row: 6 }, { col: 8, row: 6 })).toBe(5);
  });

  await test.step("The rules read what was drawn: a route through an open door, none through a locked one.", async () => {
    await tools.getByRole("button", { name: "Wall" }).click();
    await tools.getByRole("button", { name: "Rect" }).click();
    await drag(
      page,
      await cellOnScreen(page, { col: 14, row: 3 }),
      await cellOnScreen(page, { col: 16, row: 5 })
    );
    await expect.poll(() => route({ col: 13, row: 4 }, { col: 15, row: 4 })).toBeUndefined();
    await tools.getByRole("button", { name: "Threshold" }).click();
    await tools.getByRole("group", { name: "State" }).getByRole("button", { name: "Open" }).click();
    const west = await edgeOnScreen(page, { col: 13, row: 4 }, { col: 14, row: 4 });
    await page.mouse.click(west.x, west.y);
    await expect.poll(() => route({ col: 13, row: 4 }, { col: 15, row: 4 })).toBe(10);
    await tools
      .getByRole("group", { name: "State" })
      .getByRole("button", { name: "Locked" })
      .click();
    await page.mouse.click(west.x, west.y);
    await expect.poll(() => route({ col: 13, row: 4 }, { col: 15, row: 4 })).toBeUndefined();
  });
});

test("A DM draws free ink", async ({ page }) => {
  await openTable(page);
  const tools = page.locator("tw-tool-rail");

  await test.step("Ink with no rules meaning, at the brush's width.", async () => {
    const cells = await page.evaluate(() => {
      const bounds = window.__tablewright?.bounds();
      return (bounds?.cols ?? 0) * (bounds?.rows ?? 0);
    });
    await tools.getByRole("button", { name: "Free ink" }).click();
    await tools.getByRole("button", { name: "Brush" }).click();
    // A hundred pixels across on the tavern's fifty pixel cells: a radius of one cell.
    await tools.getByLabel("Brush size in pixels").fill("100");
    await drag(
      page,
      await cellOnScreen(page, { col: 6, row: 9 }),
      await cellOnScreen(page, { col: 9, row: 10 })
    );
    await expect
      .poll(() => page.evaluate(() => window.__tablewright?.topology().free.length))
      .toBe(1);
    const shape = await page.evaluate(() => window.__tablewright?.topology().free[0]?.shape);
    expect(shape?.kind === "brush" ? shape.radius : undefined).toBe(1);
    // The rules read nothing new: no edge, no height, every cell plain ground.
    expect(await edgeCount(page)).toBe(0);
    expect(
      await page.evaluate(() => window.__tablewright?.topology().field.every((v) => v === 0))
    ).toBe(true);
    expect(await cellsOf(page, 1)).toBe(cells);
  });
});

test("A DM keeps something back", async ({ page }) => {
  await openTable(page);
  const tools = page.locator("tw-tool-rail");
  const tokens = () => page.evaluate(() => window.__tablewright?.tokens().length);

  await test.step("While the rail is on the DM layer, what is put down is the DM's own and reads faint.", async () => {
    const standing = (await tokens()) ?? 0;
    // A token already on the table, kept back from its own menu.
    const token = await tokenOnScreen(page, 0);
    await page.mouse.click(token.at.x, token.at.y, { button: "right" });
    await page.getByRole("menuitem", { name: "Move to the DM layer" }).click();
    await expect.poll(async () => (await tokenById(page, token.id))?.visibility).toBe("dm");
    // It is still the DM's to see, so the board is no lighter for them.
    expect(await tokens()).toBe(standing);
    // And what the pens put down while the rail says so is the DM's too.
    await tools.getByRole("button", { name: "Layer" }).click();
    await tools.getByRole("button", { name: "Free ink" }).click();
    await tools.getByRole("button", { name: "Brush" }).click();
    await drag(
      page,
      await cellOnScreen(page, { col: 14, row: 3 }),
      await cellOnScreen(page, { col: 16, row: 4 })
    );
    await expect
      .poll(() => page.evaluate(() => window.__tablewright?.strokes().at(-1)?.visibility))
      .toBe("dm");
  });

  await test.step("Sitting as a player, the board is without it.", async () => {
    const standing = (await tokens()) ?? 0;
    await page
      .getByRole("group", { name: "Sit as" })
      .getByRole("button", { name: "Player" })
      .click();
    await expect.poll(async () => await tokens()).toBe(standing - 1);
    expect(await page.evaluate(() => window.__tablewright?.topology().free.length)).toBe(0);
  });
});

test("The history", async ({ page }) => {
  await openTable(page);
  const tools = page.locator("tw-tool-rail");
  const entries = tools.getByRole("listitem");
  const inks = () => page.evaluate(() => window.__tablewright?.topology().free.length);
  // The cells each free ink rect covers, in the order the record keeps them.
  const rects = () =>
    page.evaluate(() =>
      window.__tablewright
        ?.topology()
        .free.map((stroke) => (stroke.shape.kind === "rect" ? stroke.shape.rect : undefined))
    );
  const inkAt = async (from: { col: number; row: number }, to: { col: number; row: number }) =>
    drag(page, await cellOnScreen(page, from), await cellOnScreen(page, to));

  // What each line says is the board's own logic, tested there; here, each
  // stroke has its line, and the list runs newest first.
  await test.step("Every stroke is in the history, newest first, with a line that says what it is.", async () => {
    await tools.getByRole("button", { name: "Free ink" }).click();
    await tools.getByRole("button", { name: "Rect" }).click();
    await inkAt({ col: 6, row: 5 }, { col: 7, row: 6 });
    await inkAt({ col: 10, row: 5 }, { col: 12, row: 6 });
    await expect.poll(inks).toBe(2);
    await tools.getByRole("button", { name: "History" }).click();
    await expect(entries).toHaveCount(2);
    await expect(
      entries.first().getByRole("button", { name: "Remove stroke 2", exact: true })
    ).toBeVisible();
  });

  await test.step("Undo takes the last stroke back, Ctrl+Z does the same while a pen is held, and a stroke can be removed from the middle.", async () => {
    await tools.getByRole("button", { name: "Undo" }).click();
    await expect.poll(inks).toBe(1);
    await inkAt({ col: 10, row: 5 }, { col: 12, row: 6 });
    await expect.poll(inks).toBe(2);
    await page.keyboard.press("Control+z");
    await expect.poll(inks).toBe(1);
    await inkAt({ col: 10, row: 8 }, { col: 13, row: 9 });
    await inkAt({ col: 14, row: 5 }, { col: 15, row: 6 });
    await expect.poll(inks).toBe(3);
    await tools.getByRole("button", { name: "Remove stroke 2", exact: true }).click();
    await expect.poll(inks).toBe(2);
    expect(await rects()).toEqual([
      { col0: 6, row0: 5, col1: 7, row1: 6 },
      { col0: 14, row0: 5, col1: 15, row1: 6 },
    ]);
  });

  await test.step("Reset clears everything before it and stays in the history, so Undo brings it all back.", async () => {
    await tools.getByRole("button", { name: "Reset" }).click();
    await expect.poll(inks).toBe(0);
    expect(await page.evaluate(() => window.__tablewright?.strokes().at(-1)?.ink)).toBe("clear");
    await expect(
      entries.first().getByRole("button", { name: "Remove stroke 3", exact: true })
    ).toBeVisible();
    await tools.getByRole("button", { name: "Undo" }).click();
    await expect.poll(inks).toBe(2);
  });
});

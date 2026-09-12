import { expect, test } from "@playwright/test";
import {
  cellOnScreen,
  drag,
  edgeOnScreen,
  openHallowayHouse,
  openTable,
  routeCost,
  selectedId,
  settledAt,
  tokenById,
  tokenOnScreen,
} from "./helpers.js";

// The board feature of docs/stories.md: the scene on show, tokens moved
// every way, thresholds worked in play, and the heights as the scene
// chooses.

test("The board shows the scene", async ({ page }) => {
  await openTable(page);

  await test.step("The scene comes up with its picture, its grid, and its tokens.", async () => {
    await expect(page.locator("#board > canvas")).toHaveCount(1);
    await expect(page.locator(".notice")).toHaveCount(0);
    await expect(page.locator("tw-scenes").getByText("The Rusty Flagon")).toBeVisible();
    const hasWebgl = await page.evaluate(() => {
      const canvas = document.querySelector("#board > canvas");
      return canvas instanceof HTMLCanvasElement && canvas.getContext("webgl2") !== null;
    });
    expect(hasWebgl).toBe(true);
    // The tavern's picture, a thousand by seven hundred and fifty pixels.
    await expect
      .poll(() => page.evaluate(() => window.__tablewright?.picture()))
      .toEqual({ width: 1000, height: 750 });
    expect(await page.evaluate(() => window.__tablewright?.bounds())).toEqual({
      colMin: 0,
      rowMin: 0,
      cols: 20,
      rows: 15,
    });
    expect(await page.evaluate(() => window.__tablewright?.tokens().length)).toBe(3);
  });

  await test.step("The wheel zooms about the cursor, and a drag on empty board pans.", async () => {
    const before = await page.evaluate(() => window.__tablewright?.camera());
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, -300);
    const zoomed = await page.evaluate(() => window.__tablewright?.camera());
    expect(zoomed?.zoom).toBeCloseTo((before?.zoom ?? 0) * 1.1 ** 3, 5);
    const empty = await cellOnScreen(page, { col: 15, row: 12 });
    await drag(page, empty, { x: empty.x - 120, y: empty.y - 80 });
    const moved = await cellOnScreen(page, { col: 15, row: 12 });
    expect(moved.x).toBeCloseTo(empty.x - 120, 0);
    expect(moved.y).toBeCloseTo(empty.y - 80, 0);
  });

  await test.step("A token wears the height of the ground under it.", async () => {
    const heightOfC = async () => (await tokenById(page, "seed-c"))?.height;
    expect(await heightOfC()).toBe(0);
    const tools = page.locator("tw-tool-rail");
    await tools.getByRole("button", { name: "Height" }).click();
    await tools.getByRole("button", { name: "Rect" }).click();
    // Around C: after the zoom, the ground around B lies under the Height palette.
    await drag(
      page,
      await cellOnScreen(page, { col: 10, row: 8 }),
      await cellOnScreen(page, { col: 12, row: 10 })
    );
    await expect.poll(heightOfC).toBe(5);
  });
});

test("A DM or a player moves a token", async ({ page }) => {
  await openTable(page);

  await test.step("A drag drops the token on the target cell, facing its travel.", async () => {
    const token = await tokenOnScreen(page, 0);
    const target = { col: token.cell.col + 2, row: token.cell.row + 1 };
    await drag(page, token.at, await cellOnScreen(page, target));
    const after = await settledAt(page, token.id, target);
    // Two cells east and one south is a heading of about 117 degrees, kept whole.
    expect(after?.facing).toBe(117);
  });

  await test.step("The arrow keys and WASD step the selected token one cell.", async () => {
    const token = await tokenOnScreen(page, 1);
    await page.mouse.click(token.at.x, token.at.y);
    expect(await selectedId(page)).toBe(token.id);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await settledAt(page, token.id, { col: token.cell.col + 1, row: token.cell.row - 1 });
    await page.keyboard.press("d");
    await page.keyboard.press("w");
    const after = await settledAt(page, token.id, {
      col: token.cell.col + 2,
      row: token.cell.row - 2,
    });
    expect(after?.facing).toBe(0);
  });

  await test.step("A click on empty board deselects.", async () => {
    const empty = await cellOnScreen(page, { col: 15, row: 12 });
    await page.mouse.click(empty.x, empty.y);
    expect(await selectedId(page)).toBeUndefined();
  });

  await test.step("A press on the selected token's corner turns it in place.", async () => {
    const token = await tokenOnScreen(page, 2);
    await page.mouse.click(token.at.x, token.at.y);
    const neighbour = await cellOnScreen(page, {
      col: token.cell.col - 1,
      row: token.cell.row - 1,
    });
    // The shared corner is halfway to the diagonal neighbour; press a little
    // inside the cell from it, still well outside the disc.
    const corner = { x: (token.at.x + neighbour.x) / 2, y: (token.at.y + neighbour.y) / 2 };
    const handle = {
      x: corner.x + (token.at.x - corner.x) * 0.2,
      y: corner.y + (token.at.y - corner.y) * 0.2,
    };
    const west = await cellOnScreen(page, { col: token.cell.col - 3, row: token.cell.row });
    await drag(page, handle, west);
    await expect.poll(async () => (await settledAt(page, token.id, token.cell))?.facing).toBe(270);
  });

  await test.step("A token standing for no sheet has no limit, so a long drag lands it all the same.", async () => {
    const token = await tokenOnScreen(page, 0);
    // Thirteen cells of the tavern's five-foot squares is sixty-five feet,
    // past what a person on foot could walk or even dash.
    const far = { col: 19, row: token.cell.row };
    await drag(page, await cellOnScreen(page, token.cell), await cellOnScreen(page, far));
    await settledAt(page, token.id, far);
    await expect(page.locator("tw-dash-ask")).toBeHidden();
  });
});

test("Working thresholds in play", async ({ page }) => {
  await openTable(page);
  const notice = page.locator(".notice");
  const stateOf = (key: string) =>
    page.evaluate((k) => {
      const data = window.__tablewright?.topology().edges.get(k);
      return data?.kind === "threshold" ? data.state : undefined;
    }, key);

  await test.step("In Halloway House, a door under the pointer lights up.", async () => {
    await openHallowayHouse(page);
    const door = await edgeOnScreen(page, { col: 15, row: 6 }, { col: 15, row: 7 });
    await page.mouse.move(door.x, door.y);
    await expect(page.locator("#board")).toHaveAttribute("data-threshold", "true");
  });

  await test.step("A tap on a shut door opens it, and on an open one shuts it.", async () => {
    const door = await edgeOnScreen(page, { col: 15, row: 6 }, { col: 15, row: 7 });
    expect(await stateOf("south:15:6")).toBe("closed");
    await page.mouse.click(door.x, door.y);
    await expect.poll(() => stateOf("south:15:6")).toBe("open");
    await page.mouse.click(door.x, door.y);
    await expect.poll(() => stateOf("south:15:6")).toBe("closed");
  });

  await test.step("A locked door says so, an arch is always open, a large window is smashed through, and a small one is sight only.", async () => {
    // The page says so in a notice, and a click on the notice puts it away.
    await expect(notice).toHaveCount(0);
    const locked = await edgeOnScreen(page, { col: 10, row: 3 }, { col: 11, row: 3 });
    await page.mouse.click(locked.x, locked.y);
    await expect(notice).toBeVisible();
    expect(await stateOf("east:10:3")).toBe("locked");
    await notice.click();
    await expect(notice).toHaveCount(0);
    // An arch has nothing to work: a tap leaves it open, and the way through
    // is one step onto the difficult ground beyond it, not the long way round.
    const arch = await edgeOnScreen(page, { col: 4, row: 11 }, { col: 4, row: 12 });
    await page.mouse.click(arch.x, arch.y);
    expect(await stateOf("south:4:11")).toBe("open");
    expect(await routeCost(page, { col: 4, row: 11 }, { col: 4, row: 12 })).toBe(10);
    const large = await edgeOnScreen(page, { col: 18, row: 2 }, { col: 19, row: 2 });
    await page.mouse.click(large.x, large.y);
    await expect.poll(() => stateOf("east:18:2")).toBe("smashed");
    // A small window says why it stays shut, and no one passes it.
    const small = await edgeOnScreen(page, { col: 0, row: 6 }, { col: 1, row: 6 });
    await page.mouse.click(small.x, small.y);
    await expect(notice).toBeVisible();
    expect(await stateOf("east:0:6")).toBe("closed");
    expect(await routeCost(page, { col: 1, row: 6 }, { col: 0, row: 6 })).toBeUndefined();
  });
});

test("The heights show as the scene chooses", async ({ page }) => {
  await openTable(page);
  const tools = page.locator("tw-tool-rail");
  const tab = page.locator("tw-scenes");
  const heights = () => page.evaluate(() => window.__tablewright?.heights());
  const numbers = () => page.evaluate(() => window.__tablewright?.numbers());

  await test.step("In Halloway House the heights show Shaded, with a contour around every rise.", async () => {
    await openHallowayHouse(page);
    expect((await heights())?.mode).toBe("shaded");
    expect((await heights())?.contours).toBeGreaterThan(0);
  });

  await test.step("Washed, Marked, or Data is chosen from the Height pen's palette, and the choice stays with the scene.", async () => {
    await tools.getByRole("button", { name: "Height" }).click();
    await tools.getByRole("button", { name: "Washed" }).click();
    await expect.poll(async () => (await heights())?.mode).toBe("washed");
    await tools.getByRole("button", { name: "Data", exact: true }).click();
    await expect.poll(async () => (await heights())?.contours).toBe(0);
    await tab.getByRole("button", { name: "Halloway House" }).click();
    await tab.getByRole("menuitem", { name: "The Rusty Flagon" }).click();
    await expect.poll(async () => (await heights())?.mode).toBe("shaded");
    await tab.getByRole("button", { name: "The Rusty Flagon" }).click();
    await tab.getByRole("menuitem", { name: "Halloway House", exact: true }).nth(1).click();
    await expect.poll(async () => (await heights())?.mode).toBe("data");
  });

  await test.step("Marked tags each rise once.", async () => {
    await tools.getByRole("button", { name: "Marked" }).click();
    await expect.poll(async () => (await heights())?.mode).toBe("marked");
    // The gallery, the pit, and the raised south row.
    expect((await heights())?.tags).toBe(3);
  });

  await test.step("The strength fades the whole overlay.", async () => {
    await tools.getByLabel("Height display strength").fill("40");
    await expect.poll(async () => (await heights())?.strength).toBe(40);
  });

  await test.step("Topology in the rail reads the scene as the rules do: every height printed, a level change as stair, the picture out of the way.", async () => {
    expect((await numbers())?.heights).toBe(0);
    await tools.getByRole("button", { name: "Topology" }).click();
    await expect.poll(async () => (await numbers())?.heights).toBeGreaterThan(0);
    // The dais, the gallery and the pit are printed; the stairs off the dais say stair.
    expect((await numbers())?.stairs).toBeGreaterThan(0);
    // A textured wall reads as its data hint while the numbers are up, so
    // the picture under them is uncovered.
    expect(await page.evaluate(() => window.__tablewright?.topology().edges.size)).toBeGreaterThan(
      0
    );
  });

  await test.step("The Topology view is the DM's alone, and it stays on while the DM plays.", async () => {
    // A pen picked up and put down again leaves the numbers where they were.
    await tools.getByRole("button", { name: "Ground", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await numbers())?.heights).toBeGreaterThan(0);
    // The key puts it away again, and the rail's item comes up with it.
    await page.keyboard.press("t");
    await expect.poll(async () => (await numbers())?.heights).toBe(0);
    await expect(tools.getByRole("button", { name: "Topology" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});

test("A DM or a player measures", async ({ page }) => {
  await openTable(page);
  const tools = page.locator("tw-tool-rail");
  const board = page.locator("#board");
  // The measure without the route, whose set of step kinds would not travel.
  const measured = () =>
    page.evaluate(() => {
      const found = window.__tablewright?.measurement();
      return found === undefined
        ? undefined
        : {
            from: found.from,
            mode: found.mode,
            distance: found.distance,
            rise: found.rise,
            cost: (found.choice.route ?? found.route)?.cost,
            phase: found.choice.phase,
            blockedAt: found.blockedAt,
            isPrivate: found.isPrivate,
          };
    });
  const measure = async (from: { col: number; row: number }, to: { col: number; row: number }) => {
    await drag(page, await cellOnScreen(page, from), await cellOnScreen(page, to));
    return measured();
  };

  await test.step("The ruler sits in the rail under Move and swaps moving for measuring, its modes in a column beside it.", async () => {
    await expect(tools.getByRole("button", { name: "Line" })).toHaveCount(0);
    await tools.getByRole("button", { name: "Ruler" }).click();
    await expect(tools.getByRole("button", { name: "Ruler" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(tools.getByRole("button", { name: "Line" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(board).toHaveAttribute("data-tool", "ruler");
    // A drag from a token measures from its cell and moves nothing.
    const token = await tokenOnScreen(page, 0);
    await drag(page, token.at, await cellOnScreen(page, { col: 7, row: 8 }));
    expect((await tokenById(page, token.id))?.cell).toEqual(token.cell);
    expect((await measured())?.from).toEqual(token.cell);
    await page.keyboard.press("r");
    await expect(tools.getByRole("button", { name: "Move" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(board).not.toHaveAttribute("data-tool", /./);
    expect(await measured()).toBeUndefined();
    await page.keyboard.press("r");
    await expect(tools.getByRole("button", { name: "Ruler" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  await test.step("A line measure shows the distance as the crow flies, with the rise, and breaks where the line of effect does.", async () => {
    // Across the tavern floor, three cells across and four down.
    const flat = await measure({ col: 2, row: 2 }, { col: 5, row: 6 });
    expect(flat?.mode).toBe("line");
    expect(flat?.distance).toBe(20);
    expect(flat?.rise).toBe(0);
    expect(flat?.blockedAt).toBeUndefined();
    // Through Halloway House, the line of effect breaks at the first wall.
    await openHallowayHouse(page);
    const walled = await measure({ col: 3, row: 8 }, { col: 12, row: 8 });
    expect(walled?.distance).toBe(45);
    expect(walled?.blockedAt).toEqual({ x: 9, y: 8.5 });
    // Up Terrace Hill, fifteen feet of rise within four cells is still twenty feet.
    const tab = page.locator("tw-scenes");
    await tab.getByRole("button", { name: "Halloway House" }).click();
    await tab.getByRole("menuitem", { name: "Add Terrace Hill" }).click();
    await expect(tab.getByRole("button", { name: "Terrace Hill" })).toBeVisible();
    const climbed = await measure({ col: 3, row: 3 }, { col: 6, row: 7 });
    expect(climbed?.distance).toBe(20);
    expect(climbed?.rise).toBe(15);
  });

  await test.step("A path measure shows the way this turn allows, and says when it takes a dash.", async () => {
    await tools.getByRole("button", { name: "Path" }).click();
    await expect(tools.getByRole("button", { name: "Path" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    // The same climb, walked: twenty feet on foot up the stairs, within the move.
    const walked = await measure({ col: 3, row: 3 }, { col: 6, row: 7 });
    expect(walked?.mode).toBe("path");
    expect(walked?.phase).toBe("move");
    expect(walked?.cost).toBe(20);
    // Across the hill is forty feet: more than a move on foot, within a dash.
    const dashed = await measure({ col: 2, row: 7 }, { col: 10, row: 7 });
    expect(dashed?.phase).toBe("dash");
    expect(dashed?.cost).toBe(40);
  });

  await test.step("A measure stays until Escape, and Alt makes it private.", async () => {
    expect((await measured())?.rise).toBe(20);
    await page.keyboard.press("Escape");
    expect(await measured()).toBeUndefined();
    await page.keyboard.down("Alt");
    const own = await measure({ col: 3, row: 3 }, { col: 6, row: 7 });
    await page.keyboard.up("Alt");
    expect(own?.isPrivate).toBe(true);
  });
});

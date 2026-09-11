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
});

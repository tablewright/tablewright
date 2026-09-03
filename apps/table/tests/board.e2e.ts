import { expect, test, type Page } from "@playwright/test";

// The dev build exposes a read-only view of the scene on window.__tablewright;
// tests point the mouse through it instead of guessing pixels.

async function tokenOnScreen(page: Page, index: number) {
  return page.evaluate((i) => {
    const debug = window.__tablewright;
    if (debug === undefined) {
      throw new Error("dev debug view missing");
    }
    const token = debug.tokens()[i];
    if (token === undefined) {
      throw new Error(`no token at index ${i}`);
    }
    return {
      id: token.id,
      cell: token.cell,
      facing: token.facing,
      at: debug.cellToScreen(token.cell),
    };
  }, index);
}

async function cellOnScreen(page: Page, cell: { col: number; row: number }) {
  return page.evaluate((c) => {
    const debug = window.__tablewright;
    if (debug === undefined) {
      throw new Error("dev debug view missing");
    }
    return debug.cellToScreen(c);
  }, cell);
}

async function tokenById(page: Page, id: string) {
  return page.evaluate((wanted) => window.__tablewright?.tokens().find((t) => t.id === wanted), id);
}

async function selectedId(page: Page) {
  return page.evaluate(() => window.__tablewright?.selectedId());
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => window.__tablewright !== undefined && window.__tablewright.tokens().length > 0
  );
});

test("renders a WebGL board with the fixture map and its tokens", async ({ page }) => {
  await expect(page.locator("#board > canvas")).toHaveCount(1);
  await expect(page.locator(".notice")).toHaveCount(0);
  await expect(page.locator("#scene .scene-name")).toHaveText("The Rusty Flagon");
  const hasWebgl = await page.evaluate(() => {
    const canvas = document.querySelector("#board > canvas");
    return canvas instanceof HTMLCanvasElement && canvas.getContext("webgl2") !== null;
  });
  expect(hasWebgl).toBe(true);
  const bounds = await page.evaluate(() => window.__tablewright?.bounds());
  expect(bounds).toEqual({ colMin: 0, rowMin: 0, cols: 20, rows: 15 });
  expect(await page.evaluate(() => window.__tablewright?.tokens().length)).toBe(3);
});

test("dragging a token drops it on the target cell facing its travel", async ({ page }) => {
  const token = await tokenOnScreen(page, 0);
  const target = { col: token.cell.col + 2, row: token.cell.row + 1 };
  const to = await cellOnScreen(page, target);
  await page.mouse.move(token.at.x, token.at.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  const after = await tokenById(page, token.id);
  expect(after?.cell).toEqual(target);
  // Two cells east and one south is a heading of about 117 degrees.
  expect(after?.facing).toBeCloseTo(116.57, 0);
});

test("a click selects, arrow keys step, and empty board deselects", async ({ page }) => {
  const token = await tokenOnScreen(page, 1);
  await page.mouse.click(token.at.x, token.at.y);
  expect(await selectedId(page)).toBe(token.id);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  const after = await tokenById(page, token.id);
  expect(after?.cell).toEqual({ col: token.cell.col + 2, row: token.cell.row - 1 });
  expect(after?.facing).toBe(0);
  const empty = await cellOnScreen(page, { col: 15, row: 12 });
  await page.mouse.click(empty.x, empty.y);
  expect(await selectedId(page)).toBeUndefined();
});

test("a press on the selected token's corner turns it in place", async ({ page }) => {
  const token = await tokenOnScreen(page, 2);
  await page.mouse.click(token.at.x, token.at.y);
  const neighbour = await cellOnScreen(page, { col: token.cell.col - 1, row: token.cell.row - 1 });
  // The shared corner is halfway to the diagonal neighbour; press a little inside
  // the cell from it, still well outside the disc, so pixel rounding cannot put
  // the press on the boundary.
  const corner = { x: (token.at.x + neighbour.x) / 2, y: (token.at.y + neighbour.y) / 2 };
  const handle = {
    x: corner.x + (token.at.x - corner.x) * 0.2,
    y: corner.y + (token.at.y - corner.y) * 0.2,
  };
  const west = await cellOnScreen(page, { col: token.cell.col - 3, row: token.cell.row });
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(west.x, west.y, { steps: 8 });
  await page.mouse.up();
  const after = await tokenById(page, token.id);
  expect(after?.cell).toEqual(token.cell);
  expect(after?.facing).toBeCloseTo(270, 0);
});

test("the wheel zooms about the cursor", async ({ page }) => {
  const before = await page.evaluate(() => window.__tablewright?.camera());
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -300);
  const after = await page.evaluate(() => window.__tablewright?.camera());
  expect(after?.zoom).toBeCloseTo((before?.zoom ?? 0) * 1.1 ** 3, 5);
});

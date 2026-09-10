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

// A move goes through the core and comes back as a new scene, so the token
// settles a moment after the input; on a software-rendered runner that
// moment is long enough to read the old cell. Poll for the cell, then read.
async function settledAt(
  page: Page,
  id: string,
  cell: { col: number; row: number }
): Promise<Awaited<ReturnType<typeof tokenById>>> {
  await expect.poll(async () => (await tokenById(page, id))?.cell).toEqual(cell);
  return tokenById(page, id);
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
  await expect(page.locator("tw-scenes").getByText("The Rusty Flagon")).toBeVisible();
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
  const after = await settledAt(page, token.id, target);
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
  const after = await settledAt(page, token.id, {
    col: token.cell.col + 2,
    row: token.cell.row - 1,
  });
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
  // A turn in place changes only the facing, so that is what settles.
  await expect.poll(async () => (await tokenById(page, token.id))?.facing).toBeCloseTo(270, 0);
  const after = await tokenById(page, token.id);
  expect(after?.cell).toEqual(token.cell);
});

test("the wheel zooms about the cursor", async ({ page }) => {
  const before = await page.evaluate(() => window.__tablewright?.camera());
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -300);
  const after = await page.evaluate(() => window.__tablewright?.camera());
  expect(after?.zoom).toBeCloseTo((before?.zoom ?? 0) * 1.1 ** 3, 5);
});

// The scene tab is the DM's list until the Scenes leaf: a reference
// drawing becomes a scene of its own, and the tab switches between them.
test("a reference drawing becomes a scene, and the tab switches scenes", async ({ page }) => {
  await page.goto("/?role=dm");
  await page.waitForFunction(
    () => window.__tablewright !== undefined && window.__tablewright.tokens().length > 0
  );
  const tab = page.locator("tw-scenes");
  const edges = () => page.evaluate(() => window.__tablewright?.topology().edges.size);
  const tokens = () => page.evaluate(() => window.__tablewright?.tokens().length);
  // Ground code of a cell in the north-east room: 3 is air, 1 is ground.
  // The air there is the last stroke of the mansion.
  const northEast = () =>
    page.evaluate(() => {
      const topology = window.__tablewright?.topology();
      return topology === undefined ? undefined : topology.ground[2 * topology.bounds.cols + 15];
    });
  expect(await edges()).toBe(0);
  await tab.getByRole("button", { name: "The Rusty Flagon" }).click();
  await tab.getByRole("menuitem", { name: "Add Halloway House" }).click();
  await expect.poll(edges).toBe(118);
  await expect(tab.getByRole("button", { name: "Halloway House" })).toBeVisible();
  expect(await tokens()).toBe(0);
  expect(await northEast()).toBe(3);
  await page.locator("tw-tool-rail").getByRole("button", { name: "Wall" }).click();
  await page.locator("tw-tool-rail").getByRole("button", { name: "Undo" }).click();
  await expect.poll(northEast).toBe(1);
  await tab.getByRole("button", { name: "Halloway House" }).click();
  await tab.getByRole("menuitem", { name: "The Rusty Flagon" }).click();
  await expect.poll(edges).toBe(0);
  await expect.poll(tokens).toBe(3);
});

// Build mode draws through the core: a wall down the corridor joins the
// record, and Undo takes it back.
test("with the wall pen held, a wall drawn down the corridor joins the record, and Undo takes it back", async ({
  page,
}) => {
  await page.goto("/?role=dm");
  await page.waitForFunction(
    () => window.__tablewright !== undefined && window.__tablewright.tokens().length > 0
  );
  const tab = page.locator("tw-scenes");
  const edges = () => page.evaluate(() => window.__tablewright?.topology().edges.size);
  await tab.getByRole("button", { name: "The Rusty Flagon" }).click();
  await tab.getByRole("menuitem", { name: "Add Halloway House" }).click();
  await expect.poll(edges).toBe(118);
  const tools = page.locator("tw-tool-rail");
  await tools.getByRole("button", { name: "Wall" }).click();
  await tools.getByRole("button", { name: "Line" }).click();
  // Vertices sit between cell centres: a line down x = 10 from row 4 to row 8,
  // inside the corridor, where the mansion has no wall yet.
  const a = await cellOnScreen(page, { col: 9, row: 3 });
  const b = await cellOnScreen(page, { col: 10, row: 4 });
  const c = await cellOnScreen(page, { col: 9, row: 7 });
  const d = await cellOnScreen(page, { col: 10, row: 8 });
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2);
  await page.mouse.down();
  await page.mouse.move((c.x + d.x) / 2, (c.y + d.y) / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(edges).toBe(122);
  await expect(tools.getByRole("button", { name: "Show all 28" })).toBeVisible();
  // A reset is a stroke: everything goes, and Undo brings it all back.
  await tools.getByRole("button", { name: "Reset" }).click();
  await expect.poll(edges).toBe(0);
  await expect(tools.getByRole("button", { name: "Show all 29" })).toBeVisible();
  await tools.getByRole("button", { name: "Undo" }).click();
  await expect.poll(edges).toBe(122);
  await tools.getByRole("button", { name: "Undo" }).click();
  await expect.poll(edges).toBe(118);
  await expect(tools.getByRole("button", { name: "Show all 27" })).toBeVisible();
});

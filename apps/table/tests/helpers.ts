// What every story reaches for: the page as the DM or a player on the
// base, and the dev build's read-only view of the board on
// window.__tablewright, which stories point the mouse through instead of
// guessing pixels.

import { expect, type Page } from "@playwright/test";

export const box = "tw-spotlight";
export const card = "tw-share-tray tw-share-card";
export const entryPage = "tw-entry-view";

/** Open the table on the base and wait for the board to settle on the tavern. */
export async function openTable(page: Page, role: "dm" | "player" = "dm"): Promise<void> {
  await page.goto(role === "dm" ? "/?role=dm" : "/");
  await page.waitForFunction(
    () => window.__tablewright !== undefined && window.__tablewright.tokens().length > 0
  );
  await curtainOpen(page);
}

/**
 * The wordmark covers the whole window until it has drawn once and parted,
 * and until then a press lands on it rather than on the board. The board is
 * ready well before that, so being ready is not the same as taking input.
 */
export async function curtainOpen(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const loading = document.getElementById("loading");
    return loading === null || loading.classList.contains("done");
  });
}

/** The field typed into, by its name: the tray beside it holds inputs of its own. */
export function searchField(page: Page) {
  return page.getByRole("textbox", { name: "Search the compendium" });
}

/** Replace whatever the search box holds with `query`; the box must be open. */
export async function retype(page: Page, query: string): Promise<void> {
  await searchField(page).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type(query);
}

/** Bring Halloway House in from its reference drawing and wait for its walls. */
export async function openHallowayHouse(page: Page): Promise<void> {
  const tab = page.locator("tw-scenes");
  await tab.getByRole("button", { name: "The Rusty Flagon" }).click();
  await tab.getByRole("menuitem", { name: "Add Halloway House" }).click();
  await expect.poll(() => edgeCount(page)).toBe(110);
}

export function edgeCount(page: Page) {
  return page.evaluate(() => window.__tablewright?.topology().edges.size);
}

export function tokenCount(page: Page) {
  return page.evaluate(() => window.__tablewright?.tokens().length);
}

export async function tokenOnScreen(page: Page, index: number) {
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

export async function cellOnScreen(page: Page, cell: { col: number; row: number }) {
  return page.evaluate((c) => {
    const debug = window.__tablewright;
    if (debug === undefined) {
      throw new Error("dev debug view missing");
    }
    return debug.cellToScreen(c);
  }, cell);
}

/** The screen point on the edge between two neighbouring cells. */
export async function edgeOnScreen(
  page: Page,
  a: { col: number; row: number },
  b: { col: number; row: number }
) {
  return between(await cellOnScreen(page, a), await cellOnScreen(page, b));
}

/** What the cheapest route on foot costs as the rules read the scene; undefined when there is none. */
export function routeCost(
  page: Page,
  from: { col: number; row: number },
  to: { col: number; row: number }
) {
  return page.evaluate(([a, b]) => window.__tablewright?.route(a, b)?.cost, [from, to] as const);
}

export async function tokenById(page: Page, id: string) {
  return page.evaluate((wanted) => window.__tablewright?.tokens().find((t) => t.id === wanted), id);
}

export async function selectedId(page: Page) {
  return page.evaluate(() => window.__tablewright?.selectedId());
}

// A move goes through the core and comes back as a new scene, so the token
// settles a moment after the input; poll for the cell, then read.
export async function settledAt(
  page: Page,
  id: string,
  cell: { col: number; row: number }
): Promise<Awaited<ReturnType<typeof tokenById>>> {
  await expect.poll(async () => (await tokenById(page, id))?.cell).toEqual(cell);
  return tokenById(page, id);
}

/** Drag the mouse from one screen point to another, or along several. */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  ...through: { x: number; y: number }[]
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (const point of through) {
    await page.mouse.move(point.x, point.y, { steps: 6 });
  }
  await page.mouse.up();
}

/** The midpoint of two screen points: where a cell edge or a vertex sits. */
export function between(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** How many cells hold a ground code: 1 ground, 2 difficult, 3 air, 0 void. */
export function cellsOf(page: Page, code: number) {
  return page.evaluate(
    (c) => window.__tablewright?.topology().ground.filter((value) => value === c).length ?? 0,
    code
  );
}

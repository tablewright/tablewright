import { expect, test } from "@playwright/test";

// The panel runs against the dev fixture searcher here: no Tauri, no core.
// What is under test is the panel itself: opening, typing, ranking order as
// given, keyboard driving, selection, and the latency readout.

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

test("results appear as you type, each with a type badge, and the readout reports timing", async ({
  page,
}) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  const rows = page.locator(`${box} li`);
  await expect(rows).toHaveCount(5);
  await expect(rows.first().locator(".name")).toHaveText("Fire Bolt");
  await expect(rows.first().locator(".badge")).toHaveText("spell");
  await expect(rows.nth(4).locator(".badge")).toHaveText("magic-item");
  await expect(page.locator(`${box} footer`)).toHaveText(
    /5 hits of 7 · core [\d.]+ ms · to paint \d+ ms/
  );
  await page.keyboard.type(" bolt");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".name")).toHaveText("Fire Bolt");
});

test("arrows move the selection with wrap-around and Enter selects", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("fire");
  const rows = page.locator(`${box} li`);
  await expect(rows.first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(rows.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(rows.nth(4)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page.locator(box)).not.toHaveAttribute("open", "");
  await expect(page.locator(".notice[data-level='info']")).toContainText("Flame Tongue");
});

test("a filter alone lists that type, and an unmatched query says so", async ({ page }) => {
  await page.keyboard.press("Control+Space");
  await page.keyboard.type("type:monster");
  const rows = page.locator(`${box} li`);
  await expect(rows).toHaveCount(2);
  await expect(rows.locator(".badge")).toHaveText(["monster", "monster"]);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("zzz");
  await expect(rows).toHaveCount(0);
  await expect(page.locator(`${box} footer`)).toContainText("No matches");
});

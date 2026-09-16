import { expect, test } from "@playwright/test";
import { openTable } from "./helpers.js";

// The desk feature of docs/stories.md: one switch between the dark desk and
// the light one, kept per person.

test("A person turns the desk light", async ({ page }) => {
  await openTable(page);
  const desk = () => page.evaluate(() => document.documentElement.dataset["theme"] ?? "dark");
  const ground = () => page.evaluate(() => window.__tablewright?.ground());
  const darkGround = await ground();

  await test.step("Pressing the desk button turns the desk light, and the board with it.", async () => {
    await page.getByRole("button", { name: "Light desk" }).click();
    expect(await desk()).toBe("light");
    await expect.poll(ground).not.toBe(darkGround);
  });

  await test.step("The choice is kept for next time.", async () => {
    await openTable(page);
    expect(await desk()).toBe("light");
    await expect(page.getByRole("button", { name: "Dark desk" })).toBeVisible();
  });
});

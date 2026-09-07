import { describe, expect, test } from "bun:test";
import { DRAG_THRESHOLD_PX, afterHold } from "../src/tokens/press.js";

describe("afterHold", () => {
  test("a move that was on its way before the hold elapsed is a drag", () => {
    expect(afterHold(1200, 1450, DRAG_THRESHOLD_PX * 3)).toBe("drag");
  });

  test("a move after a genuine hold turns the token", () => {
    expect(afterHold(1500, 1450, DRAG_THRESHOLD_PX * 3)).toBe("turn");
  });

  test("a twitch under the drag threshold is still a hold", () => {
    expect(afterHold(1200, 1450, DRAG_THRESHOLD_PX - 1)).toBe("turn");
  });

  test("a move at the very moment the timer ran counts as after it", () => {
    expect(afterHold(1450, 1450, DRAG_THRESHOLD_PX * 3)).toBe("turn");
  });
});

import { describe, expect, test } from "bun:test";
import { FrameScheduler } from "../src/stage/frame-scheduler.js";

// Stands in for requestAnimationFrame: callbacks wait for the next refresh,
// and one queued during a refresh waits for the one after, as in a browser.
class FakeRefresh {
  private queue: (() => void)[] = [];

  readonly request = (draw: () => void): void => {
    this.queue.push(draw);
  };

  refresh(): void {
    const due = this.queue;
    this.queue = [];
    for (const draw of due) {
      draw();
    }
  }

  get pending(): number {
    return this.queue.length;
  }
}

function setUp() {
  const refresh = new FakeRefresh();
  let draws = 0;
  const scheduler = new FrameScheduler(refresh.request, () => {
    draws += 1;
  });
  return { refresh, scheduler, draws: () => draws };
}

describe("FrameScheduler", () => {
  test("nothing asked, nothing drawn, refresh after refresh", () => {
    const { refresh, scheduler, draws } = setUp();
    refresh.refresh();
    refresh.refresh();
    expect(draws()).toBe(0);
    expect(scheduler.framesDrawn).toBe(0);
    expect(refresh.pending).toBe(0);
  });

  test("many asks before a refresh are one draw", () => {
    const { refresh, scheduler, draws } = setUp();
    for (let i = 0; i < 25; i += 1) {
      scheduler.ask();
    }
    expect(refresh.pending).toBe(1);
    refresh.refresh();
    expect(draws()).toBe(1);
    expect(scheduler.framesDrawn).toBe(1);
  });

  test("a refresh after a draw draws nothing more", () => {
    const { refresh, scheduler, draws } = setUp();
    scheduler.ask();
    refresh.refresh();
    refresh.refresh();
    expect(draws()).toBe(1);
    expect(refresh.pending).toBe(0);
  });

  test("an ask during a draw is drawn at the next refresh, once", () => {
    const refresh = new FakeRefresh();
    let draws = 0;
    const scheduler = new FrameScheduler(refresh.request, () => {
      draws += 1;
      if (draws === 1) {
        scheduler.ask();
        scheduler.ask();
      }
    });
    scheduler.ask();
    refresh.refresh();
    expect(draws).toBe(1);
    expect(refresh.pending).toBe(1);
    refresh.refresh();
    expect(draws).toBe(2);
    refresh.refresh();
    expect(draws).toBe(2);
  });

  test("a draw at once counts, and a frame already asked for still comes", () => {
    const { refresh, scheduler, draws } = setUp();
    scheduler.ask();
    scheduler.drawNow();
    expect(draws()).toBe(1);
    refresh.refresh();
    expect(draws()).toBe(2);
    expect(scheduler.framesDrawn).toBe(2);
  });

  test("a disposed scheduler draws no more", () => {
    const { refresh, scheduler, draws } = setUp();
    scheduler.ask();
    scheduler.dispose();
    refresh.refresh();
    scheduler.ask();
    scheduler.drawNow();
    refresh.refresh();
    expect(draws()).toBe(0);
  });
});

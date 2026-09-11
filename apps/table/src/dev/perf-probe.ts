/**
 * ─ Perf probe ─
 *
 * The frame-time measurement that the perf harness and a person at the
 * console run alike: one wheel step per animation frame, alternating
 * direction, which changes the camera and rebuilds the grid on every
 * frame, while the gaps between frames are recorded. Then a second with
 * nothing happening, counting the frames drawn: the board draws on
 * request, so a person expects none. Dev builds only; the harness reads
 * the result from `window.__tablewrightPerf`.
 */

export interface PerfResult {
  readonly scenario: string;
  readonly frames: number;
  readonly meanMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  /** Frames longer than a 60 Hz budget. */
  readonly over16: number;
  /** Frames longer than two 60 Hz budgets: a visible hitch. */
  readonly over33: number;
  /** Frames drawn in one second with nothing happening, after the zoom. */
  readonly idleFrames: number;
}

export type PerfScenario = "tavern" | "world-fit" | "world-zoom";

/** What each scenario loads; the URL query can still override map and tokens. */
export const SCENARIOS: Readonly<
  Record<PerfScenario, { map: string | undefined; tokens: number; zoomInSteps: number }>
> = {
  tavern: { map: undefined, tokens: 3, zoomInSteps: 0 },
  "world-fit": { map: "/dev/fixtures/araitael-world.jpg", tokens: 50, zoomInSteps: 0 },
  "world-zoom": { map: "/dev/fixtures/araitael-world.jpg", tokens: 50, zoomInSteps: 22 },
};

const FRAMES = 240;
const WARMUP_FRAMES = 30;
// A whole wheel notch per frame would zoom too far; 40 px is a firm nudge.
const WHEEL_STEP_PX = 40;
const REVERSE_EVERY = 40;
const SIXTY_HZ_BUDGET_MS = 16.9;
const HITCH_MS = 33;
const IDLE_MS = 1000;

function wheel(target: HTMLElement, x: number, y: number, deltaY: number): void {
  target.dispatchEvent(
    new WheelEvent("wheel", {
      deltaY,
      deltaMode: 0,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    })
  );
}

function nextRefresh(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Run the probe against `target`, the board element, and resolve with the
 * statistics. `framesDrawn` reads how many frames the board has drawn.
 */
export async function runPerfProbe(
  target: HTMLElement,
  scenario: PerfScenario,
  framesDrawn: () => number
): Promise<PerfResult> {
  const rect = target.getBoundingClientRect();
  for (let i = 0; i < SCENARIOS[scenario].zoomInSteps; i += 1) {
    wheel(target, rect.left + 40, rect.top + 40, -100);
  }
  const centreX = rect.left + rect.width / 2;
  const centreY = rect.top + rect.height / 2;
  const deltas: number[] = [];
  await new Promise<void>((resolve) => {
    let last = performance.now();
    let frame = 0;
    const step = (now: number): void => {
      // Warm-up frames absorb one-time costs such as the first texture upload
      // and JIT; the measurement is steady state.
      if (frame >= WARMUP_FRAMES) {
        deltas.push(now - last);
      }
      last = now;
      const direction = frame % (REVERSE_EVERY * 2) < REVERSE_EVERY ? -1 : 1;
      wheel(target, centreX, centreY, direction * WHEEL_STEP_PX);
      frame += 1;
      if (frame < WARMUP_FRAMES + FRAMES) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
  // The frame the last wheel step asked for is still to come; let it land
  // before the idle second starts.
  await nextRefresh();
  await nextRefresh();
  const drawnBeforeIdle = framesDrawn();
  await new Promise((resolve) => {
    setTimeout(resolve, IDLE_MS);
  });
  const idleFrames = framesDrawn() - drawnBeforeIdle;
  const sorted = deltas.sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    scenario,
    frames: sorted.length,
    meanMs: round(mean),
    p95Ms: round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
    over16: sorted.filter((value) => value > SIXTY_HZ_BUDGET_MS).length,
    over33: sorted.filter((value) => value > HITCH_MS).length,
    idleFrames,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

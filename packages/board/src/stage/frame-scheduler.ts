/**
 * ─ Frame scheduler ─
 *
 * The board draws on request: nothing is drawn while nothing changes.
 * Every ask made before the next screen refresh folds into one draw at
 * that refresh, and an ask made during a draw is the refresh after.
 * A resize draws at once instead, since resizing the canvas blanks it.
 * The refresh and the draw are handed in, so the folding is tested
 * without a browser.
 * Design: docs/design.md §5, the board draws on request.
 */

/** Runs `draw` once at the next refresh, however many times it was asked. */
export class FrameScheduler {
  private readonly refresh: (draw: () => void) => void;
  private readonly draw: () => void;
  private isScheduled = false;
  private isDisposed = false;
  private count = 0;

  /** `refresh` runs its callback at the next screen refresh: requestAnimationFrame in a browser. */
  constructor(refresh: (draw: () => void) => void, draw: () => void) {
    this.refresh = refresh;
    this.draw = draw;
  }

  /** Frames drawn so far; still while nothing asks. */
  get framesDrawn(): number {
    return this.count;
  }

  /** Draw at the next refresh. Asks until then are one draw; an ask during a draw is the next. */
  ask(): void {
    if (this.isScheduled || this.isDisposed) {
      return;
    }
    this.isScheduled = true;
    this.refresh(this.onRefresh);
  }

  /** Draw now, for a change that blanked the canvas. A frame already asked for still comes. */
  drawNow(): void {
    if (this.isDisposed) {
      return;
    }
    this.count += 1;
    this.draw();
  }

  /** Draw no more; a refresh already asked for does nothing. */
  dispose(): void {
    this.isDisposed = true;
  }

  private readonly onRefresh = (): void => {
    // Cleared before the draw, so an ask made during it reaches the next refresh.
    this.isScheduled = false;
    if (this.isDisposed) {
      return;
    }
    this.count += 1;
    this.draw();
  };
}

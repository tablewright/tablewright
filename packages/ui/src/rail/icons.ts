// The rail's icons: stroke glyphs on a 20 px grid, drawn once here so the
// rail and the palette share them. Each takes the current colour.

import { svg, type TemplateResult } from "lit";
import type { DrawShape, Ink, RulerMode } from "@tablewright/board";

const frame = (body: TemplateResult): TemplateResult =>
  svg`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const MOVE_ICON = frame(
  svg`<circle cx="10" cy="6" r="2.6"></circle><path d="M6.5 16.5c0-3.2 1.6-5.2 3.5-5.2s3.5 2 3.5 5.2z"></path>`
);

export const UNDO_ICON = frame(
  svg`<path d="M7 5L4 8l3 3"></path><path d="M4 8h7.5a4.5 4.5 0 010 9H8"></path>`
);

export const HISTORY_ICON = frame(svg`<path d="M4 5.5h12M4 10h12M4 14.5h7"></path>`);

// A ruler laid on the diagonal, its ticks across the near edge.
export const RULER_ICON = frame(
  svg`<path d="M3 14.5L14.5 3l2.5 2.5L5.5 17z"></path><path d="M6.5 11l1.5 1.5M9 8.5l1.5 1.5M11.5 6l1.5 1.5"></path>`
);

const INK_ICONS: Record<Ink, TemplateResult> = {
  ground: frame(
    svg`<rect x="3" y="3" width="14" height="14" rx="1.5"></rect><path d="M3 10h14M10 3v14"></path>`
  ),
  threshold: frame(
    svg`<path d="M4 17h12"></path><path d="M6 17V4h8v13"></path><path d="M14 4l-6 2.2V17"></path>`
  ),
  wall: frame(
    svg`<rect x="3" y="4" width="14" height="12" rx="1"></rect><path d="M3 10h14M10 4v6M6.5 10v6M13.5 10v6"></path>`
  ),
  height: frame(
    svg`<path d="M3 16.5h14"></path><path d="M5 12.5h10"></path><path d="M7 8.5h6"></path><path d="M9 4.5h2"></path>`
  ),
  "level-change": frame(svg`<path d="M3 16h4v-4h4V8h4V4h2"></path>`),
  free: frame(svg`<path d="M3.5 14c2.5-7 4.5-7 6.5-1.5s4 3.5 6.5-3"></path>`),
};

const SHAPE_ICONS: Record<DrawShape, TemplateResult> = {
  // A paintbrush: the handle from the top right, a ferrule, and the bristles
  // splayed at the bottom left.
  brush: frame(
    svg`<path d="M16.6 3.4c.6.6.6 1.6 0 2.2l-6.2 6.2-2.2-2.2 6.2-6.2c.6-.6 1.6-.6 2.2 0z"></path><path d="M8.2 9.6l2.2 2.2"></path><path d="M8 10.2c-1.4-.1-2.6.6-3.1 1.8-.5 1.3-.3 2.8-1.6 3.9 2.2.5 4.2 0 5.3-1.1 1-1 1.3-2.4.7-3.5"></path>`
  ),
  rect: frame(svg`<rect x="4" y="5" width="12" height="10" rx="1"></rect>`),
  free: frame(svg`<path d="M4 8l6-4.5 6 4.5-2.3 7.5H6.3z" stroke-dasharray="2.5 2"></path>`),
  line: frame(
    svg`<path d="M5 15L15 5"></path><circle cx="5" cy="15" r="1.4"></circle><circle cx="15" cy="5" r="1.4"></circle>`
  ),
  click: frame(svg`<path d="M5 3.5l10.5 6.2-4.6 1.2-2.2 4.4z"></path>`),
};

// The ruler's modes: a line with its arrow, and a path stepping round.
const RULER_MODE_ICONS: Record<RulerMode, TemplateResult> = {
  line: frame(
    svg`<path d="M4 16L15.5 4.5"></path><path d="M10.5 4h5.5v5.5"></path><circle cx="4" cy="16" r="1.4"></circle>`
  ),
  path: frame(
    svg`<path d="M4 16h4v-5h4V6h4"></path><path d="M13.5 3.5L16 6l-2.5 2.5"></path><circle cx="4" cy="16" r="1.4"></circle>`
  ),
};

export function rulerIcon(mode: RulerMode): TemplateResult {
  return RULER_MODE_ICONS[mode];
}

export function inkIcon(ink: Ink): TemplateResult {
  return INK_ICONS[ink];
}

export function shapeIcon(shape: DrawShape): TemplateResult {
  return SHAPE_ICONS[shape];
}

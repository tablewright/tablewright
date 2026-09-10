// What a threshold of a given kind, state and size looks like on an edge,
// in the board's own language, as a preview in the palette: door posts,
// a leaf swung or a bar across, a lock, the teal of a window, the dashes
// of frosted glass or a secret. The board draws the real thing.

import { svg, type TemplateResult } from "lit";
import type { ThresholdChoice } from "@tablewright/board";

const LEFT = 12;
const RIGHT = 108;
const EDGE = 16;
const PAPER = "var(--tw-on-surface)";
const BRASS = "var(--tw-primary)";
const TEAL = "var(--tw-secondary)";
const GROUND = "var(--tw-surface-container-lowest)";

function line(width: number, stroke: string, dash = "none"): TemplateResult {
  return svg`<path d="M${LEFT} ${EDGE}H${RIGHT}" stroke=${stroke} stroke-width=${width} stroke-linecap="round" stroke-dasharray=${dash}></path>`;
}

// Door posts: the wall's ends, firm where the wall itself is faint.
const CAPS = svg`<path d="M${LEFT} ${EDGE - 7}V${EDGE + 7}M${RIGHT} ${EDGE - 7}V${EDGE + 7}" stroke=${PAPER} stroke-width="4" stroke-linecap="round"></path>`;

const LOCK = svg`<circle cx=${(LEFT + RIGHT) / 2} cy=${EDGE} r="5" fill=${BRASS}></circle><circle cx=${(LEFT + RIGHT) / 2} cy=${EDGE} r="2" fill=${GROUND}></circle>`;

/** A threshold as the board will draw it, 120 by 60. */
export function thresholdSwatch(choice: ThresholdChoice): TemplateResult {
  const parts: TemplateResult[] = [];
  if (choice.state === "secret") {
    // A wall to everyone who may not see it; to the DM, a wall with a hint.
    parts.push(line(3, PAPER), line(1.5, BRASS, "6 6"));
  } else if (choice.kind === "arch") {
    parts.push(CAPS);
  } else if (choice.kind === "window" || choice.kind === "frosted") {
    parts.push(line(choice.size === "large" ? 6 : 4, PAPER));
    parts.push(line(2, TEAL, choice.kind === "frosted" ? "5 5" : "none"));
    if (choice.state === "locked") {
      parts.push(LOCK);
    }
  } else {
    parts.push(CAPS);
    if (choice.state === "open") {
      // The leaf swung sixty degrees into the room.
      parts.push(
        svg`<path d="M${LEFT} ${EDGE}L${LEFT + 20} ${EDGE + 35}" stroke=${BRASS} stroke-width="3" stroke-linecap="round"></path>`
      );
    } else {
      parts.push(
        svg`<path d="M${LEFT + 8} ${EDGE}H${RIGHT - 8}" stroke=${BRASS} stroke-width="3" stroke-linecap="round"></path>`
      );
      if (choice.state === "locked") {
        parts.push(LOCK);
      }
    }
  }
  return svg`<svg width="120" height="60" viewBox="0 0 120 60" fill="none" aria-hidden="true">${parts}</svg>`;
}

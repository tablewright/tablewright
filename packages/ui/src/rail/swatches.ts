// What a threshold of a given kind, state and size looks like on an edge,
// in the board's own language, at icon size: it stands in for the click
// shape's glyph, so the tile shows what the click will leave. Door posts,
// a leaf swung or a bar across, a lock, the teal of a window, the dashes
// of frosted glass or a secret. The board draws the real thing.

import { svg, type TemplateResult } from "lit";
import type { ThresholdChoice } from "@tablewright/board";

const LEFT = 4;
const RIGHT = 24;
const EDGE = 11;
const PAPER = "var(--tw-on-surface)";
const BRASS = "var(--tw-primary)";
const TEAL = "var(--tw-secondary)";
const GROUND = "var(--tw-surface-container-lowest)";

function line(width: number, stroke: string, dash = "none"): TemplateResult {
  return svg`<path d="M${LEFT} ${EDGE}H${RIGHT}" stroke=${stroke} stroke-width=${width} stroke-linecap="round" stroke-dasharray=${dash}></path>`;
}

// Door posts: the wall's ends, firm where the wall itself is faint.
const CAPS = svg`<path d="M${LEFT} ${EDGE - 4}V${EDGE + 4}M${RIGHT} ${EDGE - 4}V${EDGE + 4}" stroke=${PAPER} stroke-width="2.5" stroke-linecap="round"></path>`;

const LOCK = svg`<circle cx=${(LEFT + RIGHT) / 2} cy=${EDGE} r="2.6" fill=${BRASS}></circle><circle cx=${(LEFT + RIGHT) / 2} cy=${EDGE} r="1" fill=${GROUND}></circle>`;

/** A threshold as the board will draw it, on a 28 px grid. */
export function thresholdSwatch(choice: ThresholdChoice): TemplateResult {
  const parts: TemplateResult[] = [];
  if (choice.state === "secret") {
    // A wall to everyone who may not see it; to the DM, a wall with a hint.
    parts.push(line(2, PAPER), line(1, BRASS, "3 3"));
  } else if (choice.kind === "arch") {
    parts.push(CAPS);
  } else if (choice.kind === "window" || choice.kind === "frosted") {
    parts.push(line(choice.size === "large" ? 3.5 : 2.5, PAPER));
    parts.push(line(1.5, TEAL, choice.kind === "frosted" ? "2.5 2.5" : "none"));
    if (choice.state === "locked") {
      parts.push(LOCK);
    }
  } else {
    parts.push(CAPS);
    if (choice.state === "open") {
      // The leaf swung sixty degrees into the room.
      parts.push(
        svg`<path d="M${LEFT} ${EDGE}L${LEFT + 8} ${EDGE + 14}" stroke=${BRASS} stroke-width="2" stroke-linecap="round"></path>`
      );
    } else {
      parts.push(
        svg`<path d="M${LEFT + 3} ${EDGE}H${RIGHT - 3}" stroke=${BRASS} stroke-width="2" stroke-linecap="round"></path>`
      );
      if (choice.state === "locked") {
        parts.push(LOCK);
      }
    }
  }
  return svg`<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">${parts}</svg>`;
}

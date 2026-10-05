// The desk's shared looks, for a component's own rules to take in: each is
// the declarations for inside a rule, except FOCUS_RING, which is a rule whole.

import { css } from "lit";

/** A panel's chrome: the outline, the panel's corners and its surface. */
export const PANEL_CHROME = css`
  border: 1px solid var(--tw-outline);
  border-radius: var(--tw-comp-panel-rounded);
  background: var(--tw-comp-panel-background-color);
`;

/** The quiet button: an outlined label on the desk, for every action but the one. */
export const QUIET_BUTTON = css`
  padding: var(--tw-comp-button-quiet-padding) var(--tw-space-md);
  border: 1px solid var(--tw-outline);
  border-radius: var(--tw-rounded-sm);
  background: var(--tw-comp-button-quiet-background-color);
  color: var(--tw-comp-button-quiet-text-color);
  font: var(--tw-comp-button-quiet-font);
  letter-spacing: var(--tw-typo-label-md-letter-spacing);
  cursor: pointer;
`;

/** How a quiet button lights under the pointer. */
export const QUIET_BUTTON_HOVER = css`
  background: var(--tw-surface-container-highest);
`;

/** A menu's item: borderless and left-aligned, lit only under the pointer. */
export const MENU_ITEM = css`
  border: 0;
  border-radius: var(--tw-rounded-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
`;

/** The focus ring's outline alone, for a rule that rings one kind of thing at an offset of its own. */
export const FOCUS_OUTLINE = css`
  outline: 2px solid var(--tw-focus-ring);
`;

/** The focus ring, as one rule for a whole shadow root. */
export const FOCUS_RING = css`
  :focus-visible {
    ${FOCUS_OUTLINE}
    outline-offset: 2px;
  }
`;

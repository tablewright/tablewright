/**
 * ─ Panel inputs ─
 *
 * The rows a panel is made of: a strip of choices under a caption, and a
 * number typed into a box or dragged along a slider, with its unit after
 * it. A strip and a field both report strings, so each is read back into
 * the typed value it was given before the panel hears it.
 */

import { html, nothing } from "lit";
import "../atoms/tw-strip.js";

// A strip given no labels reads its values as words.
const NO_LABELS: Readonly<Record<string, string>> = {};

// A number or a slider in a field: `change` hears the value as it is typed
// or dragged, and `release` hears a slider let go.
interface FieldSpec {
  readonly aria: string;
  readonly value: number;
  readonly unit: string;
  readonly min?: number;
  readonly max?: number;
  readonly step: number;
  readonly change: (next: number) => void;
  readonly release?: (next: number) => void;
}

interface RowSpec extends FieldSpec {
  readonly cap: string;
}

/** A strip of choices under its caption, which names the strip unless an `aria` says otherwise. */
export function stripRow<T extends string>(
  cap: string,
  values: readonly T[],
  pressed: T,
  apply: (value: T) => void,
  labels?: Readonly<Record<string, string>>,
  aria = cap
) {
  return html`<section>
    <span class="cap">${cap}</span>
    ${strip(aria, values, pressed, apply, labels)}
  </section>`;
}

/** The strip alone, for a section that holds more than one thing. */
export function strip<T extends string>(
  aria: string,
  values: readonly T[],
  pressed: T,
  apply: (value: T) => void,
  labels: Readonly<Record<string, string>> = NO_LABELS
) {
  return html`<tw-strip
    label=${aria}
    .values=${values}
    .labels=${labels}
    .pressed=${[pressed]}
    @tw-cell=${choose(values, apply)}
  ></tw-strip>`;
}

/** A number typed into a box, under its caption. */
export function numberRow({ cap, ...spec }: RowSpec) {
  return html`<section>
    <span class="cap">${cap}</span>
    ${field("number", spec)}
  </section>`;
}

/** A number dragged along a slider, under its caption. */
export function rangeRow({ cap, ...spec }: RowSpec) {
  return html`<section>
    <span class="cap">${cap}</span>
    ${field("range", spec)}
  </section>`;
}

/** The field alone, the box or the slider with its unit after it, for a section that holds more. */
export function field(
  kind: "number" | "range",
  { aria, value, unit, min, max, step, change, release }: FieldSpec
) {
  return html`<div class="field">
    <input
      class=${kind}
      type=${kind}
      min=${min ?? nothing}
      max=${max ?? nothing}
      step=${step}
      aria-label=${aria}
      .value=${String(value)}
      @input=${number(change, { min })}
      @change=${release === undefined ? nothing : number(release, { min })}
    />
    <span class="unit">${unit}</span>
  </div>`;
}

// A strip reports a value as a string; only one of the values it was
// given can come back, so the typed one is looked up rather than trusted.
function choose<T extends string>(values: readonly T[], apply: (value: T) => void) {
  return (event: HTMLElementEventMap["tw-cell"]): void => {
    const { value } = event.detail;
    const chosen = values.find((candidate) => candidate === value);
    if (chosen !== undefined) {
      apply(chosen);
    }
  };
}

// A number typed or dragged is taken as it comes; a field emptied or
// half-typed changes nothing until it reads as a number again, and nor
// does one under the field's floor.
function number(apply: (next: number) => void, { min }: { min?: number } = {}) {
  return (event: Event): void => {
    const next = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(next) && (min === undefined || next >= min)) {
      apply(next);
    }
  };
}

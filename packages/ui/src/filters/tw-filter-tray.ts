// The filter tray (design.md §3 "Linguistic search and filters"): one
// control per facet the system manifest declares for the category, of
// five kinds. A span rail paints spans over a short ordered scale; a
// switch rail is the same strip with each cell its own switch; a slider
// is two nuts on a long stepped scale; chips are a long unordered set;
// a select is the one exception. The tray shows two states at once: what
// the typed words selected, and what the tray itself holds, which wins
// for that control once a click lands on it. Tauri-agnostic: the host
// hands in the controls and the values, and hears `tw-filter` with the
// tray's whole state as `detail`.

import { LitElement, css, html, nothing } from "lit";
import type { Cell, ControlSpec, Stop } from "@tablewright/schema";
import { activeCount, besideIndex, cellKey, chipValues, valueText } from "./state.js";
import type { ControlState, TrayState, Tri } from "./state.js";

/** How many chips show before the rest fold behind "more". */
const CHIPS_SHOWN = 12;

export class TwFilterTray extends LitElement {
  static override properties = {
    label: { type: String },
    controls: { attribute: false },
    values: { attribute: false },
    state: { attribute: false },
    selection: { attribute: false },
    expanded: { state: true },
  };

  declare label: string;
  declare controls: ControlSpec[];
  /** Facet name to the values the data holds, for chips without stops. */
  declare values: Record<string, string[]>;
  /** What the tray itself holds. */
  declare state: TrayState;
  /** What the typed words selected; shown until the tray holds its own. */
  declare selection: TrayState;
  /** Chip controls unfolded past their first dozen, by control index. */
  declare expanded: number[];

  // A press on a rail cell, so dragging across the rail paints a span.
  #painting: { index: number; from: number } | undefined;

  constructor() {
    super();
    this.label = "";
    this.controls = [];
    this.values = {};
    this.state = {};
    this.selection = {};
    this.expanded = [];
  }

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-sizing: border-box;
      margin: var(--tw-space-xs) var(--tw-space-lg) var(--tw-space-sm);
      padding: 10px var(--tw-space-md) var(--tw-space-md);
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container);
      color: var(--tw-on-surface);
    }
    header,
    .flabel {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: var(--tw-on-surface-variant);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      text-transform: uppercase;
    }
    .flabel {
      margin-bottom: 5px;
      opacity: 0.85;
    }
    .clear {
      padding: 0;
      border: 0;
      background: none;
      color: var(--tw-primary);
      font: inherit;
      text-transform: none;
      letter-spacing: 0.04em;
      cursor: pointer;
    }
    button:focus-visible,
    select:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--tw-focus-ring);
      outline-offset: 1px;
    }
    .rail {
      display: flex;
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container-lowest, var(--tw-surface));
      overflow: hidden;
    }
    .cell {
      flex: 1 1 0;
      min-width: 0;
      margin: 0;
      padding: 5px 0;
      border: 0;
      border-right: 1px solid var(--tw-outline-variant);
      background: none;
      color: var(--tw-on-surface-variant);
      font-family: var(--tw-typo-numeric-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      user-select: none;
    }
    .cell:last-child {
      border-right: 0;
    }
    .cell.wide {
      flex-grow: 1.6;
    }
    .cell:hover {
      background: var(--tw-surface-container-high);
      color: var(--tw-on-surface);
    }
    .cell[aria-pressed="true"],
    .cell.on {
      background: var(--tw-primary);
      color: var(--tw-on-primary);
      font-weight: var(--tw-typo-label-md-font-weight);
    }
    .cell.not,
    .chip.not {
      color: var(--tw-on-surface);
      text-decoration: line-through;
      text-decoration-color: var(--tw-primary);
      text-decoration-thickness: 1.5px;
    }
    .rows {
      display: grid;
      grid-auto-flow: column;
      gap: 10px;
    }
    .cloud {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      padding: 3px 10px;
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container-high);
      color: var(--tw-on-surface-variant);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      white-space: nowrap;
      cursor: pointer;
    }
    .chip.on {
      background: var(--tw-primary);
      border-color: var(--tw-primary);
      color: var(--tw-on-primary);
    }
    .chip.more {
      background: none;
      border-style: dashed;
      color: var(--tw-primary);
    }
    select {
      width: 100%;
      box-sizing: border-box;
      padding: 5px 10px;
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container-lowest, var(--tw-surface));
      color: var(--tw-on-surface-variant);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
    }
    .slider {
      position: relative;
      padding: 6px 8px 16px;
    }
    .ticks {
      height: 10px;
      margin-bottom: -7px;
      background-image: linear-gradient(to right, var(--tw-outline-variant) 1px, transparent 1px);
      background-size: calc(100% / var(--n)) 100%;
    }
    .track {
      position: relative;
      height: 4px;
      border-radius: 2px;
      background: var(--tw-outline-variant);
    }
    .fill {
      position: absolute;
      top: 0;
      bottom: 0;
      background: var(--tw-primary);
      border-radius: 2px;
    }
    .thumbs {
      position: absolute;
      inset: -8px 0;
    }
    /* Two native ranges over one track: only their thumbs take the pointer,
       so the lower and the upper nut can each be dragged. */
    .thumbs input {
      position: absolute;
      inset: 0;
      width: 100%;
      margin: 0;
      background: none;
      pointer-events: none;
      -webkit-appearance: none;
      appearance: none;
    }
    .thumbs input::-webkit-slider-runnable-track {
      height: 20px;
      background: none;
    }
    .thumbs input::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      margin-top: 2px;
      background: var(--tw-primary);
      clip-path: polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
      pointer-events: auto;
      cursor: pointer;
    }
    .thumbs input.idle::-webkit-slider-thumb {
      background: var(--tw-on-surface-variant);
    }
    .labels {
      position: relative;
      height: 14px;
      margin-top: 8px;
      font-family: var(--tw-typo-numeric-md-font-family);
      font-size: 11px;
      line-height: 1.2;
      color: var(--tw-on-surface-variant);
    }
    .labels span {
      position: absolute;
      transform: translateX(-50%);
      white-space: nowrap;
    }
    .beside {
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }
    .beside .rail {
      flex: 0 0 116px;
    }
    .beside .slider {
      flex: 1 1 auto;
      padding-top: 4px;
    }
  `;

  protected override render() {
    const count = activeCount(this.state) + activeCount(this.selection);
    return html`
      <header>
        <span>Filters${this.label === "" ? "" : ` · ${this.label}`}</span>
        ${
          count === 0
            ? nothing
            : html`<button type="button" class="clear" @click=${this.#clear}>Clear</button>`
        }
      </header>
      ${this.controls.map((control, index) => this.#renderControl(control, index))}
    `;
  }

  // The tray's own state for a control wins; otherwise the words' selection.
  #shown(index: number): ControlState | undefined {
    return this.state[index] ?? this.selection[index];
  }

  #renderControl(control: ControlSpec, index: number) {
    const body = this.#renderBody(control, index);
    if (control.beside !== undefined && control.beside !== null) {
      return html`
        <div class="control">
          <div class="flabel"><span>${control.label}</span></div>
          <div class="beside">${this.#renderBody(control.beside, besideIndex(index))} ${body}</div>
        </div>
      `;
    }
    return html`
      <div class="control">
        <div class="flabel"><span>${control.label}</span></div>
        ${body}
      </div>
    `;
  }

  #renderBody(control: ControlSpec, index: number) {
    switch (control.control) {
      case "rail":
        return this.#renderRail(control, index);
      case "switch":
        return this.#renderSwitch(control, index);
      case "slider":
        return this.#renderSlider(control, index);
      case "chips":
        return this.#renderChips(control, index);
      case "select":
        return this.#renderSelect(control, index);
      default:
        return nothing;
    }
  }

  // A span rail: one click is exactly that value, a second click or a
  // drag the span between, Shift with a click extends, the same cell again
  // clears. Arrows move along it, Space chooses, Shift with arrows extends.
  #renderRail(control: ControlSpec, index: number) {
    const stops = control.stops ?? [];
    const shown = this.#shown(index);
    const cells = new Set(shown?.cells ?? []);
    const span = shown?.span;
    const focus = span?.[0] ?? shown?.cells?.[0] ?? 0;
    return html`
      <div class="rail" role="group" aria-label=${control.label}>
        ${stops.map((stop, at) => {
          const on = cells.has(at) || (span !== undefined && at >= span[0] && at <= span[1]);
          return html`
            <button
              type="button"
              class="cell ${labelOf(stop).length > 4 ? "wide" : ""}"
              aria-pressed=${on ? "true" : "false"}
              tabindex=${at === focus ? "0" : "-1"}
              @click=${(event: MouseEvent) => this.#pickStop(control, index, at, event.shiftKey)}
              @pointerdown=${() => {
                this.#painting = { index, from: at };
              }}
              @pointerenter=${(event: PointerEvent) => {
                if (this.#painting?.index === index && event.buttons === 1) {
                  const from = this.#painting.from;
                  this.#commit(index, { span: [Math.min(from, at), Math.max(from, at)] });
                }
              }}
              @pointerup=${() => {
                this.#painting = undefined;
              }}
              @keydown=${(event: KeyboardEvent) => this.#onRailKey(control, index, at, event)}
            >
              ${labelOf(stop)}
            </button>
          `;
        })}
      </div>
    `;
  }

  #pickStop(control: ControlSpec, index: number, at: number, extend: boolean): void {
    const own = this.state[index] ?? this.#shown(index);
    const span = own?.span;
    if (extend && span !== undefined) {
      this.#commit(index, { span: [Math.min(span[0], at), Math.max(span[1], at)] });
    } else if (span !== undefined && span[0] === at && span[1] === at) {
      this.#commit(index, {});
    } else if (span !== undefined && span[0] === span[1]) {
      this.#commit(index, { span: [Math.min(span[0], at), Math.max(span[0], at)] });
    } else {
      this.#commit(index, { span: [at, at] });
    }
    void control;
  }

  #onRailKey(control: ControlSpec, index: number, at: number, event: KeyboardEvent): void {
    const stops = control.stops ?? [];
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      event.stopPropagation();
      const next = Math.max(0, Math.min(stops.length - 1, at + step));
      if (event.shiftKey) {
        this.#pickStop(control, index, next, true);
      }
      const cells = this.renderRoot.querySelectorAll<HTMLButtonElement>(".cell");
      const rail = (event.currentTarget as HTMLElement).parentElement;
      const siblings = Array.from(cells).filter((cell) => cell.parentElement === rail);
      siblings[next]?.focus();
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      this.#pickStop(control, index, at, event.shiftKey);
    }
  }

  // A switch rail: each cell its own switch, off, on, not.
  #renderSwitch(control: ControlSpec, index: number) {
    const rows = control.cells ?? [];
    const shown = this.#shown(index);
    return html`
      <div class="rows">
        ${rows.map(
          (row) => html`
            <div class="rail" role="group" aria-label=${control.label}>
              ${row.map((cell) => {
                const key = cellKey(cell.facet, cell.value ?? true);
                const tri = shown?.tri?.[key] ?? "off";
                return html`
                  <button
                    type="button"
                    class="cell ${tri} ${cell.label.length > 8 ? "wide" : ""}"
                    aria-pressed=${tri === "on" ? "true" : tri === "not" ? "mixed" : "false"}
                    @click=${() => this.#cycle(index, key)}
                  >
                    ${cell.label}
                  </button>
                `;
              })}
            </div>
          `
        )}
      </div>
    `;
  }

  #cycle(index: number, key: string): void {
    const own = this.state[index] ?? this.#shown(index) ?? {};
    const tri = { ...own.tri };
    const next: Tri = tri[key] === "on" ? "not" : tri[key] === "not" ? "off" : "on";
    if (next === "off") {
      delete tri[key];
    } else {
      tri[key] = next;
    }
    this.#commit(index, { tri });
  }

  // Two nuts on a track whose stops the system declares. A nut left at an
  // end reads as open.
  #renderSlider(control: ControlSpec, index: number) {
    const stops = control.stops ?? [];
    const last = Math.max(0, stops.length - 1);
    const shown = this.#shown(index);
    const [lo, hi] = shown?.span ?? [0, last];
    const idle = shown?.span === undefined;
    const every = Math.max(1, Math.ceil(stops.length / 8));
    const percent = (at: number) => (last === 0 ? 0 : (at / last) * 100);
    const move = (event: Event) => {
      const inputs = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll("input");
      if (inputs === undefined || inputs.length < 2) {
        return;
      }
      const a = Number(inputs[0]?.value ?? 0);
      const b = Number(inputs[1]?.value ?? last);
      const [from, to] = a <= b ? [a, b] : [b, a];
      this.#commit(index, from === 0 && to === last ? {} : { span: [from, to] });
    };
    return html`
      <div class="slider">
        <div class="ticks" style=${`--n: ${Math.max(1, last)}`}></div>
        <div class="track">
          ${idle ? nothing : html`<div class="fill" style=${`left: ${percent(lo)}%; right: ${100 - percent(hi)}%`}></div>`}
          <div class="thumbs">
            <input
              type="range"
              class=${idle ? "idle" : ""}
              min="0"
              max=${last}
              step="1"
              .value=${String(lo)}
              aria-label=${`${control.label} from`}
              aria-valuetext=${labelOf(stops[lo])}
              @input=${move}
            />
            <input
              type="range"
              class=${idle ? "idle" : ""}
              min="0"
              max=${last}
              step="1"
              .value=${String(hi)}
              aria-label=${`${control.label} to`}
              aria-valuetext=${labelOf(stops[hi])}
              @input=${move}
            />
          </div>
        </div>
        <div class="labels">
          ${stops.map((stop, at) =>
            at % every === 0 || at === last
              ? html`<span style=${`left: ${percent(at)}%`}>${labelOf(stop)}</span>`
              : nothing
          )}
        </div>
      </div>
    `;
  }

  // Chips: a long unordered set, the common values first, the rest folded.
  #renderChips(control: ControlSpec, index: number) {
    const facet = control.facet ?? "";
    const values = chipValues(control, this.values);
    const shown = this.#shown(index);
    const unfolded = this.expanded.includes(index);
    const visible = unfolded ? values : values.slice(0, CHIPS_SHOWN);
    return html`
      <div class="cloud" role="group" aria-label=${control.label}>
        ${visible.map((value) => {
          const key = cellKey(facet, value);
          const tri = shown?.tri?.[key] ?? "off";
          return html`
            <button
              type="button"
              class="chip ${tri}"
              aria-pressed=${tri === "on" ? "true" : tri === "not" ? "mixed" : "false"}
              @click=${() => this.#cycle(index, key)}
            >
              ${titleCase(value)}
            </button>
          `;
        })}
        ${
          values.length > CHIPS_SHOWN && !unfolded
            ? html`<button
                type="button"
                class="chip more"
                @click=${() => {
                  this.expanded = [...this.expanded, index];
                }}
              >
                ${values.length - CHIPS_SHOWN} more
              </button>`
            : nothing
        }
      </div>
    `;
  }

  #renderSelect(control: ControlSpec, index: number) {
    const stops = control.stops ?? [];
    const shown = this.#shown(index);
    const pick = shown?.pick ?? "";
    return html`
      <select
        aria-label=${control.label}
        .value=${pick}
        @change=${(event: Event) => {
          const value = (event.target as HTMLSelectElement).value;
          this.#commit(index, value === "" ? {} : { pick: value });
        }}
      >
        <option value="">Any ${control.label.toLowerCase()}</option>
        ${stops.map(
          (stop) => html`
            <option value=${valueText(stop.value)} ?selected=${valueText(stop.value) === pick}>
              ${labelOf(stop)}
            </option>
          `
        )}
      </select>
    `;
  }

  #commit(index: number, next: ControlState): void {
    const state: TrayState = { ...this.state, [index]: next };
    this.state = state;
    this.dispatchEvent(
      new CustomEvent<TrayState>("tw-filter", { detail: state, bubbles: true, composed: true })
    );
  }

  #clear = (): void => {
    this.state = {};
    this.dispatchEvent(
      new CustomEvent<TrayState>("tw-filter", { detail: {}, bubbles: true, composed: true })
    );
  };
}

function labelOf(stop: Stop | undefined): string {
  if (stop === undefined) {
    return "";
  }
  return stop.label ?? valueText(stop.value);
}

function titleCase(text: string): string {
  return text
    .split(/[-\s]+/)
    .map((word, at) =>
      at === 0 && word.length > 0 ? word[0]?.toUpperCase() + word.slice(1) : word
    )
    .join(" ");
}

export type { Cell };

customElements.define("tw-filter-tray", TwFilterTray);

declare global {
  interface HTMLElementTagNameMap {
    "tw-filter-tray": TwFilterTray;
  }
}

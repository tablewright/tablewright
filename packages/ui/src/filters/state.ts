// The tray's state and how it turns into filters (design.md §3 "Linguistic
// search and filters"). Pure functions over the controls the system
// manifest declares, so the rules are unit-tested without a DOM. Two
// states exist side by side: what the tray itself holds, and what the
// typed words selected, which the tray only shows until a click on that
// control makes the tray's own state win.

import type { ControlSpec, FacetValue, Filter, Understood } from "@tablewright/schema";

/** A cell of a switch rail or a chip: off is "don't care". */
export type Tri = "off" | "on" | "not";

/** One control's state. Which field applies follows the control's kind. */
export interface ControlState {
  /** Rail or slider: the chosen stops, as indices, both ends in. */
  span?: [number, number];
  /** Rail with several separate cells on ("level 3 or 5"): stop indices. */
  cells?: number[];
  /** Switch rail or chips: the state of each cell, by `cellKey`. */
  tri?: Record<string, Tri>;
  /** Select: the chosen value, as text. */
  pick?: string;
}

/** Control index to its state; an absent index is an untouched control. */
export type TrayState = Record<number, ControlState>;

/** A facet value as a filter carries it, and as a cell is keyed. */
export function valueText(value: FacetValue): string {
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value ?? "";
}

/** The key of a switch cell or chip: its facet and value. */
export function cellKey(facet: string, value: FacetValue | string): string {
  return `${facet}=${typeof value === "string" ? value : valueText(value)}`;
}

/** Whether a control has any state that filters. */
export function isActive(state: ControlState | undefined): boolean {
  if (state === undefined) {
    return false;
  }
  return (
    state.span !== undefined ||
    (state.cells !== undefined && state.cells.length > 0) ||
    (state.tri !== undefined && Object.values(state.tri).some((tri) => tri !== "off")) ||
    (state.pick !== undefined && state.pick !== "")
  );
}

/** How many controls filter. */
export function activeCount(state: TrayState): number {
  return Object.values(state).filter(isActive).length;
}

/** The chip values a control offers: its declared stops, else the facet's values from the data. */
export function chipValues(
  control: ControlSpec,
  values: Readonly<Record<string, string[]>>
): string[] {
  if (control.stops !== undefined && control.stops.length > 0) {
    return control.stops.map((stop) => valueText(stop.value));
  }
  const facet = facetOf(control);
  return facet === undefined ? [] : (values[facet] ?? []);
}

/** The filters a tray state stands for, in control order. */
export function filtersOf(controls: readonly ControlSpec[], state: TrayState): Filter[] {
  const filters: Filter[] = [];
  controls.forEach((control, index) => {
    const own = state[index];
    if (own === undefined) {
      return;
    }
    filters.push(...controlFilters(control, own));
    if (control.beside !== undefined && control.beside !== null) {
      const beside = state[besideIndex(index)];
      if (beside !== undefined) {
        filters.push(...controlFilters(control.beside, beside));
      }
    }
  });
  return filters;
}

/** A control's `beside` is addressed as its index plus a large offset. */
export function besideIndex(index: number): number {
  return index + 1000;
}

function controlFilters(control: ControlSpec, state: ControlState): Filter[] {
  const facet = facetOf(control);
  const stops = control.stops ?? [];
  switch (control.control) {
    case "rail":
    case "slider": {
      if (facet === undefined) {
        return [];
      }
      // Cells apart read as either of them; a run of adjacent cells is a
      // span, and a span reads as bounds.
      let span = state.span;
      if (state.cells !== undefined && state.cells.length > 0) {
        const cells = [...state.cells].sort((a, b) => a - b);
        const first = cells[0] ?? 0;
        const last = cells[cells.length - 1] ?? first;
        if (last - first + 1 !== cells.length) {
          return [any(cells.map((at) => eq(facet, valueText(stops[at]?.value ?? null))))];
        }
        span = [first, last];
      }
      if (span === undefined) {
        return [];
      }
      const [lo, hi] = span;
      const ordered = stops.every((stop) => typeof stop.value === "number");
      if (!ordered) {
        return [any(stops.slice(lo, hi + 1).map((stop) => eq(facet, valueText(stop.value))))];
      }
      const filters: Filter[] = [];
      const low = stops[lo];
      const high = stops[hi];
      if (lo === hi && low !== undefined) {
        return [eq(facet, valueText(low.value))];
      }
      if (lo > 0 && low !== undefined) {
        filters.push({ filter: "facet", name: facet, compare: "ge", value: valueText(low.value) });
      }
      if (hi < stops.length - 1 && high !== undefined) {
        filters.push({ filter: "facet", name: facet, compare: "le", value: valueText(high.value) });
      }
      return filters;
    }
    case "switch":
    case "chips": {
      const tri = state.tri ?? {};
      const on: Filter[] = [];
      const not: Filter[] = [];
      for (const [key, value] of Object.entries(tri)) {
        const at = key.indexOf("=");
        const name = key.slice(0, at);
        const text = key.slice(at + 1);
        if (value === "on") {
          on.push(eq(name, text));
        } else if (value === "not") {
          not.push({ filter: "not", item: eq(name, text) });
        }
      }
      const filters: Filter[] = [];
      if (on.length > 0) {
        filters.push(any(on));
      }
      return filters.concat(not);
    }
    case "select":
      return facet === undefined || state.pick === undefined || state.pick === ""
        ? []
        : [eq(facet, state.pick)];
    default:
      return [];
  }
}

function eq(name: string, value: string): Filter {
  return { filter: "facet", name, compare: "eq", value };
}

function any(items: Filter[]): Filter {
  return items.length === 1 && items[0] !== undefined ? items[0] : { filter: "any", items };
}

/**
 * What the typed words selected, as tray state: a display the tray shows
 * until its own state for that control takes over. Only filters the
 * parser read from the text, not the tray's own, reach here.
 */
export function selectionOf(
  controls: readonly ControlSpec[],
  understood: readonly Understood[]
): TrayState {
  const state: TrayState = {};
  for (const item of understood) {
    if (item.filter === null || item.filter === undefined || item.overruled) {
      continue;
    }
    for (const leaf of leaves(item.filter)) {
      controls.forEach((control, index) => {
        apply(control, index, leaf, state);
        if (control.beside !== undefined && control.beside !== null) {
          apply(control.beside, besideIndex(index), leaf, state);
        }
      });
    }
  }
  return state;
}

interface Leaf {
  name: string;
  compare: "eq" | "lt" | "le" | "gt" | "ge";
  value: string;
  negated: boolean;
}

// The facet comparisons inside a filter, with negation carried down.
function leaves(filter: Filter, negated = false): Leaf[] {
  switch (filter.filter) {
    case "facet":
      return [{ name: filter.name, compare: filter.compare, value: filter.value, negated }];
    case "any":
      return filter.items.flatMap((item) => leaves(item, negated));
    case "not":
      return leaves(filter.item, !negated);
    default:
      return [];
  }
}

function apply(control: ControlSpec, index: number, leaf: Leaf, state: TrayState): void {
  if (facetOf(control) !== undefined && facetOf(control) !== leaf.name) {
    return;
  }
  const stops = control.stops ?? [];
  switch (control.control) {
    case "rail":
    case "slider": {
      if (facetOf(control) === undefined || leaf.negated) {
        return;
      }
      const at = stopIndex(stops, leaf.value);
      if (at === undefined) {
        return;
      }
      const last = stops.length - 1;
      const own = (state[index] ??= {});
      const span: [number, number] | undefined =
        leaf.compare === "eq"
          ? [at, at]
          : leaf.compare === "le"
            ? [0, at]
            : leaf.compare === "lt"
              ? at > 0
                ? [0, at - 1]
                : undefined
              : leaf.compare === "ge"
                ? [at, last]
                : at < last
                  ? [at + 1, last]
                  : undefined;
      if (span === undefined) {
        return;
      }
      if (own.span === undefined) {
        own.span = span;
      } else {
        // Several equalities on one rail ("level 3 or 5") are separate cells;
        // two bounds on it meet in the middle ("between 1 and 3").
        const [lo, hi] = own.span;
        if (leaf.compare === "eq" && lo === hi && span[0] === span[1] && span[0] !== lo) {
          own.cells = [...(own.cells ?? [lo]), span[0]];
          delete own.span;
        } else {
          own.span = [Math.max(lo, span[0]), Math.min(hi, span[1])];
        }
      }
      return;
    }
    case "switch":
    case "chips": {
      if (leaf.compare !== "eq") {
        return;
      }
      const cells = control.cells ?? [];
      const known =
        control.control === "switch"
          ? cells
              .flat()
              .some(
                (cell) => cell.facet === leaf.name && valueText(cell.value ?? true) === leaf.value
              )
          : facetOf(control) === leaf.name;
      if (!known) {
        return;
      }
      const own = (state[index] ??= {});
      own.tri ??= {};
      own.tri[cellKey(leaf.name, leaf.value)] = leaf.negated ? "not" : "on";
      return;
    }
    case "select": {
      if (leaf.compare !== "eq" || leaf.negated) {
        return;
      }
      const own = (state[index] ??= {});
      own.pick = leaf.value;
      break;
    }
    default:
      break;
  }
}

// The index of the stop a filter value names: numbers compare as numbers,
// so "1/4" finds 0.25 and "3" finds 3.
function stopIndex(stops: readonly { value: FacetValue }[], value: string): number | undefined {
  const number = numberOf(value);
  const at = stops.findIndex((stop) =>
    typeof stop.value === "number" && number !== undefined
      ? Math.abs(stop.value - number) < 1e-9
      : valueText(stop.value) === value
  );
  return at < 0 ? undefined : at;
}

function numberOf(value: string): number | undefined {
  const slash = value.indexOf("/");
  if (slash > 0) {
    const numerator = Number(value.slice(0, slash));
    const denominator = Number(value.slice(slash + 1));
    return Number.isFinite(numerator) && denominator !== 0 ? numerator / denominator : undefined;
  }
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) ? number : undefined;
}

/** The facet a control edits, with the manifest's absent and null read alike. */
export function facetOf(control: ControlSpec): string | undefined {
  return control.facet === null || control.facet === undefined ? undefined : control.facet;
}

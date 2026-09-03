import { describe, expect, test } from "bun:test";
import type { ControlSpec, Understood } from "@tablewright/schema";
import {
  activeCount,
  besideIndex,
  cellKey,
  chipValues,
  filtersOf,
  selectionOf,
  valueText,
} from "../src/filters/state.js";

const level: ControlSpec = {
  control: "rail",
  label: "Level",
  facet: "level",
  stops: [{ value: 0, label: "Cantrip" }, { value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }],
  cells: [],
};
const school: ControlSpec = {
  control: "chips",
  label: "School",
  facet: "school",
  stops: [],
  cells: [],
};
const casting: ControlSpec = {
  control: "switch",
  label: "Casting",
  stops: [],
  cells: [
    [
      { facet: "ritual", value: true, label: "Ritual" },
      { facet: "material", value: true, label: "Material" },
    ],
  ],
};
const rarity: ControlSpec = {
  control: "rail",
  label: "Rarity",
  facet: "rarity",
  stops: [{ value: "common" }, { value: "rare" }, { value: "very-rare" }, { value: "legendary" }],
  cells: [],
};
const range: ControlSpec = {
  control: "slider",
  label: "Range",
  facet: "range",
  stops: [{ value: 5 }, { value: 30 }, { value: 60 }, { value: 120 }],
  cells: [],
  beside: {
    control: "switch",
    label: "",
    stops: [],
    cells: [[{ facet: "range_kind", value: "self", label: "Self" }]],
  },
};
const duration: ControlSpec = {
  control: "select",
  label: "Duration",
  facet: "duration",
  stops: [{ value: "instantaneous" }, { value: "1 minute" }],
  cells: [],
};
const controls = [level, school, casting, rarity, range, duration];

describe("filtersOf", () => {
  test("a rail span over numbers is two bounds, one cell is an equality", () => {
    expect(filtersOf(controls, { 0: { span: [1, 3] } })).toEqual([
      { filter: "facet", name: "level", compare: "ge", value: "1" },
      { filter: "facet", name: "level", compare: "le", value: "3" },
    ]);
    expect(filtersOf(controls, { 0: { span: [2, 2] } })).toEqual([
      { filter: "facet", name: "level", compare: "eq", value: "2" },
    ]);
  });

  test("a span that reaches an end is open there", () => {
    expect(filtersOf(controls, { 0: { span: [0, 2] } })).toEqual([
      { filter: "facet", name: "level", compare: "le", value: "2" },
    ]);
    expect(filtersOf(controls, { 0: { span: [3, 4] } })).toEqual([
      { filter: "facet", name: "level", compare: "ge", value: "3" },
    ]);
  });

  test("a rail over words is any of the words in the span", () => {
    expect(filtersOf(controls, { 3: { span: [1, 3] } })).toEqual([
      {
        filter: "any",
        items: [
          { filter: "facet", name: "rarity", compare: "eq", value: "rare" },
          { filter: "facet", name: "rarity", compare: "eq", value: "very-rare" },
          { filter: "facet", name: "rarity", compare: "eq", value: "legendary" },
        ],
      },
    ]);
  });

  test("switch cells and chips: on means any of them, not means none of it", () => {
    const tri = {
      [cellKey("ritual", true)]: "on" as const,
      [cellKey("material", true)]: "not" as const,
    };
    expect(filtersOf(controls, { 2: { tri } })).toEqual([
      { filter: "facet", name: "ritual", compare: "eq", value: "true" },
      { filter: "not", item: { filter: "facet", name: "material", compare: "eq", value: "true" } },
    ]);
    const chips = {
      [cellKey("school", "evocation")]: "on" as const,
      [cellKey("school", "necromancy")]: "on" as const,
    };
    expect(filtersOf(controls, { 1: { tri: chips } })).toEqual([
      {
        filter: "any",
        items: [
          { filter: "facet", name: "school", compare: "eq", value: "evocation" },
          { filter: "facet", name: "school", compare: "eq", value: "necromancy" },
        ],
      },
    ]);
  });

  test("the control beside a slider carries its own filters", () => {
    const state = {
      4: { span: [1, 2] as [number, number] },
      [besideIndex(4)]: { tri: { [cellKey("range_kind", "self")]: "on" as const } },
    };
    expect(filtersOf(controls, state)).toEqual([
      { filter: "facet", name: "range", compare: "ge", value: "30" },
      { filter: "facet", name: "range", compare: "le", value: "60" },
      { filter: "facet", name: "range_kind", compare: "eq", value: "self" },
    ]);
  });

  test("a select is one equality, and an empty state filters nothing", () => {
    expect(filtersOf(controls, { 5: { pick: "1 minute" } })).toEqual([
      { filter: "facet", name: "duration", compare: "eq", value: "1 minute" },
    ]);
    expect(filtersOf(controls, {})).toEqual([]);
    expect(activeCount({ 0: {}, 5: { pick: "" } })).toBe(0);
    expect(activeCount({ 0: { span: [0, 0] }, 1: { tri: { a: "on" } } })).toBe(2);
  });
});

describe("selectionOf", () => {
  const said = (filter: Understood["filter"], overruled = false): Understood => ({
    start: 0,
    end: 1,
    filter,
    overruled,
  });

  test("bounds paint a span, an equality one cell, a range meets in the middle", () => {
    expect(
      selectionOf(controls, [said({ filter: "facet", name: "level", compare: "lt", value: "3" })])
    ).toEqual({
      0: { span: [0, 2] },
    });
    expect(
      selectionOf(controls, [said({ filter: "facet", name: "level", compare: "eq", value: "3" })])
    ).toEqual({
      0: { span: [3, 3] },
    });
    expect(
      selectionOf(controls, [
        said({ filter: "facet", name: "level", compare: "ge", value: "1" }),
        said({ filter: "facet", name: "level", compare: "le", value: "3" }),
      ])
    ).toEqual({ 0: { span: [1, 3] } });
  });

  test("two equalities on one rail are separate cells", () => {
    expect(
      selectionOf(controls, [
        said({
          filter: "any",
          items: [
            { filter: "facet", name: "level", compare: "eq", value: "1" },
            { filter: "facet", name: "level", compare: "eq", value: "3" },
          ],
        }),
      ])
    ).toEqual({ 0: { cells: [1, 3] } });
  });

  test("values light chips and switch cells, not flips them, a select picks", () => {
    expect(
      selectionOf(controls, [
        said({ filter: "facet", name: "school", compare: "eq", value: "evocation" }),
        said({
          filter: "not",
          item: { filter: "facet", name: "ritual", compare: "eq", value: "true" },
        }),
        said({ filter: "facet", name: "duration", compare: "eq", value: "1 minute" }),
      ])
    ).toEqual({
      1: { tri: { [cellKey("school", "evocation")]: "on" } },
      2: { tri: { [cellKey("ritual", "true")]: "not" } },
      5: { pick: "1 minute" },
    });
  });

  test("overruled words and words no control knows select nothing", () => {
    expect(
      selectionOf(controls, [
        said({ filter: "facet", name: "level", compare: "eq", value: "3" }, true),
        said({ filter: "facet", name: "cr", compare: "ge", value: "5" }),
        said(null),
      ])
    ).toEqual({});
  });
});

describe("helpers", () => {
  test("values print as the filter compares them", () => {
    expect(valueText(0.25)).toBe("0.25");
    expect(valueText(true)).toBe("true");
    expect(valueText("very-rare")).toBe("very-rare");
    expect(chipValues(school, { school: ["abjuration", "evocation"] })).toEqual([
      "abjuration",
      "evocation",
    ]);
    expect(chipValues(rarity, {})).toEqual(["common", "rare", "very-rare", "legendary"]);
  });
});

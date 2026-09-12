/**
 * ─ The mansion ─
 *
 * The Drawing Room mock's mansion, laid out for the tavern's twenty by
 * fifteen cells: two wings either side of a corridor, a dais hall with
 * arches and stairs, a locked door, windows in the outer walls, a
 * secret door to the gallery, a pit, and a gallery raised over the
 * hall and open to it as a ledge, so a drop is one way down. The
 * reference drawing behind the topology tests and the table's
 * "Draw the mansion" button.
 */

import type {
  CellRect,
  Edge,
  GroundState,
  OpeningSize,
  Stroke,
  ThresholdKind,
  ThresholdState,
} from "@tablewright/schema";

const rect = (col0: number, row0: number, col1: number, row1: number): CellRect => ({
  col0,
  row0,
  col1,
  row1,
});
const east = (col: number, row: number): Edge => ({ col, row, side: "east" });
const south = (col: number, row: number): Edge => ({ col, row, side: "south" });

// Ground at a height is one stroke: it converts the cells and raises them
// together, so a platform needs no second pass with the Height pen.
function ground(state: GroundState, block: CellRect, at: number | null = null): Stroke {
  return {
    ink: "ground",
    shape: { kind: "rect", rect: block },
    state,
    height: at,
    look: "both",
    visibility: "party",
  };
}

function walls(block: CellRect): Stroke {
  return { ink: "wall", shape: { kind: "rect", rect: block }, look: "both", visibility: "party" };
}

// A secret door is the DM's, as the core would make it on adding.
function threshold(
  kind: ThresholdKind,
  state: ThresholdState,
  edge: Edge,
  size: OpeningSize = "small"
): Stroke {
  return {
    ink: "threshold",
    edge,
    kind,
    state,
    size,
    look: "both",
    visibility: state === "secret" ? "dm" : "party",
  };
}

function height(value: number, block: CellRect): Stroke {
  return { ink: "height", shape: { kind: "rect", rect: block }, value, visibility: "party" };
}

/** The mansion as the strokes a DM would have drawn over its picture. */
export function mansionStrokes(): Stroke[] {
  return [
    ground("ground", rect(1, 1, 10, 13)),
    ground("ground", rect(11, 1, 18, 13)),
    walls(rect(1, 1, 8, 11)),
    walls(rect(9, 1, 10, 11)),
    walls(rect(11, 1, 18, 6)),
    walls(rect(11, 7, 18, 11)),
    walls(rect(1, 12, 18, 13)),
    threshold("door", "open", east(8, 7)),
    threshold("door", "locked", east(10, 3)),
    threshold("door", "open", east(10, 9)),
    threshold("door", "closed", south(15, 6)),
    threshold("arch", "open", south(4, 11)),
    threshold("arch", "open", south(5, 11)),
    threshold("door", "open", south(9, 11)),
    threshold("arch", "open", east(8, 1)),
    threshold("arch", "open", east(8, 2)),
    threshold("window", "closed", east(18, 2), "large"),
    threshold("frosted", "closed", east(18, 3)),
    threshold("window", "closed", east(0, 6)),
    threshold("door", "secret", south(16, 11)),
    // The dais: one stroke, ground at +10, where it took two before.
    ground("ground", rect(1, 1, 8, 2), 10),
    {
      ink: "level-change",
      look: "both",
      shape: {
        kind: "brush",
        points: [
          { x: 9.5, y: 1.5 },
          { x: 10.5, y: 1.5 },
          { x: 9.5, y: 2.5 },
          { x: 10.5, y: 2.5 },
        ],
        radius: 0.6,
      },
      visibility: "party",
    },
    height(-10, rect(14, 9, 15, 10)),
    height(5, rect(11, 12, 18, 13)),
    ground("difficult", rect(4, 12, 5, 13)),
    ground("air", rect(15, 2, 16, 3)),
  ];
}

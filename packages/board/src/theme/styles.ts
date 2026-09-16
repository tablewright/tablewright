/**
 * ─ Styles from the theme ─
 *
 * Each layer draws from a few of the theme's colours and faces, named
 * for what the layer calls them. The mapping lives here, once, so a
 * layer's default and the host's theme switch read the same table.
 * Design: docs/design.md §5, token bridge.
 */

import type { AreaStyle } from "../area/area-layer.js";
import type { DrawStyle } from "../draw/draw-layer.js";
import type { RulerStyle } from "../ruler/measure-view.js";
import type { TokenStyle } from "../tokens/token-sprite.js";
import type { HeightStyle } from "../topology/height-layer.js";
import type { NumbersStyle } from "../topology/numbers-layer.js";
import type { TopologyStyle } from "../topology/topology-layer.js";
import type { BoardTheme } from "./board-theme.js";

/** The token layer's colours and faces. */
export function tokenStyle(theme: BoardTheme): TokenStyle {
  return {
    fill: theme.token,
    label: theme.tokenLabel,
    ring: theme.tokenRing,
    hover: theme.hover,
    selection: theme.selection,
    labelFace: theme.labels,
    figureFace: theme.figures,
  };
}

/** The topology layer's colours. */
export function topologyStyle(theme: BoardTheme): TopologyStyle {
  return {
    ground: theme.ground,
    floor: theme.floor,
    wall: theme.wall,
    threshold: theme.threshold,
    sight: theme.sight,
    difficult: theme.difficult,
    air: theme.air,
    hover: theme.hover,
  };
}

/** The drawing tool's colours: the hover for its preview, the threshold's brass for its ink. */
export function drawStyle(theme: BoardTheme): DrawStyle {
  return { hover: theme.hover, ink: theme.threshold };
}

/** The ruler's colours and faces, which a token's drag draws through too. */
export function rulerStyle(theme: BoardTheme): RulerStyle {
  return {
    line: theme.ruler,
    dash: theme.selection,
    beyond: theme.beyond,
    ground: theme.ground,
    face: theme.figures,
    marks: theme.marks,
  };
}

/** The Topology view's colours and face. */
export function numbersStyle(theme: BoardTheme): NumbersStyle {
  return {
    ground: theme.ground,
    up: theme.heightUp,
    down: theme.heightDown,
    stair: theme.threshold,
    face: theme.figures,
  };
}

/** The area layer's colours and face. */
export function areaStyle(theme: BoardTheme): AreaStyle {
  return { ground: theme.ground, line: theme.ruler, caught: theme.selection, face: theme.figures };
}

/** The height display's colours and face. */
export function heightStyle(theme: BoardTheme): HeightStyle {
  return {
    ground: theme.ground,
    shade: theme.heightShade,
    line: theme.heightLine,
    up: theme.heightUp,
    down: theme.heightDown,
    tag: theme.heightTag,
    face: theme.figures,
  };
}

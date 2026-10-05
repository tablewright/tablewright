import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  REFERENCE_SCENES,
  allows,
  defaultArea,
  isArea,
  worked,
  type PlayTool,
} from "@tablewright/board";
import type { MapImage, Scene } from "@tablewright/schema";
import { IS_DESKTOP } from "../core/core.js";
import { raise } from "./desk.js";
import { attempt, reasonOf, showNotice } from "../shell/notice.js";
import type { Table } from "../shell/table.js";

// A scene keeps its picture by a path within the campaign's folder, which only
// a Tauri window reaches, through the asset protocol; an address loads as it is.
function mapUrlOf(map: MapImage | null, campaignPath: string | undefined): string | undefined {
  if (map === null) {
    return undefined;
  }
  // A scheme of two letters or more: http, asset, data, file. One letter is
  // a Windows drive, which is a path.
  const isAddress = /^[a-z][a-z0-9+.-]+:/i.test(map.url);
  if (isAddress || campaignPath === undefined || !IS_DESKTOP) {
    return map.url;
  }
  return convertFileSrc(`${campaignPath}/${map.url}`);
}

/**
 * Show the core's scene on the board and in the chrome. A move the core
 * refuses is undone by showing the scene as it stands.
 */
export function showScene(table: Table, scene: Scene): void {
  const { board } = table;
  const { scenesTab, toolRail, readoutBox } = table.page;
  board.setScene(scene, mapUrlOf(scene.map, table.campaign()?.path));
  scenesTab.current = scene.id;
  toolRail.strokes = scene.strokes;
  toolRail.cellPx = scene.grid.cell_size;
  toolRail.display = scene.display;
  toolRail.rule = board.gridRule;
  readoutBox.unit = board.gridRule.unit;
}

/** List the campaign's scenes in the scene tab again. */
export async function refreshScenes(table: Table): Promise<void> {
  table.page.scenesTab.scenes = await table.core.listScenes();
}

/** Opening a picture gives it to the scene on show, sized as it loaded. */
export async function openMap(table: Table): Promise<void> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Map images", extensions: ["png", "jpg", "jpeg", "webp", "svg"] }],
  });
  if (path === null) {
    return;
  }
  try {
    const size = await table.board.loadMap(convertFileSrc(path));
    showScene(
      table,
      await table.core.setMap({ url: path, width: size.width, height: size.height })
    );
  } catch (error) {
    showNotice(`Could not load ${path}: ${reasonOf(error)}. Use a PNG, JPEG, WebP, or SVG image.`);
  }
}

/**
 * Play has two hands, moving and measuring. The rail and the R key swap
 * them, for the DM and for a player, who has no rail. The rail keeps which
 * is in hand, shown or not.
 */
export function setPlay(table: Table, tool: PlayTool): void {
  table.board.setPlayTool(tool);
  table.page.toolRail.play = tool;
}

/**
 * How the scene shows its heights is the scene's; reading it as numbers is
 * the DM's own, so it is kept on the rail and the board, never on the scene.
 */
export function setTopology(table: Table, on: boolean): void {
  table.board.setTopologyView(on);
  table.page.toolRail.topology = on;
}

/** Take the last stroke back. */
export function undo(table: Table): void {
  attempt("undo the stroke", async () => showScene(table, await table.core.undoStroke()));
}

/** The scene's own listeners: the scene tab, what the board reports, the rail's hands, and a token's menu. */
export function wireScene(table: Table): void {
  const { core, board } = table;
  const { scenesTab, toolRail, dashAsk, tokenMenu, entryView, openButton, readoutBox } = table.page;
  scenesTab.references = REFERENCE_SCENES.map((reference) => reference.name);
  scenesTab.addEventListener("click", () => {
    const chrome = scenesTab.parentElement;
    if (chrome !== null) {
      raise(chrome);
    }
  });
  scenesTab.addEventListener("tw-scene-open", (event) => {
    const { id } = event.detail;
    attempt("open the scene", async () => showScene(table, await core.openScene(id)));
  });
  // A new scene is blank, or a reference drawing's strokes as the core
  // would take them one by one; either way it opens at once.
  scenesTab.addEventListener("tw-scene-create", (event) => {
    const { name, reference } = event.detail;
    attempt(`create ${name}`, async () => {
      const drawing = REFERENCE_SCENES.find((candidate) => candidate.name === reference);
      showScene(table, await core.createScene(name, drawing?.strokes() ?? []));
      await refreshScenes(table);
    });
  });
  // The one question a move asks stands in a bar under the board while the
  // token waits at its destination; either answer takes it away.
  board.onDashAsk((ask) => {
    if (ask === undefined) {
      dashAsk.hidden = true;
      return;
    }
    dashAsk.cost = ask.cost;
    dashAsk.left = ask.left;
    dashAsk.unit = ask.unit;
    dashAsk.hidden = false;
  });
  dashAsk.addEventListener("tw-dash", (event) => {
    board.answerDash(event.detail.use);
  });
  board.onTokenMove(({ id, cell, facing }) => {
    void (async () => {
      try {
        showScene(table, await core.moveToken(id, cell.col, cell.row, facing));
      } catch (error) {
        showNotice(`Could not move ${id}: ${reasonOf(error)}`);
        showScene(table, await core.scene());
      }
    })();
  });
  // Placing stands the creature on the cell under the middle of the view;
  // dragging it to a cell arrives with the desk surfaces.
  entryView.addEventListener("tw-place", (event) => {
    const entry = event.detail;
    const cell = board.centerCell();
    attempt(`place ${entry.name}`, async () =>
      showScene(table, await core.placeEntry(entry, cell.col, cell.row))
    );
  });
  openButton.addEventListener("click", () => void openMap(table));
  // The rail is the DM's hand: an ink held is a pen held, the board draws
  // with it and the tokens go inert.
  const applyTool = (event: HTMLElementEventMap["tw-tool"]): void => {
    const { tool } = event.detail;
    if (tool !== undefined) {
      raise(toolRail);
    }
    board.setBuildTool(tool);
  };
  toolRail.addEventListener("tw-tool", applyTool);
  toolRail.addEventListener("tw-play", (event) => {
    setPlay(table, event.detail.tool);
  });
  // The column's last three items lay an area down. Picking one hands the
  // board the area it would lay, so the board has sizes before the first
  // press; leaving them takes whatever was on the board off it.
  toolRail.addEventListener("tw-ruler", (event) => {
    const { mode } = event.detail;
    board.setRulerMode(mode);
    if (isArea(mode)) {
      const area = mode === toolRail.area.kind ? toolRail.area : defaultArea(mode, toolRail.rule);
      toolRail.area = area;
      board.setArea(area);
    } else {
      board.setArea(undefined);
    }
  });
  toolRail.addEventListener("tw-snap", (event) => {
    board.setOriginSnap(event.detail.snap);
  });
  // Who what this hand puts down is for.
  toolRail.addEventListener("tw-marking", (event) => {
    board.setMarking(event.detail.marking);
  });
  // The right button on a token asks what may be done with it. Only a
  // hand that may keep things back has anything to ask.
  let asked: string | undefined;
  board.onTokenAsk((ask) => {
    if (!allows(table.seat().role, "scene:hide")) {
      return;
    }
    asked = ask.id;
    tokenMenu.open(ask.at, ask.kept);
  });
  tokenMenu.addEventListener("tw-token-mark", (event) => {
    const { visibility } = event.detail;
    const id = asked;
    if (id === undefined) {
      return;
    }
    attempt("change who sees the token", async () =>
      showScene(table, await core.setTokenVisibility(id, visibility))
    );
  });
  // Who the next measure or area is for; it marks the one on the board too, so
  // what is down is shared by saying so.
  toolRail.addEventListener("tw-seen", (event) => {
    board.chooseSeenBy(event.detail.seen);
  });
  toolRail.addEventListener("tw-area", (event) => {
    board.setArea(event.detail.area);
  });
  // Turning an area also reaches: the palette's own numbers follow the
  // pointer, so the field and the board never disagree.
  board.onArea((placed) => {
    if (placed !== undefined) {
      toolRail.area = placed.area;
      toolRail.seen = placed.seenBy;
    }
  });
  // A measure carries its own choice too, Alt's as much as the palette's,
  // so the row follows whatever is on the board.
  board.onMeasure((measurement) => {
    if (measurement !== undefined) {
      toolRail.seen = measurement.seenBy;
    }
  });
  toolRail.addEventListener("tw-topology", (event) => {
    setTopology(table, event.detail.on);
  });
  toolRail.addEventListener("tw-undo", () => undo(table));
  // A reset is a stroke like any other: everything before it is cleared,
  // and it sits in the history so that taking it back brings the rest back.
  toolRail.addEventListener("tw-reset", () => {
    attempt("reset the drawing", async () =>
      showScene(table, await core.addStroke({ ink: "clear", visibility: "party" }))
    );
  });
  toolRail.addEventListener("tw-remove", (event) => {
    const { index } = event.detail;
    attempt("remove the stroke", async () => showScene(table, await core.removeStroke(index)));
  });
  // How the scene shows its heights is the scene's, kept with it.
  toolRail.addEventListener("tw-display", (event) => {
    const display = event.detail;
    attempt("change the height display", async () =>
      showScene(table, await core.setDisplay(display))
    );
  });
  board.onStroke((stroke) => {
    attempt("add the stroke", async () => showScene(table, await core.addStroke(stroke)));
  });
  board.onHover((readout) => {
    readoutBox.readout = readout;
  });
  // A threshold worked in Play is a state of the scene, not a stroke.
  board.onThreshold((threshold) => {
    if (!allows(table.seat().role, "ink:threshold:open")) {
      return;
    }
    const outcome = worked(threshold);
    if ("notice" in outcome) {
      showNotice(outcome.notice, "info");
      return;
    }
    attempt("work the threshold", async () =>
      showScene(table, await core.setThresholdState(threshold.edge, outcome.state))
    );
  });
}

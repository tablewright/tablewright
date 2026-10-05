import { allows, isTypingTarget } from "@tablewright/board";
import { raise } from "./desk.js";
import { attempt } from "../shell/notice.js";
import { openMap, setPlay, setTopology, showScene, undo } from "./scene.js";
import type { Table } from "../shell/table.js";

/** The keys the page itself answers, wherever the pointer is. */
export function wireKeys(table: Table): void {
  const { core, board } = table;
  const { toolRail, spotlight } = table.page;
  window.addEventListener("keydown", (event) => {
    // The picture under the field is the scene's, so the key asks the seat
    // as the button does.
    if (
      event.key === "o" &&
      (event.ctrlKey || event.metaKey) &&
      allows(table.seat().role, "scene:map:set")
    ) {
      event.preventDefault();
      void openMap(table);
    }
    // A letter typed into a field is text.
    const isTyping = isTypingTarget(event);
    if (
      (event.key === "r" || event.key === "R") &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isTyping
    ) {
      setPlay(table, toolRail.play === "ruler" ? "move" : "ruler");
    }
    if (
      (event.key === "t" || event.key === "T") &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isTyping &&
      allows(table.seat().role, "topology:read")
    ) {
      setTopology(table, !board.isReadingNumbers);
    }
    // Escape leaves the column for Move once nothing is on show: a
    // measure or an area on show takes the press and comes off the board
    // instead. Read from the board, since both hear the key after this
    // handler does.
    if (
      event.key === "Escape" &&
      toolRail.play === "ruler" &&
      !toolRail.held &&
      !event.defaultPrevented &&
      board.measurement === undefined &&
      !board.hasArea
    ) {
      setPlay(table, "move");
    }
    if (event.code === "Space" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (spotlight.open) {
        spotlight.hide();
      } else {
        raise(spotlight);
        spotlight.show();
      }
    }
    // Delete takes the chosen token off the board, for a hand that may.
    // A field keeps its own keys, so a name being typed is not a token.
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      !isTyping &&
      allows(table.seat().role, "token:remove")
    ) {
      const chosen = board.selected;
      if (chosen !== undefined) {
        event.preventDefault();
        attempt("take the token off", async () => showScene(table, await core.removeToken(chosen)));
      }
    }
    // Undo is the record's, so only while building; a field keeps its own.
    if (
      event.key === "z" &&
      (event.ctrlKey || event.metaKey) &&
      allows(table.seat().role, "history:undo") &&
      toolRail.held &&
      !isTyping
    ) {
      event.preventDefault();
      undo(table);
    }
  });
}

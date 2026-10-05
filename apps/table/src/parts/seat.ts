import { allows } from "@tablewright/board";
import { IS_DESKTOP } from "../core/core.js";
import { showNotice } from "../shell/notice.js";
import { setTopology } from "./scene.js";
import type { Table } from "../shell/table.js";

/**
 * Whose view this page is (design.md §6): the Tauri window is the DM's; the
 * same page served without Tauri is the player view, at the party tier with
 * no DM chrome. Under plain Vite, `?role=dm` keeps the DM's view reachable
 * for Playwright and for looking at it in a browser.
 */
export const OWN_SEAT: string = whoseSeat();

function whoseSeat(): string {
  if (IS_DESKTOP) {
    return "dm";
  }
  if (__DEV_BUILD__ && new URLSearchParams(window.location.search).get("role") === "dm") {
    return "dm";
  }
  return "player";
}

// Dev only, until the table is networked: the toggle stands the DM's page at
// another seat, so they see the table as that seat does.
let chromeShown = false;
// On the page, or off it altogether. Each remembers where it stood, so
// it goes back where it was rather than to the end.
const stood = new Map<HTMLElement, { parent: ParentNode; next: Node | null }>();
const show = (element: HTMLElement, on: boolean): void => {
  if (!stood.has(element) && element.parentNode !== null) {
    stood.set(element, { parent: element.parentNode, next: element.nextSibling });
  }
  if (on) {
    const place = stood.get(element);
    if (!element.isConnected && place !== undefined) {
      place.parent.insertBefore(element, place.next);
    }
    element.hidden = false;
  } else {
    element.remove();
  }
};
const seats = new Map<string, HTMLButtonElement>();
// The Topology view is the DM's own, so it goes off the board while this
// page stands at a player's side, and is waiting where it was left on
// coming back.
let dmNumbers = false;

function sitAs(table: Table, id: string): void {
  const { board, page } = table;
  const { toolRail, spotlight, entryView, scenesTab, roleLabel } = page;
  const { dmChrome, deskChrome, readoutBox, viewAs } = page;
  const role = table.roles[id];
  if (role === undefined) {
    showNotice(`No role called ${id} at this table.`);
    return;
  }
  const seat = { id, role };
  table.setSeat(seat);
  board.setSeat(seat);
  // A hand that may not draw does not keep a pen on the way over, and
  // what is on the board keeps its place, to be seen again from the
  // seat it was made in.
  if (!allows(role, "ink:free:draw")) {
    board.setBuildTool(undefined);
    toolRail.held = false;
  }
  if (allows(role, "topology:read")) {
    setTopology(table, dmNumbers);
  } else {
    dmNumbers = board.isReadingNumbers;
    setTopology(table, false);
  }
  // What a seat may not reach is not left on screen from the last one:
  // the box keeps its hits, the entry page its page, the rail its
  // record, and none of them are this seat's to see.
  spotlight.hide();
  entryView.hide();
  toolRail.historyOpen = false;
  scenesTab.canManage = allows(role, "scene:change");
  entryView.twRole = role;
  toolRail.twRole = role;
  roleLabel.textContent = role.name;
  roleLabel.hidden = id === OWN_SEAT && allows(role, "scene:change");
  // Taken out of the page, not hidden: the core refuses the command anyway;
  // this leaves nothing on the page inviting a try.
  show(dmChrome, chromeShown && allows(role, "scene:change"));
  show(deskChrome, chromeShown);
  toolRail.hidden = !chromeShown;
  readoutBox.hidden = !chromeShown;
  // The seats sit above the desk's corner, which steps down to make room.
  const seatsShown = chromeShown && __DEV_BUILD__ && OWN_SEAT === "dm";
  show(viewAs, seatsShown);
  deskChrome.classList.toggle("chrome-under", seatsShown);
  for (const [at, button] of seats) {
    button.setAttribute("aria-pressed", String(at === id));
  }
}

/** Show the scene's chrome or take it away, as this seat may see it. */
export function showChrome(table: Table, shown: boolean): void {
  chromeShown = shown;
  table.page.sceneChrome.hidden = !shown;
  sitAs(table, table.seat().id);
}

/**
 * The seats this page may sit in, dev only, in the order the file holds
 * them. A player's page has nowhere else to sit, so it builds none.
 */
export function wireSeat(table: Table): void {
  if (__DEV_BUILD__ && OWN_SEAT === "dm") {
    for (const [id, role] of Object.entries(table.roles)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = role.name;
      button.addEventListener("click", () => sitAs(table, id));
      table.page.viewAs.append(button);
      seats.set(id, button);
    }
  }
}

import { gridRuleOf } from "@tablewright/board";
import type { SpotlightHit } from "@tablewright/ui";
import { VERSION } from "../core/core.js";
import { attempt, reasonOf, showNotice } from "../shell/notice.js";
import type { Table } from "../shell/table.js";

// Whatever opened last sits on top: the search over the rail, the scene
// list over the palette. A stacking order is geometry, as the camera's
// transform is, so it is the one inline style the page writes.
let topLayer = 200;

/** Bring `element` over everything else on the page. */
export function raise(element: HTMLElement): void {
  topLayer += 1;
  element.style.zIndex = String(topLayer);
}

/** The desk's own listeners: the search box, the shared cards, the entry page, and the layers they peel back in. */
export async function wireDesk(table: Table): Promise<void> {
  const { core, board } = table;
  const { deskButton, searchButton, spotlight, shares, entryView, sceneChrome } = table.page;
  // Opening an entry is the same act from the box and from a shared card:
  // the page the desk turns to, until the surfaces exist.
  const openEntry = (hit: SpotlightHit): void => {
    attempt(`open ${hit.name}`, async () => {
      raise(entryView);
      entryView.show(await core.entry(hit.id));
    });
  };
  // The footer's rail turns the page to the same thing in another version.
  entryView.addEventListener("tw-version", (event) => {
    const { id, version } = event.detail;
    attempt(`turn to the ${version} rules`, async () => {
      raise(entryView);
      entryView.show(await core.entry(id, version));
    });
  });
  // The desk is a person's own choice, so it is kept in this browser, not
  // in the campaign; index.html reads it back before the first paint.
  const deskOf = (): "dark" | "light" =>
    document.documentElement.dataset["theme"] === "light" ? "light" : "dark";
  const nameDesk = (): void => {
    deskButton.textContent = deskOf() === "dark" ? "Light desk" : "Dark desk";
  };
  deskButton.addEventListener("click", () => {
    const desk = deskOf() === "dark" ? "light" : "dark";
    document.documentElement.dataset["theme"] = desk;
    nameDesk();
    try {
      localStorage.setItem("tablewright.desk", desk);
    } catch {
      // A page with no storage still switches; it just opens dark next time.
    }
  });
  nameDesk();
  spotlight.searcher = core.search;
  spotlight.version = VERSION;
  // The box groups by the system's categories and builds its tray from the
  // system's controls; without a system every kind is its own group and
  // there is no tray, which still reads.
  try {
    spotlight.system = (await core.system()) ?? undefined;
    spotlight.facetValues = await core.facetValues();
    entryView.versions = Object.keys(spotlight.system?.versions ?? {});
    board.setRule(gridRuleOf(spotlight.system));
  } catch (error) {
    showNotice(`Could not read the system: ${reasonOf(error)}`);
  }
  searchButton.addEventListener("click", () => {
    raise(spotlight);
    spotlight.show();
  });
  spotlight.addEventListener("tw-select", (event) => {
    openEntry(event.detail);
  });
  // A share becomes a card on this table; the session message to everyone
  // else arrives with networking (design §6). A share of the entry already
  // open as a page raises no card: the reader has it in front of them.
  spotlight.addEventListener("tw-share", (event) => {
    const hit = event.detail;
    if (entryView.open && entryView.entry?.id === hit.id) {
      return;
    }
    raise(shares);
    shares.push(hit, "you");
  });
  shares.addEventListener("tw-open", (event) => {
    openEntry(event.detail);
  });
  // Escape peels the layers back one at a time: the shared card, then the
  // search box, then the page. Seen first, before any panel's own handler.
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") {
        return;
      }
      // Inside the filter tray, Escape returns to the input; the tray's own.
      if (
        event
          .composedPath()
          .some((node) => node instanceof Element && node.tagName === "TW-FILTER-TRAY")
      ) {
        return;
      }
      if (shares.length > 0) {
        shares.dismiss();
      } else if (spotlight.open) {
        spotlight.hide();
      } else if (entryView.open) {
        entryView.hide();
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true }
  );
  // A click outside the page closes it, as Escape does, once the box is
  // shut: while the box is open its scrim takes the click and the page
  // stays, so the layers still peel one at a time. The chrome is not
  // outside: its buttons open things.
  window.addEventListener(
    "click",
    (event) => {
      if (!entryView.open || spotlight.open) {
        return;
      }
      const path = event.composedPath();
      if (path.includes(entryView) || path.includes(shares) || path.includes(sceneChrome)) {
        return;
      }
      entryView.hide();
    },
    { capture: true }
  );
}

import { resolveResource } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { REFERENCE_SCENES, allows } from "@tablewright/board";
import type { CampaignSummary } from "@tablewright/schema";
import { IS_DESKTOP, type Core } from "../core/core.js";
import { raise } from "./desk.js";
import { attempt, showNotice } from "../shell/notice.js";
import { refreshScenes, showScene } from "./scene.js";
import { showChrome } from "./seat.js";
import type { Table } from "../shell/table.js";

// The page's own title; the campaign's name goes before it, and a player's
// page says whose view it is after.
const TITLE = document.title;

// A folder the DM chooses: where a new campaign goes, or a campaign kept
// elsewhere. Only the desktop shell has the dialog.
async function pickFolder(title: string): Promise<string | null> {
  if (!IS_DESKTOP) {
    throw new Error("choosing a folder needs the desktop app");
  }
  const picked = await open({ directory: true, multiple: false, title });
  return typeof picked === "string" ? picked : null;
}

function setTitle(table: Table): void {
  const seat = table.seat();
  document.title = [table.campaign()?.name, TITLE, seat.id === "dm" ? undefined : seat.role.name]
    .filter((part) => part !== undefined)
    .join(" — ");
}

async function enterCampaign(table: Table, opened: CampaignSummary): Promise<void> {
  table.setCampaign(opened);
  table.page.intro.hidden = true;
  await refreshScenes(table);
  showScene(table, await table.core.scene());
  showChrome(table, true);
  setTitle(table);
}

async function showIntro(table: Table): Promise<void> {
  const { intro, scenesTab, toolRail } = table.page;
  table.setCampaign(undefined);
  table.board.clearScene();
  scenesTab.scenes = [];
  toolRail.strokes = [];
  showChrome(table, false);
  setTitle(table);
  intro.campaigns = await table.core.listCampaigns();
  raise(intro);
  intro.hidden = false;
}

// The example's picture is a file the app ships: a resource in the desktop
// app, and for the stand-in the same file by its address under Vite.
async function pictureUrl(): Promise<string> {
  if (__DEV_BUILD__ && !IS_DESKTOP) {
    return new URL("../../src-tauri/resources/example/tavern.svg", import.meta.url).href;
  }
  return resolveResource("resources/example/tavern.svg");
}

// The first run makes the example campaign: the tavern with its picture,
// and the mansion and the hill from their reference drawings, open on
// the tavern.
async function makeExample(core: Core): Promise<CampaignSummary> {
  const made = await core.createCampaign("The Rusty Flagon", null);
  for (const reference of REFERENCE_SCENES) {
    await core.createScene(reference.name, reference.strokes());
  }
  await core.openScene("tavern");
  await core.setMap({ url: await pictureUrl(), width: 1000, height: 750 });
  return made;
}

/** The campaign's own listeners: the intro's three ways in, and the way back out to it. */
export function wireCampaign(table: Table): void {
  const { core } = table;
  const { intro, campaignsButton } = table.page;
  intro.addEventListener("tw-campaign-open", (event) => {
    const { path } = event.detail;
    attempt(`open the campaign at ${path}`, async () =>
      enterCampaign(table, await core.openCampaign(path))
    );
  });
  // A new campaign goes under the home, or in a folder the DM picks, where
  // it gets a folder of its own named after it.
  intro.addEventListener("tw-campaign-create", (event) => {
    const { name, elsewhere } = event.detail;
    attempt(`create ${name}`, async () => {
      const location = elsewhere ? await pickFolder("Where the campaign's folder goes") : null;
      if (elsewhere && location === null) {
        return;
      }
      await enterCampaign(table, await core.createCampaign(name, location));
    });
  });
  intro.addEventListener("tw-campaign-browse", () => {
    attempt("open the folder", async () => {
      const path = await pickFolder("Open a campaign folder");
      if (path === null) {
        return;
      }
      await enterCampaign(table, await core.openCampaign(path));
    });
  });
  campaignsButton.addEventListener("click", () => {
    attempt("leave the campaign", async () => {
      await core.closeCampaign();
      await showIntro(table);
    });
  });
}

/**
 * The table starts on the campaign open when the app last closed, else
 * on the intro; the first run makes the example. A player's page has no
 * intro: it waits for the DM's campaign.
 */
export async function startTable(table: Table): Promise<void> {
  const { core } = table;
  // The stand-in keeps nothing between loads and has no DM's page behind a
  // player's, so a player's page under it is shown the example made for it.
  if (__DEV_BUILD__ && !IS_DESKTOP && !allows(table.seat().role, "scene:change")) {
    await makeExample(core);
  }
  const current = await core.currentCampaign();
  if (current !== null) {
    await enterCampaign(table, current);
  } else if (!allows(table.seat().role, "scene:change")) {
    showChrome(table, false);
    setTitle(table);
    showNotice("No campaign is at the table.", "info");
  } else if ((await core.listCampaigns()).length === 0) {
    await enterCampaign(table, await makeExample(core));
  } else {
    await showIntro(table);
  }
}

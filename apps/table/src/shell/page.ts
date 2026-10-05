/** The elements of index.html the shell wires, found once; a page missing one cannot be the table, and says so. */
export function findPage() {
  const host = document.getElementById("board");
  const openButton = document.getElementById("open-map");
  const campaignsButton = document.getElementById("campaigns");
  const toolRail = document.querySelector("tw-tool-rail");
  const sceneChrome = document.querySelector<HTMLElement>(".chrome");
  const dmChrome = document.getElementById("dm-chrome");
  const deskChrome = document.getElementById("desk-chrome");
  const deskButton = document.getElementById("desk-theme");
  const roleLabel = document.getElementById("role");
  const viewAs = document.getElementById("view-as");
  const searchButton = document.getElementById("search");
  const spotlight = document.querySelector("tw-spotlight");
  const shares = document.querySelector("tw-share-tray");
  const entryView = document.querySelector("tw-entry-view");
  const scenesTab = document.querySelector("tw-scenes");
  const intro = document.querySelector("tw-campaigns");
  const dashAsk = document.querySelector("tw-dash-ask");
  const tokenMenu = document.querySelector("tw-token-menu");
  const readoutBox = document.querySelector("tw-readout");
  if (
    host === null ||
    openButton === null ||
    campaignsButton === null ||
    toolRail === null ||
    sceneChrome === null ||
    dmChrome === null ||
    deskChrome === null ||
    deskButton === null ||
    roleLabel === null ||
    viewAs === null ||
    searchButton === null ||
    spotlight === null ||
    shares === null ||
    entryView === null ||
    scenesTab === null ||
    intro === null ||
    dashAsk === null ||
    tokenMenu === null ||
    readoutBox === null
  ) {
    throw new Error(
      "index.html must contain #board, #open-map, #campaigns, .chrome, #dm-chrome, #desk-chrome, #desk-theme, #role, #view-as, #search, <tw-scenes>, <tw-campaigns>, <tw-tool-rail>, <tw-spotlight>, <tw-share-tray>, <tw-dash-ask>, <tw-entry-view>, and <tw-readout>"
    );
  }
  return {
    host,
    openButton,
    campaignsButton,
    toolRail,
    sceneChrome,
    dmChrome,
    deskChrome,
    deskButton,
    roleLabel,
    viewAs,
    searchButton,
    spotlight,
    shares,
    entryView,
    scenesTab,
    intro,
    dashAsk,
    tokenMenu,
    readoutBox,
  };
}

/** The page's elements, each known to be there. */
export type Page = ReturnType<typeof findPage>;

import "@tablewright/ui/theme.css";
import { BoardStage, NOBODY, loadBoardFaces, readBoardTheme, type Seat } from "@tablewright/board";
import type { CampaignSummary, Role } from "@tablewright/schema";
import "@tablewright/ui";
import { BoardHost } from "./host/board-host.js";
import { startTable, wireCampaign } from "./parts/campaign.js";
import { connectCore } from "./core/core.js";
import { wireDesk } from "./parts/desk.js";
import { wireDev } from "./dev/dev.js";
import { wireKeys } from "./parts/keys.js";
import { openCurtain, showWindow } from "./shell/loader.js";
import { reasonOf, showNotice } from "./shell/notice.js";
import { findPage } from "./shell/page.js";
import { wireScene } from "./parts/scene.js";
import { OWN_SEAT, wireSeat } from "./parts/seat.js";
import type { Table } from "./shell/table.js";

await showWindow();

const page = findPage();

try {
  const { host } = page;
  const theme = readBoardTheme(host);
  // Pixi measures text as it draws it, so the faces have to be in hand before
  // the first frame — which is the frame the window is shown on. A badge
  // measured against a fallback keeps the fallback's width all session.
  await loadBoardFaces(theme);
  const stage = await BoardStage.create(host, { background: theme.ground });
  // Nobody until the roles are read, so a page that never reads them may do
  // nothing rather than everything.
  let seat: Seat = NOBODY;
  const core = connectCore(() => seat.role.sees);
  // Who may do what, from the core's own file. A page that cannot read
  // them sits in nobody's seat, which may do nothing at all.
  const roles = await core.permissions().catch((error: unknown) => {
    showNotice(`Could not read who may do what: ${String(error)}`, "fatal");
    return {} as Record<string, Role>;
  });
  const own = roles[OWN_SEAT];
  if (own !== undefined) {
    seat = { id: OWN_SEAT, role: own };
  }
  const board = new BoardHost(stage, host, seat);
  // The campaign at the table, whose folder the scene's picture is within.
  let campaign: CampaignSummary | undefined;
  const table: Table = {
    core,
    board,
    page,
    roles,
    seat: () => seat,
    campaign: () => campaign,
    setSeat: (next) => {
      seat = next;
    },
    setCampaign: (next) => {
      campaign = next;
    },
  };
  wireScene(table);
  wireSeat(table);
  await wireDesk(table);
  wireKeys(table);
  wireCampaign(table);
  await startTable(table);
  if (__DEV_BUILD__) {
    await wireDev(table);
  }
  await stage.firstFrame;
} catch (error) {
  showNotice(
    `The board could not start: ${reasonOf(error)}. WebGL is required; check graphics drivers and try again.`,
    "fatal"
  );
}
// The wordmark comes off whatever happened above: a failed board's notice
// cannot be read through it.
await openCurtain();

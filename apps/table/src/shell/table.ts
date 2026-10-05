/**
 * ─ Table ─
 *
 * What every part of the shell is handed. The core, the board, the page's
 * elements and the roles are made once at the start. Who sits here, and at
 * which campaign, change while the page is up, so each is asked for at the
 * moment it is needed and never kept.
 */

import type { Seat } from "@tablewright/board";
import type { CampaignSummary, Role } from "@tablewright/schema";
import type { BoardHost } from "../host/board-host.js";
import type { Core } from "../core/core.js";
import type { Page } from "./page.js";

export interface Table {
  readonly core: Core;
  readonly board: BoardHost;
  readonly page: Page;
  /** Who may do what at this table, by the seat's id. */
  readonly roles: Record<string, Role>;
  /** Who sits at this page now. */
  seat(): Seat;
  /** The campaign at the table, whose folder the scene's picture is within. */
  campaign(): CampaignSummary | undefined;
  /** Sit another seat at this page; the seat's part of the shell calls it. */
  setSeat(seat: Seat): void;
  /** Bring a campaign to the table, or take it away; the campaign's part calls it. */
  setCampaign(campaign: CampaignSummary | undefined): void;
}

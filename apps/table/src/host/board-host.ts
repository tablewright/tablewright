/**
 * ─ Board host ─
 *
 * Wires the board package into the Table window: stage, camera, input,
 * map, grid, tokens, and theme. The scene it shows is the core's document
 * (design §5): the host renders what it is given and reports gestures;
 * it never decides what the scene is.
 */

import {
  Camera,
  CameraInput,
  DEFAULT_DISPLAY,
  DEFAULT_MOVER,
  DragRoute,
  DEFAULT_RULE,
  DrawLayer,
  GridLayer,
  HeightLayer,
  MapLayer,
  NumbersLayer,
  RulerTool,
  ThresholdTap,
  TokenLayer,
  TopologyLayer,
  derive,
  extentCovering,
  isArea,
  measure,
  readBoardTheme,
  readoutAt,
  stepHeight,
  visibleExtent,
  NOBODY,
  allows,
  visibleTo,
  watchBoardTheme,
  areaStyle,
  drawStyle,
  heightStyle,
  numbersStyle,
  rulerStyle,
  tokenStyle,
  topologyStyle,
  worldToCell,
  Listeners,
  type BoardStage,
  type BoardTheme,
  type Cell,
  type CellReadout,
  type Area,
  type OriginSnap,
  type Seat,
  type CellExtent,
  type DrawTool,
  type GridRule,
  type MapSize,
  type MeasureListener,
  type PlayTool,
  type AreaListener,
  type Point,
  type RulerMode,
  type ShownMeasure,
  type SquareGrid,
  type StrokeListener,
  type ThresholdListener,
  type DashAsk,
  type DashAskListener,
  type TokenMove,
  type TokenMoveListener,
  type TokenView,
  type Topology,
} from "@tablewright/board";
import type {
  Grid,
  HeightDisplay,
  Scene,
  Stroke,
  ThresholdPlay,
  Visibility,
} from "@tablewright/schema";
import { AreaHost } from "./area-host.js";
import { debugView, placeholderTokens, type BoardDebug } from "./board-debug.js";
import { budgetOf, moverOf, tokenViews, tokensWithHeights } from "./token-views.js";

// Screen pixels kept clear around a map when the camera fits to it.
const FIT_PADDING = 24;

// How much of the picture and its textures is left showing under the
// Topology view: enough to place the numbers on the map, too little to read
// as the map itself.
const MUTED_ALPHA = 0.15;

// What the board shows before a scene and under the intro: nothing to select,
// so no key moves anything while a campaign is being chosen.
const NO_SCENE: Scene = {
  id: "",
  name: "",
  grid: { cell_size: 50, origin_x: 0, origin_y: 0, cols: 20, rows: 15 },
  map: null,
  tokens: [],
  strokes: [],
  display: DEFAULT_DISPLAY,
  play: [],
  next_token: 1,
};

// A scene's grid as the board measures by it, and as the cells it covers.
function squareGridOf(grid: Grid): SquareGrid {
  return { cellSize: grid.cell_size, originX: grid.origin_x, originY: grid.origin_y };
}

function boundsOf(grid: Grid): CellExtent {
  return { colMin: 0, rowMin: 0, cols: grid.cols, rows: grid.rows };
}

export class BoardHost {
  private readonly camera: Camera;
  private readonly stage: BoardStage;
  private readonly gridLayer: GridLayer;
  private readonly mapLayer: MapLayer;
  private readonly tokenLayer: TokenLayer;
  private readonly topologyLayer: TopologyLayer;
  private readonly heightLayer: HeightLayer;
  private readonly numbersLayer: NumbersLayer;
  private readonly area: AreaHost;
  private readonly drawLayer: DrawLayer;
  private readonly ruler: RulerTool;
  private readonly thresholdTap: ThresholdTap;
  private readonly dragRoute: DragRoute;
  private readonly target: HTMLElement;
  private readonly moveListeners = new Listeners<TokenMove>();
  private readonly strokeListeners = new Listeners<Stroke>();
  private readonly hoverListeners = new Listeners<CellReadout | undefined>();
  private readonly dashListeners = new Listeners<DashAsk | undefined>();
  private ground = 0;
  private play: readonly ThresholdPlay[] = [];
  private display: HeightDisplay = DEFAULT_DISPLAY;
  // The picture on the map layer, so a scene switch loads only a different one.
  private mapUrl: string | undefined;
  private isToolHeld = false;
  private buildTool: DrawTool | undefined;
  private playTool: PlayTool = "move";
  // The scene on show, so a switch to another takes the measure off the board.
  private sceneId: string | undefined;
  private seat: Seat;
  private grid: SquareGrid = squareGridOf(NO_SCENE.grid);
  private rule: GridRule = DEFAULT_RULE;
  private bounds: CellExtent = boundsOf(NO_SCENE.grid);
  private tokens: readonly TokenView[] = [];
  private strokes: readonly Stroke[] = [];
  private topology: Topology = derive([], this.bounds);
  private isGridStale = true;
  private isTopologyView = false;
  private rulerMode: RulerMode = "line";

  constructor(stage: BoardStage, target: HTMLElement, seat: Seat = NOBODY) {
    this.stage = stage;
    this.target = target;
    this.seat = seat;
    this.camera = new Camera(stage.world);
    const toWorld = (screen: Point): Point => this.camera.toWorld(screen);
    this.gridLayer = new GridLayer(stage.layers.grid);
    this.mapLayer = new MapLayer(stage.layers.map);
    this.topologyLayer = new TopologyLayer(stage.layers.topology);
    this.heightLayer = new HeightLayer(stage.layers.height);
    this.numbersLayer = new NumbersLayer(stage.layers.numbers);
    const theme = readBoardTheme(target);
    // A drag prices its way for the token that is moving, against what that
    // token has left this turn; the route draws in the overlay, over the tokens.
    this.dragRoute = new DragRoute(
      stage.layers.overlay,
      this.grid,
      (id, from, to) => measure(this.topology, from, to, this.rule, moverOf(this.tokens, id)),
      (id) => budgetOf(this.tokens, id)
    );
    this.tokenLayer = new TokenLayer(
      stage.layers.tokens,
      this.grid,
      tokenStyle(theme),
      this.dragRoute
    );
    this.tokenLayer.onDashAsk((ask) => {
      stage.requestFrame();
      this.dashListeners.emit(ask);
    });
    this.drawLayer = new DrawLayer(stage.app.canvas, stage.layers.overlay, this.grid, toWorld);
    // The ruler asks the scene as it stands: the topology derived, the rule
    // the campaign plays by, and a person on foot until sheets say otherwise.
    this.ruler = new RulerTool(
      stage.app.canvas,
      stage.layers.overlay,
      this.grid,
      toWorld,
      (from, to, seenBy) => measure(this.topology, from, to, this.rule, DEFAULT_MOVER, seenBy)
    );
    this.ruler.onMeasure(() => stage.requestFrame());
    this.area = new AreaHost(
      stage,
      this.grid,
      this.rule,
      toWorld,
      () => this.topology,
      () => tokensWithHeights(this.tokens, this.topology, this.seat)
    );
    this.ruler.setSeat(seat);
    this.area.setSeat(seat);
    // The right button belongs to the board: it asks a token what may be
    // done with it, so the browser's own menu never opens over it.
    stage.app.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    const input = new CameraInput(this.camera, target);
    // A tap on a threshold works it; a tap on empty board clears the
    // selection, the same as pressing Escape. The pointer over a threshold
    // brightens it first, so a door reads as something to work.
    this.thresholdTap = new ThresholdTap(this.grid, toWorld, () => this.topology);
    input.onTap((at) => {
      if (!this.thresholdTap.tap(at)) {
        this.tokenLayer.select(undefined);
      }
    });
    input.onMove((at) => {
      if (!this.isToolHeld) {
        this.thresholdTap.hover(at);
      }
    });
    target.addEventListener("pointerleave", () => this.thresholdTap.clear());
    this.thresholdTap.onHighlight((edge) => {
      this.topologyLayer.setHighlight(edge);
      if (edge === undefined) {
        delete this.target.dataset["threshold"];
      } else {
        this.target.dataset["threshold"] = "true";
      }
      stage.requestFrame();
    });

    this.applyTheme(theme);
    watchBoardTheme(target, (next) => {
      this.applyTheme(next);
      stage.requestFrame();
    });

    // A finished stroke is the DM's to record; the hovered cell is read
    // off the topology so the tool can say what it is over.
    this.drawLayer.onStroke((stroke) => {
      this.strokeListeners.emit(stroke);
    });
    this.drawLayer.onHover((cell) => {
      const readout = cell === undefined ? undefined : readoutAt(this.topology, cell);
      this.hoverListeners.emit(readout);
    });

    // The layer has already snapped the token; the host passes the drop on and
    // the scene answers.
    this.tokenLayer.onMove((move) => {
      this.moveListeners.emit(move);
    });
    // The hold-to-turn timer selects the token it turns, on no input of
    // its own; the selection is what the frame has to show.
    this.tokenLayer.onSelect(() => stage.requestFrame());

    // Camera and resize events can arrive several times per frame; the grid
    // is rebuilt at most once, just before the frame is drawn. A camera
    // change asks for that frame; a resize is drawn at once by the stage.
    this.camera.onChange(() => {
      this.isGridStale = true;
      stage.requestFrame();
    });
    stage.onResize(() => {
      this.isGridStale = true;
    });
    stage.onBeforeDraw(() => {
      if (this.isGridStale) {
        this.isGridStale = false;
        this.redrawGrid();
      }
      this.area.turnRing();
    });
  }

  /**
   * Show `scene`: its grid, its bounds, its picture and its tokens. `map` is
   * the picture's URL as this page can load it, or nothing for a scene with
   * no picture; the scene keeps the path, the page resolves it.
   */
  setScene(scene: Scene, map: string | undefined): void {
    const isNew = scene.id !== this.sceneId;
    if (isNew) {
      this.sceneId = scene.id;
      this.ruler.clear();
      this.area.clear();
    }
    const grid = squareGridOf(scene.grid);
    if (
      grid.cellSize !== this.grid.cellSize ||
      grid.originX !== this.grid.originX ||
      grid.originY !== this.grid.originY
    ) {
      this.applyGrid(grid);
    }
    // A picture sets its own bounds once loaded; without one the scene's
    // grid is the board.
    if (map !== this.mapUrl) {
      this.mapUrl = map;
      if (map === undefined) {
        this.mapLayer.clear();
      } else {
        void this.loadMap(map);
      }
    }
    if (map === undefined) {
      this.bounds = boundsOf(scene.grid);
      this.isGridStale = true;
    }
    this.strokes = scene.strokes;
    this.play = scene.play;
    this.display = scene.display;
    this.redrawTopology();
    this.setTokens(tokenViews(scene));
    // A scene opens in the middle of the window; a picture frames itself once
    // it has loaded, so this is for a scene of grid and strokes alone.
    if (isNew && map === undefined) {
      this.frameScene();
    }
    this.stage.requestFrame();
  }

  /** Show no scene: the board as it starts, with nothing on it. */
  clearScene(): void {
    this.setScene(NO_SCENE, undefined);
  }

  /** Put the whole scene in the middle of the view, at most life size. */
  private frameScene(): void {
    const { cellSize, originX, originY } = this.grid;
    this.camera.fit(
      this.stage.app.screen,
      {
        left: originX + this.bounds.colMin * cellSize,
        top: originY + this.bounds.rowMin * cellSize,
        right: originX + (this.bounds.colMin + this.bounds.cols) * cellSize,
        bottom: originY + (this.bounds.rowMin + this.bounds.rows) * cellSize,
      },
      FIT_PADDING,
      1
    );
  }

  // Every holder of the grid hears a change at once: the layers draw by it,
  // and the tools read the pointer through it.
  private applyGrid(grid: SquareGrid): void {
    this.grid = grid;
    this.tokenLayer.setGrid(grid, tokensWithHeights(this.tokens, this.topology, this.seat));
    this.drawLayer.setGrid(grid);
    this.ruler.setGrid(grid);
    this.dragRoute.setGrid(grid);
    this.area.setGrid(grid);
    this.thresholdTap.setGrid(grid);
    this.isGridStale = true;
  }

  // Every layer takes its colours and faces from the one theme, read at
  // start and again on a switch.
  private applyTheme(theme: BoardTheme): void {
    this.ground = theme.ground;
    this.stage.setBackground(theme.ground);
    this.gridLayer.setStyle(theme.grid);
    this.tokenLayer.setStyle(tokenStyle(theme));
    this.topologyLayer.setStyle(topologyStyle(theme));
    this.heightLayer.setStyle(heightStyle(theme));
    this.numbersLayer.setStyle(numbersStyle(theme));
    this.area.setStyle(areaStyle(theme));
    this.drawLayer.setStyle(drawStyle(theme));
    this.ruler.setStyle(rulerStyle(theme));
    this.dragRoute.setStyle(rulerStyle(theme));
  }

  /** Measure by `rule`: the campaign's setting, the system's default until then. */
  setRule(rule: GridRule): void {
    this.rule = rule;
    // The ruler and the drag read the rule as they measure; the area host
    // measures again what it has down.
    this.area.setRule(rule);
    this.redrawHeights();
    this.stage.requestFrame();
  }

  /** Replace what stands on the board. */
  setTokens(tokens: readonly TokenView[]): void {
    this.tokens = tokens;
    this.showTokens();
    this.stage.requestFrame();
  }

  // Every token wears the height of the ground under it.
  private showTokens(): void {
    this.tokenLayer.set(tokensWithHeights(this.tokens, this.topology, this.seat));
  }

  /** Hear the right button ask what may be done with a token. */
  onTokenAsk(listener: (ask: { id: string; at: Point; kept: boolean }) => void): () => void {
    return this.tokenLayer.onAsk((ask) => {
      const token = this.tokens.find((one) => one.id === ask.id);
      listener({ ...ask, kept: (token?.visibility ?? "party") !== "party" });
    });
  }

  /** Hear every finished move gesture. Returns the unsubscribe. */
  onTokenMove(listener: TokenMoveListener): () => void {
    return this.moveListeners.add(listener);
  }

  /** Hear the dash question a drop asks, and its answer. Returns the unsubscribe. */
  onDashAsk(listener: DashAskListener): () => void {
    return this.dashListeners.add(listener);
  }

  /** Answer the dash question: the token moves and spends the action, or stays. */
  answerDash(use: boolean): void {
    this.tokenLayer.answerDash(use);
  }

  /** Draw with `tool`, or with nothing: Play, where the pointer moves tokens or measures. */
  setBuildTool(tool: DrawTool | undefined): void {
    this.buildTool = tool;
    this.drawLayer.setTool(tool);
    this.applyTools();
  }

  /** In Play, move tokens or measure; a pen held keeps drawing until it is put down. */
  setPlayTool(tool: PlayTool): void {
    this.playTool = tool;
    this.applyTools();
  }

  /**
   * What the ruler's column does: measure as a line or a path, or lay an
   * area down. Swapping between the two halves takes whatever the other
   * had on show off the board.
   */
  setRulerMode(mode: RulerMode): void {
    if (mode === this.rulerMode) {
      return;
    }
    this.rulerMode = mode;
    this.ruler.setMode(isArea(mode) ? "line" : mode);
    this.applyTools();
  }

  /** The area the palette has made: its kind, its sizes and its form. */
  setArea(area: Area | undefined): void {
    this.area.setArea(area);
  }

  /** Where an area's origin may sit when one is put down. */
  setOriginSnap(snap: OriginSnap): void {
    this.area.setSnap(snap);
  }

  /**
   * The hand's choice of who a measure or an area is for: everyone at the
   * table, the DM, or oneself. It marks the one on the board as well as
   * the next, so what is already down is shared by saying so.
   */
  chooseSeenBy(seenBy: Visibility): void {
    this.ruler.chooseSeenBy(seenBy);
    this.area.chooseSeenBy(seenBy);
  }

  /**
   * Who what this hand puts down is for: the table, or kept back. It
   * marks the strokes the pens draw; a token is marked as it is placed
   * and by the scene after that.
   */
  setMarking(marking: Visibility): void {
    this.drawLayer.setMarking(marking);
  }

  /** The token the pointer has chosen, when one is chosen. */
  get selected(): string | undefined {
    return this.tokenLayer.selectedId;
  }

  /**
   * Who sits at this board. The scene is derived again as that role sees
   * it, and a measure or an area another seat kept to itself drops off
   * the board until that seat comes back.
   */
  setSeat(seat: Seat): void {
    if (seat.id === this.seat.id) {
      return;
    }
    this.seat = seat;
    this.ruler.setSeat(seat);
    this.area.setSeat(seat);
    this.applyTools();
    this.redrawTopology();
    this.stage.requestFrame();
  }

  /** Whether an area is on the board. */
  get hasArea(): boolean {
    return this.area.isShowing;
  }

  /** Hear the area as it is turned and laid down, so a palette can follow it. */
  onArea(listener: AreaListener): () => void {
    return this.area.onArea(listener);
  }

  /** Hear the measure as it is drawn out and pinned, so a palette can follow it. */
  onMeasure(listener: MeasureListener): () => void {
    return this.ruler.onMeasure(listener);
  }

  /**
   * Read the scene as the rules read it: the picture and every texture down
   * to a hint, and the height printed in each cell that has one.
   */
  setTopologyView(on: boolean): void {
    if (on === this.isTopologyView) {
      return;
    }
    this.isTopologyView = on;
    const muted = on ? MUTED_ALPHA : 1;
    this.stage.layers.map.alpha = muted;
    this.stage.layers.height.alpha = muted;
    this.topologyLayer.setMuted(on);
    if (on) {
      this.isGridStale = true;
    } else {
      this.numbersLayer.clear();
    }
    this.stage.requestFrame();
  }

  /** Whether the Topology view is on. */
  get isReadingNumbers(): boolean {
    return this.isTopologyView;
  }

  /** What a cell measures and how a diagonal counts, as the campaign has it. */
  get gridRule(): GridRule {
    return this.rule;
  }

  /** The measure the ruler shows, or nothing. */
  get measurement(): ShownMeasure | undefined {
    return this.ruler.measurement;
  }

  // One hand on the board: a pen held draws, else the ruler measures when
  // chosen, else the pointer moves tokens.
  private applyTools(): void {
    const pen = this.buildTool;
    const inColumn = pen === undefined && this.playTool === "ruler";
    // The column's two halves share the pointer: one measures, the other
    // lays an area down, and only ever one of them hears a press.
    const isArea_ = inColumn && isArea(this.rulerMode);
    const isRuler = inColumn && !isArea_;
    this.isToolHeld = pen !== undefined || inColumn;
    this.thresholdTap.clear();
    this.ruler.setActive(isRuler);
    this.area.setActive(isArea_);
    this.tokenLayer.setInteractive(!this.isToolHeld);
    this.tokenLayer.setMovable(allows(this.seat.role, "token:move"));
    if (pen !== undefined) {
      this.target.dataset["tool"] = pen.shape;
    } else if (inColumn) {
      this.target.dataset["tool"] = "ruler";
    } else {
      delete this.target.dataset["tool"];
    }
    this.stage.requestFrame();
  }

  /** Hear every stroke the tool finishes. Returns the unsubscribe. */
  onStroke(listener: StrokeListener): () => void {
    return this.strokeListeners.add(listener);
  }

  /** Hear what the tool is over as it moves. Returns the unsubscribe. */
  onHover(listener: (readout: CellReadout | undefined) => void): () => void {
    return this.hoverListeners.add(listener);
  }

  /** Hear every threshold tapped in Play. Returns the unsubscribe. */
  onThreshold(listener: ThresholdListener): () => void {
    return this.thresholdTap.onThreshold(listener);
  }

  /** The cell under the middle of the view: where a placed token lands. */
  centerCell(): Cell {
    const { width, height } = this.stage.app.screen;
    return worldToCell(this.grid, this.camera.toWorld({ x: width / 2, y: height / 2 }));
  }

  /** Read-only view of the scene for dev builds and end-to-end tests. */
  debug(): BoardDebug {
    return debugView({
      stage: this.stage,
      camera: this.camera,
      tokenLayer: this.tokenLayer,
      mapLayer: this.mapLayer,
      heightLayer: this.heightLayer,
      numbersLayer: this.numbersLayer,
      area: this.area,
      ruler: this.ruler,
      grid: () => this.grid,
      rule: () => this.rule,
      bounds: () => this.bounds,
      topology: () => this.topology,
      strokes: () => this.strokes,
      tokens: () => tokensWithHeights(this.tokens, this.topology, this.seat),
      ground: () => this.ground,
    });
  }

  /** Replace the tokens with `count` placeholders spread over the map, for stress runs. */
  seedTokens(count: number): void {
    this.setTokens(placeholderTokens(count, this.bounds));
  }

  /** Load a map image, size the grid to it, and frame it in the view. */
  async loadMap(url: string): Promise<MapSize> {
    this.mapUrl = url;
    const size = await this.mapLayer.setImage(url);
    this.bounds = extentCovering(this.grid, size.width, size.height);
    this.isGridStale = true;
    this.redrawTopology();
    this.camera.fit(
      this.stage.app.screen,
      { left: 0, top: 0, right: size.width, bottom: size.height },
      FIT_PADDING
    );
    // The picture arrived in its own time, on no input; it needs a frame of its own.
    this.stage.requestFrame();
    return size;
  }

  // The strokes are the record; what the board reads is derived from them
  // afresh, cheap at map scale, whenever they, the bounds or the grid change.
  private redrawTopology(): void {
    this.topology = derive(
      visibleTo(this.strokes, this.seat.role.sees, this.play),
      this.bounds,
      this.play
    );
    this.topologyLayer.draw(this.topology, this.grid);
    this.redrawHeights();
    // The numbers read the field, so a stroke changes them; they are redrawn
    // with the grid, over the extent in view.
    if (this.isTopologyView) {
      this.isGridStale = true;
    }
    this.showTokens();
  }

  private redrawHeights(): void {
    this.heightLayer.draw(this.topology, this.grid, this.display, stepHeight(this.rule));
  }

  // The grid and the numbers both cost what is on screen and nothing more,
  // so both are redrawn from the same visible extent whenever the camera
  // moves, on the frame the move asked for.
  private redrawGrid(): void {
    const { width, height } = this.stage.app.screen;
    const topLeft = this.camera.toWorld({ x: 0, y: 0 });
    const bottomRight = this.camera.toWorld({ x: width, y: height });
    const extent = visibleExtent(
      this.grid,
      { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y },
      this.bounds
    );
    if (extent === undefined) {
      this.gridLayer.clear();
      this.numbersLayer.clear();
      return;
    }
    this.gridLayer.draw(this.grid, extent);
    if (this.isTopologyView) {
      this.numbersLayer.draw(this.topology, this.grid, extent);
    }
  }
}

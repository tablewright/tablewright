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
  DEFAULT_MOVER,
  DragRoute,
  DEFAULT_RULE,
  DrawLayer,
  GridLayer,
  HeightLayer,
  AreaLayer,
  AreaTool,
  MapLayer,
  NumbersLayer,
  RulerTool,
  TokenLayer,
  TopologyLayer,
  catchesToken,
  caughtCells,
  cellCenter,
  derive,
  distance,
  edgeAt,
  edgeKey,
  edgeNear,
  extentCovering,
  cubeCentre,
  findRoute,
  groundAt,
  heightAt,
  isArea,
  isLevelChangeAt,
  NO_LIMIT,
  measure,
  readBoardTheme,
  stepHeight,
  visibleExtent,
  NOBODY,
  allows,
  seenAt,
  visibleTo,
  watchBoardTheme,
  worldToCell,
  type BoardStage,
  type BoardTheme,
  type Budget,
  type CameraState,
  type Cell,
  type Area,
  type OriginSnap,
  type Seat,
  type AreaDrawing,
  type AreaStyle,
  type CellExtent,
  type DrawStyle,
  type DrawTool,
  type GridRule,
  type HeightDrawing,
  type HeightStyle,
  type MapSize,
  type MeasureListener,
  type NumbersDrawing,
  type NumbersStyle,
  type Mover,
  type PlayTool,
  type AreaListener,
  type PlacedArea,
  type Point,
  type Route,
  type RouteOptions,
  type RulerMode,
  type RulerStyle,
  type ShownMeasure,
  type Spot,
  type SquareGrid,
  type StrokeListener,
  type ThresholdEdge,
  type DashAsk,
  type DashAskListener,
  type TokenMove,
  type TokenStyle,
  type TokenView,
  type Topology,
  type TopologyStyle,
} from "@tablewright/board";
import type {
  Edge,
  GroundState,
  HeightDisplay,
  Scene,
  Stroke,
  ThresholdPlay,
  Visibility,
} from "@tablewright/schema";

/** A tap in Play landed on a threshold: what it is, and where. */
export type ThresholdListener = (threshold: ThresholdEdge) => void;

// How near a tap must be to an edge, in cells, to mean the threshold on it
// rather than the cell; tighter than the pen's reach, since a tap on a cell
// is also how a selection is cleared.
const TAP_REACH = 0.25;

/** What the topology says about the cell under the tool. */
export interface CellReadout {
  readonly cell: Cell;
  readonly ground: GroundState;
  readonly height: number;
  readonly isLevelChange: boolean;
}

export type HoverListener = (readout: CellReadout | undefined) => void;

/** What a dev build exposes on `window.__tablewright` for tests: reads only, no mutation. */
export interface BoardDebug {
  tokens(): readonly TokenView[];
  selectedId(): string | undefined;
  camera(): CameraState;
  bounds(): CellExtent;
  /** The picture on the board by its pixel size, once it has loaded. */
  picture(): MapSize | undefined;
  /** The scene's strokes in the order drawn: the record the board derives from. */
  strokes(): readonly Stroke[];
  /** What the strokes derived to, as this viewer sees it. */
  topology(): Topology;
  /** Screen position of a cell's centre, for pointing a test's mouse at it. */
  cellToScreen(cell: Cell): Point;
  /** The grid rule the board measures by. */
  rule(): GridRule;
  /** The cheapest route for a person on foot, as the rules read this viewer's scene. */
  route(from: Cell, to: Cell, options?: RouteOptions): Route | undefined;
  /** The straight distance between two cells' centres at the field's heights. */
  distance(from: Cell, to: Cell): number;
  /** What the height display last drew. */
  heights(): HeightDrawing;
  /** What the DM's Topology view last printed; nothing while it is off. */
  numbers(): NumbersDrawing;
  /** The area on the board, or nothing while none is laid down. */
  area(): AreaDrawing;
  /** Frames the board has drawn; still while nothing changes. */
  framesDrawn(): number;
  /** The measure the ruler shows, in the mode it is read in, or nothing. */
  measurement(): ShownMeasure | undefined;
}

/** A finished gesture the scene should record: which token, where, facing what. */
export type TokenMoveListener = (move: TokenMove) => void;

// Screen pixels kept clear around a map when the camera fits to it.
const FIT_PADDING = 24;

// How much of the picture and its textures is left showing under the
// Topology view: enough to place the numbers on the map, too little to read
// as the map itself.
const MUTED_ALPHA = 0.15;

function tokenStyle(theme: BoardTheme): TokenStyle {
  return {
    fill: theme.token,
    label: theme.tokenLabel,
    hover: theme.hover,
    selection: theme.selection,
  };
}

function topologyStyle(theme: BoardTheme): TopologyStyle {
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

function drawStyle(theme: BoardTheme): DrawStyle {
  return { hover: theme.hover, ink: theme.threshold };
}

function rulerStyle(theme: BoardTheme): RulerStyle {
  return { line: theme.ruler, dash: theme.selection, beyond: theme.beyond, ground: theme.ground };
}

function numbersStyle(theme: BoardTheme): NumbersStyle {
  return {
    ground: theme.ground,
    up: theme.heightUp,
    down: theme.heightDown,
    stair: theme.threshold,
  };
}

function areaStyle(theme: BoardTheme): AreaStyle {
  return { ground: theme.ground, line: theme.ruler, caught: theme.selection };
}

function heightStyle(theme: BoardTheme): HeightStyle {
  return {
    ground: theme.ground,
    shade: theme.heightShade,
    line: theme.heightLine,
    up: theme.heightUp,
    down: theme.heightDown,
    tag: theme.heightTag,
  };
}

function tokenViews(scene: Scene): TokenView[] {
  return scene.tokens.map((token) => ({
    id: token.id,
    label: token.label,
    cell: { col: token.col, row: token.row },
    facing: token.facing,
    visibility: token.visibility,
  }));
}

export class BoardHost {
  readonly camera: Camera;
  private readonly stage: BoardStage;
  private readonly gridLayer: GridLayer;
  private readonly mapLayer: MapLayer;
  private readonly tokenLayer: TokenLayer;
  private readonly topologyLayer: TopologyLayer;
  private readonly heightLayer: HeightLayer;
  private readonly numbersLayer: NumbersLayer;
  private readonly areaLayer: AreaLayer;
  private readonly areaTool: AreaTool;
  private readonly drawLayer: DrawLayer;
  private readonly ruler: RulerTool;
  private readonly dragRoute: DragRoute;
  private readonly target: HTMLElement;
  private readonly moveListeners = new Set<TokenMoveListener>();
  private readonly strokeListeners = new Set<StrokeListener>();
  private readonly hoverListeners = new Set<HoverListener>();
  private readonly thresholdListeners = new Set<ThresholdListener>();
  private readonly dashListeners = new Set<DashAskListener>();
  private readonly areaListeners = new Set<AreaListener>();
  /** The dash question on show, so Escape knows a move is waiting on an answer. */
  private asking: DashAsk | undefined;
  private play: readonly ThresholdPlay[] = [];
  /** How the scene shows its heights. */
  private display: HeightDisplay = { mode: "shaded", strength: 80 };
  /** The picture on the map layer, so a scene switch loads only a different one. */
  private mapUrl: string | undefined;
  private isToolHeld = false;
  private buildTool: DrawTool | undefined;
  private playTool: PlayTool = "move";
  /** The scene on show, so a switch to another takes the measure off the board. */
  private sceneId: string | undefined;
  private highlighted: string | undefined;
  /** Whose view this is: strokes above this tier are never derived, let alone drawn. */
  /** Who sits at this board: their role, and the name it goes by. */
  private seat: Seat;
  /** Who what this hand puts down is for. */
  private putting: Visibility = "party";
  private grid: SquareGrid = { cellSize: 50, originX: 0, originY: 0 };
  /** What a cell measures and how diagonals count: the campaign's, from its system. */
  private rule: GridRule = DEFAULT_RULE;
  private bounds: CellExtent = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
  private tokens: readonly TokenView[] = [];
  private strokes: readonly Stroke[] = [];
  private topology: Topology = derive([], this.bounds);
  private isGridStale = true;
  /** Whether the DM is reading the scene as numbers; theirs alone, never the scene's. */
  private isTopologyView = false;
  /** How the ruler's column reads: two measures, then three areas. */
  private rulerMode: RulerMode = "line";
  /** The area the palette has made, or nothing while no area mode is picked. */
  private area: Area | undefined;
  /** When the turning ring was last advanced, on the document's clock. */
  private turnedAt = 0;

  constructor(stage: BoardStage, target: HTMLElement, seat: Seat = NOBODY) {
    this.stage = stage;
    this.target = target;
    this.seat = seat;
    this.camera = new Camera(stage.world);
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
      (id, from, to) => measure(this.topology, from, to, this.rule, this.moverOf(id)),
      (id) => this.budgetOf(id)
    );
    this.tokenLayer = new TokenLayer(
      stage.layers.tokens,
      this.grid,
      tokenStyle(theme),
      this.dragRoute
    );
    this.tokenLayer.onDashAsk((ask) => {
      this.asking = ask;
      stage.requestFrame();
      for (const listener of this.dashListeners) {
        listener(ask);
      }
    });
    this.drawLayer = new DrawLayer(stage.app.canvas, stage.layers.overlay, this.grid, (screen) =>
      this.camera.toWorld(screen)
    );
    // The ruler asks the scene as it stands: the topology derived, the rule
    // the campaign plays by, and a person on foot until sheets say otherwise.
    this.ruler = new RulerTool(
      stage.app.canvas,
      stage.layers.overlay,
      this.grid,
      (screen) => this.camera.toWorld(screen),
      (from, to, seenBy) => measure(this.topology, from, to, this.rule, DEFAULT_MOVER, seenBy)
    );
    this.ruler.onMeasure(() => stage.requestFrame());
    this.areaLayer = new AreaLayer(stage.layers.overlay, this.grid, this.rule);
    this.areaTool = new AreaTool(
      stage.app.canvas,
      this.grid,
      (screen) => this.camera.toWorld(screen),
      this.rule,
      (cell, at) => this.originAt(cell, at)
    );
    this.areaTool.onChange((placed) => this.showArea(placed));
    this.ruler.setSeat(seat);
    this.areaTool.setSeat(seat);
    // The right button belongs to the board: it asks a token what may be
    // done with it, so the browser's own menu never opens over it.
    stage.app.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    const input = new CameraInput(this.camera, target);
    // A tap on a threshold works it; a tap on empty board clears the
    // selection, the same as pressing Escape. The pointer over a threshold
    // brightens it first, so a door reads as something to work.
    input.onTap((at) => this.tap(at));
    target.addEventListener("pointermove", this.onPointerMove);
    target.addEventListener("pointerleave", this.onPointerLeave);

    this.gridLayer.setStyle(theme.grid);
    this.topologyLayer.setStyle(topologyStyle(theme));
    this.heightLayer.setStyle(heightStyle(theme));
    this.numbersLayer.setStyle(numbersStyle(theme));
    this.areaLayer.setStyle(areaStyle(theme));
    this.drawLayer.setStyle(drawStyle(theme));
    this.ruler.setStyle(rulerStyle(theme));
    this.dragRoute.setStyle(rulerStyle(theme));
    watchBoardTheme(target, (next) => {
      stage.setBackground(next.ground);
      this.gridLayer.setStyle(next.grid);
      this.tokenLayer.setStyle(tokenStyle(next));
      this.topologyLayer.setStyle(topologyStyle(next));
      this.heightLayer.setStyle(heightStyle(next));
      this.numbersLayer.setStyle(numbersStyle(next));
      this.areaLayer.setStyle(areaStyle(next));
      this.drawLayer.setStyle(drawStyle(next));
      this.ruler.setStyle(rulerStyle(next));
      this.dragRoute.setStyle(rulerStyle(next));
      stage.requestFrame();
    });

    // A finished stroke is the DM's to record; the hovered cell is read
    // off the topology so the tool can say what it is over.
    this.drawLayer.onStroke((stroke) => {
      for (const listener of this.strokeListeners) {
        listener(stroke);
      }
    });
    this.drawLayer.onHover((cell) => {
      const readout = cell === undefined ? undefined : this.readout(cell);
      for (const listener of this.hoverListeners) {
        listener(readout);
      }
    });

    // A drop is the commit point. The layer has already snapped the token to
    // its cell; the host only passes the gesture on, and the scene answers.
    this.tokenLayer.onMove((move) => {
      for (const listener of this.moveListeners) {
        listener(move);
      }
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
      this.turnRing();
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
      this.areaTool.clear();
    }
    const grid: SquareGrid = {
      cellSize: scene.grid.cell_size,
      originX: scene.grid.origin_x,
      originY: scene.grid.origin_y,
    };
    if (grid.cellSize !== this.grid.cellSize || grid.originX !== this.grid.originX) {
      this.grid = grid;
      this.tokenLayer.setGrid(grid, this.tokensWithHeights());
      this.drawLayer.setGrid(grid);
      this.ruler.setGrid(grid);
      this.dragRoute.setGrid(grid);
      this.isGridStale = true;
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
      this.bounds = { colMin: 0, rowMin: 0, cols: scene.grid.cols, rows: scene.grid.rows };
      this.isGridStale = true;
    }
    this.strokes = scene.strokes;
    this.play = scene.play;
    this.display = scene.display;
    this.redrawTopology();
    this.setTokens(tokenViews(scene));
    // A scene opens in the middle of the window rather than in its corner.
    // A picture frames itself once it has loaded, so this is for the scenes
    // that are grid and strokes alone.
    if (isNew && map === undefined) {
      this.frameScene();
    }
    this.stage.requestFrame();
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

  /** Measure by `rule`: the campaign's setting, the system's default until then. */
  setRule(rule: GridRule): void {
    this.rule = rule;
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
    this.tokenLayer.set(this.tokensWithHeights());
  }

  // What stands on the board as this viewer sees it: a token kept for the
  // DM is not on a player's board at all, so it cannot be seen, caught by
  // an area, or dragged.
  private seenTokens(): readonly TokenView[] {
    return this.tokens.filter((token) => seenAt(token.visibility ?? "party", this.seat.role.sees));
  }

  private tokensWithHeights(): TokenView[] {
    return this.seenTokens().map((token) => ({
      ...token,
      height: heightAt(this.topology, token.cell),
      // Still on this seat's board, but not on the table's.
      isKept: (token.visibility ?? "party") !== "party",
    }));
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
    this.moveListeners.add(listener);
    return () => this.moveListeners.delete(listener);
  }

  /** Hear the dash question a drop asks, and its answer. Returns the unsubscribe. */
  onDashAsk(listener: DashAskListener): () => void {
    this.dashListeners.add(listener);
    return () => this.dashListeners.delete(listener);
  }

  /** Answer the dash question: the token moves and spends the action, or stays. */
  answerDash(use: boolean): void {
    this.tokenLayer.answerDash(use);
  }

  /** Whether a move is waiting on the dash question. */
  get isAskingDash(): boolean {
    return this.asking !== undefined;
  }

  // Who is moving, and what their turn allows. Both come from the sheet the
  // token stands for. Without one it is a placeholder the DM put down: it
  // walks as a person on foot, so a route still prices, but no movement
  // holds it, so a drag of any length lands.
  private moverOf(id: string): Mover {
    return this.tokens.find((token) => token.id === id)?.mover ?? DEFAULT_MOVER;
  }

  private budgetOf(id: string): Budget {
    return this.tokens.find((token) => token.id === id)?.budget ?? NO_LIMIT;
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
    this.area = area;
    this.areaTool.setArea(area);
  }

  /** Where an area's origin may sit when one is put down. */
  setOriginSnap(snap: OriginSnap): void {
    this.areaTool.setSnap(snap);
  }

  /**
   * The hand's choice of who a measure or an area is for: everyone at the
   * table, the DM, or oneself. It marks the one on the board as well as
   * the next, so what is already down is shared by saying so.
   */
  chooseSeenBy(seenBy: Visibility): void {
    this.ruler.chooseSeenBy(seenBy);
    this.areaTool.chooseSeenBy(seenBy);
  }

  /**
   * Who what this hand puts down is for: the table, or kept back. It
   * marks the strokes the pens draw; a token is marked as it is placed
   * and by the scene after that.
   */
  setMarking(marking: Visibility): void {
    this.putting = marking;
    this.drawLayer.setMarking(marking);
  }

  /** What this hand is putting down as, for whoever places a token. */
  get marking(): Visibility {
    return this.putting;
  }

  /** The token the pointer has chosen, when one is chosen. */
  get selected(): string | undefined {
    return this.tokenLayer.selectedId;
  }

  /** Who the next measure or area is for, leaving what is on the board alone. */
  setSeenBy(seenBy: Visibility): void {
    this.ruler.setSeenBy(seenBy);
    this.areaTool.setSeenBy(seenBy);
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
    this.areaTool.setSeat(seat);
    this.applyTools();
    this.redrawTopology();
    this.stage.requestFrame();
  }

  /** Take the area off the board, as Escape does. */
  clearArea(): void {
    this.areaTool.clear();
  }

  /** Whether an area is on the board. */
  get hasArea(): boolean {
    return this.areaLayer.isShowing;
  }

  /** Hear the area as it is turned and laid down, so a palette can follow it. */
  onArea(listener: AreaListener): () => void {
    this.areaListeners.add(listener);
    return () => this.areaListeners.delete(listener);
  }

  /** Hear the measure as it is drawn out and pinned, so a palette can follow it. */
  onMeasure(listener: MeasureListener): () => void {
    return this.ruler.onMeasure(listener);
  }

  /**
   * Read the scene as the rules read it: the picture and every texture down
   * to a hint, and the height printed in each cell that has one. The DM's
   * own way of looking, kept off the scene, so it survives every change the
   * scene reports back and no player inherits it.
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
  // chosen, else the pointer moves tokens. The cursor says which, and a
  // threshold lights only for the hand that can work it.
  private applyTools(): void {
    const pen = this.buildTool;
    const inColumn = pen === undefined && this.playTool === "ruler";
    // The column's two halves share the pointer: one measures, the other
    // lays an area down, and only ever one of them hears a press.
    const isArea_ = inColumn && isArea(this.rulerMode);
    const isRuler = inColumn && !isArea_;
    this.isToolHeld = pen !== undefined || inColumn;
    this.setHighlight(undefined);
    this.ruler.setActive(isRuler);
    this.areaTool.setActive(isArea_);
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
    this.strokeListeners.add(listener);
    return () => this.strokeListeners.delete(listener);
  }

  /** Hear what the tool is over as it moves. Returns the unsubscribe. */
  onHover(listener: HoverListener): () => void {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  }

  /** Hear every threshold tapped in Play. Returns the unsubscribe. */
  onThreshold(listener: ThresholdListener): () => void {
    this.thresholdListeners.add(listener);
    return () => this.thresholdListeners.delete(listener);
  }

  // A tap near a threshold's edge is for the threshold; anywhere else it
  // is a tap on nothing, which clears the selection.
  private tap(at: Point): void {
    const threshold = this.thresholdNear(at);
    if (threshold !== undefined) {
      for (const listener of this.thresholdListeners) {
        listener(threshold);
      }
      return;
    }
    this.tokenLayer.select(undefined);
  }

  // The threshold a point on the board is over, if it is one a tap can
  // work: an arch is always open, so it is not offered.
  private thresholdNear(at: Point): ThresholdEdge | undefined {
    const world = this.camera.toWorld(at);
    const edge = edgeNear(
      {
        x: (world.x - this.grid.originX) / this.grid.cellSize,
        y: (world.y - this.grid.originY) / this.grid.cellSize,
      },
      TAP_REACH
    );
    const data = edge === undefined ? undefined : edgeAt(this.topology, edge);
    return data?.kind === "threshold" && data.threshold !== "arch" ? data : undefined;
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.isToolHeld) {
      return;
    }
    const rect = this.target.getBoundingClientRect();
    const threshold = this.thresholdNear({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    this.setHighlight(threshold?.edge);
  };

  private readonly onPointerLeave = (): void => {
    this.setHighlight(undefined);
  };

  private setHighlight(edge: Edge | undefined): void {
    const key = edge === undefined ? undefined : edgeKey(edge);
    if (key === this.highlighted) {
      return;
    }
    this.highlighted = key;
    this.topologyLayer.setHighlight(edge);
    if (edge === undefined) {
      delete this.target.dataset["threshold"];
    } else {
      this.target.dataset["threshold"] = "true";
    }
    this.stage.requestFrame();
  }

  /** The cell under the middle of the view: where a placed token lands. */
  centerCell(): Cell {
    const { width, height } = this.stage.app.screen;
    return worldToCell(this.grid, this.camera.toWorld({ x: width / 2, y: height / 2 }));
  }

  /** Read-only view of the scene for dev builds and end-to-end tests. */
  debug(): BoardDebug {
    return {
      tokens: () => this.tokensWithHeights(),
      selectedId: () => this.tokenLayer.selectedId,
      camera: () => this.camera.current,
      bounds: () => this.bounds,
      picture: () => this.mapLayer.size(),
      strokes: () => this.strokes,
      topology: () => this.topology,
      cellToScreen: (cell) => this.camera.toScreen(cellCenter(this.grid, cell)),
      rule: () => this.rule,
      route: (from, to, options) =>
        findRoute(this.topology, from, to, DEFAULT_MOVER, this.rule, options),
      distance: (from, to) =>
        distance(
          { ...from, height: heightAt(this.topology, from) },
          { ...to, height: heightAt(this.topology, to) },
          this.rule
        ),
      heights: () => this.heightLayer.drawing(),
      numbers: () => this.numbersLayer.drawing(),
      area: () => this.areaLayer.drawing(),
      framesDrawn: () => this.stage.framesDrawn,
      measurement: () => this.ruler.measurement,
    };
  }

  /** Replace the tokens with `count` placeholders spread over the map, for stress runs. */
  seedTokens(count: number): void {
    const step = 2;
    const perRow = Math.max(1, Math.floor((this.bounds.cols - 2) / step));
    this.setTokens(
      Array.from({ length: count }, (_, index) => ({
        id: `seed-${index}`,
        label: String(index + 1),
        cell: {
          col: 1 + (index % perRow) * step,
          row: Math.min(this.bounds.rows - 1, 1 + Math.floor(index / perRow) * step),
        },
        facing: (index * 37) % 360,
      }))
    );
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

  private readout(cell: Cell): CellReadout {
    return {
      cell,
      ground: groundAt(this.topology, cell),
      height: heightAt(this.topology, cell),
      isLevelChange: isLevelChangeAt(this.topology, cell),
    };
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

  // Where an area starts when it is pressed on a cell: the place of the
  // token standing there, so a caster's own cone leaves from them, and
  // otherwise the floor the pointer found.
  // Where an area leaves from. It sits in the middle of its own cube, not
  // on the floor: every cell is judged by the centre of its cube, so an
  // origin at floor level would start half a cell below everything it is
  // measured against and lose the cells nearest to it.
  private originAt(cell: Cell, at: { x: number; y: number }): Spot {
    const token = this.seenTokens().find(
      (one) => one.cell.col === cell.col && one.cell.row === cell.row
    );
    const ground = heightAt(this.topology, cell);
    // A caster's own area leaves from them, wherever the press landed;
    // otherwise it takes the place the snap chose.
    if (token !== undefined) {
      return cubeCentre(cell, ground + (token.elevation ?? 0), this.rule);
    }
    return { x: at.x, y: at.y, z: ground + this.rule.cellSize / 2 };
  }

  // An area laid down or turning: what it covers, and who it holds.
  private showArea(placed: PlacedArea | undefined): void {
    for (const listener of this.areaListeners) {
      listener(placed);
    }
    if (placed === undefined) {
      this.areaLayer.clear();
      this.stage.requestFrame();
      return;
    }
    const cells = caughtCells(placed.area, placed.origin, this.topology, this.rule);
    const tokens = this.tokensWithHeights()
      .filter((token) => catchesToken(placed.area, placed.origin, token, this.rule))
      .map((token) => token.cell);
    this.areaLayer.show({
      area: placed.area,
      origin: placed.origin,
      cells,
      tokens,
      seenBy: placed.seenBy,
      isPlaced: placed.isPlaced,
    });
    this.stage.requestFrame();
  }

  private redrawHeights(): void {
    this.heightLayer.draw(this.topology, this.grid, this.display, stepHeight(this.rule));
  }

  // The grid and the numbers both cost what is on screen and nothing more,
  // so both are redrawn from the same visible extent whenever the camera
  // moves, on the frame the move asked for.
  // The ring about a caught token is the one thing here that moves on
  // its own, so while an area is on show the board asks for the next
  // frame and advances the ring by the time that actually passed. It
  // gates nothing: the rest of the drawing is already done.
  private turnRing(): void {
    if (!this.areaLayer.isShowing) {
      this.turnedAt = 0;
      return;
    }
    const now = performance.now();
    const since = this.turnedAt === 0 ? 0 : (now - this.turnedAt) / 1000;
    this.turnedAt = now;
    this.areaLayer.turn(since);
    this.stage.requestFrame();
  }

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

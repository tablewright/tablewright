/**
 * ─ perf-board ─
 *
 * Runs the board performance scenarios in a real Chromium and checks
 * them against the frame budget. No dependency: the browser already on
 * the machine is launched with remote debugging and driven over the
 * DevTools protocol with a plain WebSocket, the Vite dev server serves
 * the app and its fixtures, and the probe inside the app does the
 * measuring, so a manual run at the console and this one agree.
 *
 * Usage: bun run perf [--headless] [--ci] [--report=<path>]
 *
 * `--ci` is for runners without a GPU: the browser renders in software
 * there, so absolute frame budgets are meaningless. CI mode is headless,
 * gates only on catastrophic regressions, records which renderer drew
 * the frames, writes the report, and skips with success when no browser
 * is installed. Real numbers come from a machine with a GPU.
 */

import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VITE_PORT = 1422;
const CDP_PORT = 9333;
const APP_DIR = "apps/table";
const SCENARIOS = ["tavern", "world-fit", "world-zoom"] as const;
// A 60 Hz budget for the 95th percentile, and no frame long enough to see.
const P95_BUDGET_MS = 16.9;
// In software rendering only a collapse is a signal: a p95 this slow means
// something rebuilds far more than it should.
const CI_P95_BUDGET_MS = 150;
const CI_MAX_MS = 1000;
const STARTUP_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 120_000;

interface PerfResult {
  scenario: string;
  frames: number;
  meanMs: number;
  p95Ms: number;
  maxMs: number;
  over16: number;
  over33: number;
}

const isCi = process.argv.includes("--ci");
const isHeadless = isCi || process.argv.includes("--headless");
const reportPath = process.argv
  .find((arg) => arg.startsWith("--report="))
  ?.slice("--report=".length);
const isWindows = process.platform === "win32";

function browserCandidates(): string[] {
  const override = process.env["TABLEWRIGHT_BROWSER"];
  const pf = process.env["ProgramFiles"] ?? "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const local = process.env["LOCALAPPDATA"] ?? "";
  return [
    ...(override ? [override] : []),
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
}

async function waitFor(url: string, label: string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Not up yet.
    }
    await Bun.sleep(150);
  }
  throw new Error(`${label} did not answer at ${url} within ${STARTUP_TIMEOUT_MS} ms`);
}

function killTree(proc: ReturnType<typeof Bun.spawn>): void {
  if (isWindows) {
    Bun.spawnSync(["taskkill", "/PID", String(proc.pid), "/T", "/F"], {
      stdout: "ignore",
      stderr: "ignore",
    });
  } else {
    proc.kill();
  }
}

/** A minimal DevTools protocol client: numbered requests over one WebSocket. */
class Cdp {
  private readonly socket: WebSocket;
  private readonly pending = new Map<number, (value: unknown) => void>();
  private nextId = 1;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
      if (message.id !== undefined) {
        this.pending.get(message.id)?.(message.result);
        this.pending.delete(message.id);
      }
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error(`cannot open ${url}`)), {
        once: true,
      });
    });
    return new Cdp(socket);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void {
    this.socket.close();
  }
}

// Which GPU, or software rasterizer, WebGL is actually using in this browser.
async function readRenderer(cdp: Cdp): Promise<string> {
  const result = (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return "no webgl2";
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    })()`,
    returnByValue: true,
  })) as { result?: { value?: unknown } };
  return String(result.result?.value ?? "unknown");
}

async function runScenario(cdp: Cdp, scenario: string): Promise<PerfResult> {
  await cdp.send("Page.navigate", { url: `http://localhost:${VITE_PORT}/?perf=${scenario}` });
  const result = (await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      for (let i = 0; i < ${PROBE_TIMEOUT_MS / 100}; i += 1) {
        if (window.__tablewrightPerf) return await window.__tablewrightPerf;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("the probe never started; is this a dev build with ?perf=?");
    })()`,
    awaitPromise: true,
    returnByValue: true,
    timeout: PROBE_TIMEOUT_MS,
  })) as { result?: { value?: PerfResult }; exceptionDetails?: { text?: string } };
  if (result.exceptionDetails !== undefined || result.result?.value === undefined) {
    throw new Error(`${scenario}: ${result.exceptionDetails?.text ?? "no result"}`);
  }
  return result.result.value;
}

const browser = browserCandidates().find((path) => existsSync(path));
if (browser === undefined) {
  console.error("perf-board: no Chrome or Edge found; set TABLEWRIGHT_BROWSER to a browser path");
  // A runner without a browser cannot measure anything; that is not a regression.
  process.exit(isCi ? 0 : 1);
}

const vite = Bun.spawn(["bunx", "vite", "--port", String(VITE_PORT), "--strictPort"], {
  cwd: APP_DIR,
  stdout: "ignore",
  stderr: "ignore",
});
const profileDir = join(tmpdir(), "tablewright-perf-profile");
const chrome = Bun.spawn(
  [
    browser,
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,800",
    ...(isHeadless ? ["--headless=new"] : []),
    // Runners without a GPU only get WebGL through SwiftShader, and Chrome
    // refuses that fallback unless asked; local runs keep the real GPU.
    ...(isCi ? ["--enable-unsafe-swiftshader"] : []),
    "about:blank",
  ],
  { stdout: "ignore", stderr: "ignore" }
);

let exitCode = 0;
try {
  await waitFor(`http://localhost:${VITE_PORT}/`, "vite");
  await waitFor(`http://localhost:${CDP_PORT}/json/version`, "the browser");
  const targets = (await (await fetch(`http://localhost:${CDP_PORT}/json`)).json()) as Array<{
    type: string;
    webSocketDebuggerUrl: string;
  }>;
  const page = targets.find((target) => target.type === "page");
  if (page === undefined) {
    throw new Error("the browser exposed no page target");
  }
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  const renderer = await readRenderer(cdp);
  const isSoftware = /swiftshader|llvmpipe|software/i.test(renderer);
  console.log(`perf-board: ${browser}${isHeadless ? " (headless)" : ""}${isCi ? " (ci)" : ""}`);
  console.log(
    `renderer: ${renderer}${isSoftware ? "  [software: numbers are not comparable]" : ""}`
  );
  console.log("scenario      frames   mean    p95    max  >16.9  >33");
  const results: PerfResult[] = [];
  for (const scenario of SCENARIOS) {
    const r = await runScenario(cdp, scenario);
    results.push(r);
    const isPass = isCi
      ? r.p95Ms <= CI_P95_BUDGET_MS && r.maxMs <= CI_MAX_MS
      : r.p95Ms <= P95_BUDGET_MS && r.over33 === 0;
    exitCode = isPass ? exitCode : 1;
    console.log(
      `${scenario.padEnd(12)} ${String(r.frames).padStart(6)} ${r.meanMs.toFixed(2).padStart(6)} ` +
        `${r.p95Ms.toFixed(2).padStart(6)} ${r.maxMs.toFixed(2).padStart(6)} ${String(r.over16).padStart(6)} ` +
        `${String(r.over33).padStart(4)}  ${isPass ? "pass" : "FAIL"}`
    );
  }
  cdp.close();
  if (reportPath !== undefined) {
    const report = {
      when: new Date().toISOString(),
      platform: process.platform,
      browser,
      renderer,
      isSoftware,
      mode: isCi ? "ci" : "local",
      results,
    };
    await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`report: ${reportPath}`);
  }
} catch (error) {
  console.error(`perf-board: ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
} finally {
  killTree(chrome);
  killTree(vite);
  await rm(profileDir, { recursive: true, force: true });
}
process.exit(exitCode);

export {};

import { expect, test } from "@playwright/test";

// The measurement lives in the app (src/dev/perf-probe.ts); this spec only
// starts a scenario, waits for its numbers, attaches them, and judges them.
// With a real GPU the budget is a 60 Hz frame; in software rendering only a
// collapse counts, because the absolute numbers mean nothing there.

const SCENARIOS = ["tavern", "world-fit", "world-zoom"] as const;
const P95_BUDGET_MS = 16.9;
const SOFTWARE_P95_BUDGET_MS = 150;
const SOFTWARE_MAX_MS = 1000;

test.describe("board frame times", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "measured in Chromium only");

  for (const scenario of SCENARIOS) {
    test(scenario, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      await page.goto(`/?perf=${scenario}`);
      const renderer = await page.evaluate(() => {
        const gl = document.createElement("canvas").getContext("webgl2");
        if (gl === null) {
          return "no webgl2";
        }
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        return String(
          info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
        );
      });
      const result = await page.evaluate(async () => {
        for (let i = 0; i < 1200; i += 1) {
          if (window.__tablewrightPerf !== undefined) {
            return await window.__tablewrightPerf;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error("the probe never started");
      });
      const isSoftware =
        /swiftshader|llvmpipe|software/i.test(renderer) || process.env["CI"] !== undefined;
      await testInfo.attach("frame-times", {
        body: JSON.stringify({ renderer, isSoftware, ...result }, null, 2),
        contentType: "application/json",
      });
      console.log(
        `${scenario}: mean ${result.meanMs} p95 ${result.p95Ms} max ${result.maxMs} ` +
          `>16.9 ${result.over16} >33 ${result.over33} on ${renderer}`
      );
      if (isSoftware) {
        expect(result.p95Ms).toBeLessThanOrEqual(SOFTWARE_P95_BUDGET_MS);
        expect(result.maxMs).toBeLessThanOrEqual(SOFTWARE_MAX_MS);
      } else {
        expect(result.p95Ms).toBeLessThanOrEqual(P95_BUDGET_MS);
        expect(result.over33).toBe(0);
      }
    });
  }
});

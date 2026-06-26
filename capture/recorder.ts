// Per-scenario capture: console/network/pageerror buffers, per-step screenshot +
// ARIA snapshot of the Forge surface, and an optional "paint-toggle-diff" visibility
// check (ported from lz-ppm-forge/test/visual/run.mjs) to flag in-DOM-but-invisible
// elements with a reliable signal rather than a pixel guess.
import { type Page, type TestInfo } from "@playwright/test";
import type { Surface } from "../forge/frame";

export interface Expectation {
  assertion: string;
  narrative: string;
}
export interface EvidenceTarget {
  product: "jira" | "confluence";
  app?: string;
  appId?: string;
  module: string;
  moduleType?: string;
  surface?: "custom" | "uikit";
  url: string;
  iframe?: string;
  repo?: string;
  gitShaAppUnderTest?: string;
}
export interface StepRecord {
  index: number;
  name: string;
  action?: string;
  expectation?: Expectation;
  status: "pass" | "fail";
  screenshot: string;
  aria?: string;
  error?: string;
  timing: { tStart: number; tEnd: number };
}
interface ConsoleEntry { t: number; level: string; text: string }
interface NetworkEntry { t: number; method: string; url: string; status: number; resolver?: string }

/** Thrown by step() when its body (action or expectation) fails — aborts the test. */
export class RecorderStepError extends Error {
  constructor(stepName: string, detail?: string) {
    super(`step "${stepName}" failed${detail ? ": " + detail : ""}`);
    this.name = "RecorderStepError";
  }
}

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 50);

function decodeResolver(url: string): string | undefined {
  // Forge bridge invoke() goes through the gateway; best-effort tag.
  if (/\/gateway\/api\/.*\/invoke/i.test(url) || /\/invoke(\?|$)/i.test(url)) return "invoke";
  return undefined;
}

export class Recorder {
  steps: StepRecord[] = [];
  console: ConsoleEntry[] = [];
  network: NetworkEntry[] = [];
  pageErrors: string[] = [];
  frames?: unknown;
  target?: EvidenceTarget;
  errored = false;

  private surface?: Surface;
  private screenshots: { name: string; buffer: Buffer }[] = [];
  private t0 = Date.now();

  constructor(public page: Page, public testInfo: TestInfo) {
    page.on("console", (m) => this.console.push({ t: this.dt(), level: m.type(), text: m.text() }));
    page.on("pageerror", (e: Error) => this.pageErrors.push(String(e?.message ?? e)));
    page.on("response", (r) => {
      const url = r.url();
      if (/\.(png|jpe?g|gif|webp|woff2?|css|svg|ico|map)(\?|$)/i.test(url)) return; // skip static noise
      this.network.push({ t: this.dt(), method: r.request().method(), url, status: r.status(), resolver: decodeResolver(url) });
    });
  }

  private dt() { return Date.now() - this.t0; }

  setTarget(t: EvidenceTarget) { this.target = t; }
  attachSurface(s: Surface) { this.surface = s; }
  setFrames(d: unknown) { this.frames = d; }
  markError(e: unknown) {
    this.errored = true;
    this.pageErrors.push("TEST ERROR: " + String((e as Error)?.message ?? e));
  }
  get failureCount() { return this.steps.filter((s) => s.status === "fail").length + (this.errored ? 1 : 0); }
  get screenshotFiles() { return this.screenshots; }

  /**
   * Run one step (an action and/or an expectation). Captures a screenshot + ARIA
   * snapshot after the body. On failure, captures the failing frame then throws
   * RecorderStepError (aborts the scenario; the bundle still records the failure).
   */
  async step(
    name: string,
    fn: () => Promise<void>,
    opts: { expectation?: Expectation; action?: string } = {},
  ): Promise<void> {
    const index = this.steps.length + 1;
    const tStart = this.dt();
    let status: "pass" | "fail" = "pass";
    let error: string | undefined;
    try {
      await fn();
    } catch (e) {
      status = "fail";
      error = String((e as Error)?.message ?? e);
    }

    const file = `${String(index).padStart(2, "0")}-${slug(name)}.png`;
    let shot: Buffer | undefined;
    try { shot = await this.page.screenshot(); } catch { /* page may be navigating */ }
    if (shot) {
      this.screenshots.push({ name: file, buffer: shot });
      await this.testInfo.attach(file, { body: shot, contentType: "image/png" }).catch(() => {});
    }

    let aria: string | undefined;
    try {
      const root = this.surface?.root ?? this.page.locator("body");
      aria = await root.ariaSnapshot();
    } catch { /* surface not ready */ }

    this.steps.push({ index, name, action: opts.action, expectation: opts.expectation, status, screenshot: `steps/${file}`, aria, error, timing: { tStart, tEnd: this.dt() } });

    if (status === "fail") throw new RecorderStepError(name, error);
  }

  /**
   * Paint-toggle-diff: screenshot the bbox over `selector`, hide it, screenshot
   * again. Identical pixels ⇒ the element paints nothing (occluded/invisible/
   * colour==background) even though it's in the DOM. Returns true if it paints.
   */
  async paintsPixels(selector: string): Promise<boolean> {
    const root = this.surface?.kind === "custom" ? this.surface.frame : this.page;
    const loc = root.locator(selector).first();
    const box = await loc.boundingBox().catch(() => null);
    if (!box || box.width < 1 || box.height < 1) return false;
    const clip = { x: Math.max(0, box.x - 4), y: Math.max(0, box.y - 4), width: box.width + 8, height: box.height + 8 };
    const before = await this.page.screenshot({ clip });
    await loc.evaluate((el) => (el as HTMLElement).style.setProperty("visibility", "hidden", "important")).catch(() => {});
    await this.page.waitForTimeout(120);
    const after = await this.page.screenshot({ clip });
    await loc.evaluate((el) => (el as HTMLElement).style.removeProperty("visibility")).catch(() => {});
    return !before.equals(after);
  }
}

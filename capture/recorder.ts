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
interface ConsoleEntry {
  t: number;
  level: string;
  text: string;
  /** Source location reported by Chromium. Additive: old evidence readers can ignore it. */
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}
interface NetworkEntry {
  t: number;
  method: string;
  url: string;
  status: number;
  resolver?: string;
  /** Present only for transport failures, which have no HTTP response/status. */
  failure?: string;
}

export type ScreenshotCapture = "viewport" | "page-full" | "surface-full";

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

function isStaticAsset(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|woff2?|css|svg|ico|map)(\?|$)/i.test(url);
}

async function screenshotSeparateFrame(page: Page, root: Surface["root"]): Promise<Buffer> {
  const handle = await root.elementHandle();
  if (!handle) throw new Error("Custom UI root detached before evidence capture");
  try {
    const frame = await handle.ownerFrame();
    if (!frame) throw new Error("Custom UI root has no owning frame");
    const session = await page.context().newCDPSession(frame);
    try {
      const metrics = await session.send("Page.getLayoutMetrics");
      const size = metrics.cssContentSize ?? metrics.contentSize;
      const width = Math.ceil(size.width);
      const height = Math.ceil(size.height);
      if (width < 1 || height < 1) throw new Error(`Invalid Custom UI capture size ${width}x${height}`);
      const screenshot = await session.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale: 1 },
      });
      return Buffer.from(screenshot.data, "base64");
    } finally {
      await session.detach();
    }
  } finally {
    await handle.dispose();
  }
}

async function waitForHostPaint(page: Page, host: Surface["root"]): Promise<void> {
  let previous = "";
  let stableSince = 0;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const box = await host.boundingBox();
    if (box) {
      const geometry = [box.x, box.y, box.width, box.height].map((value) => value.toFixed(2)).join(":");
      if (geometry !== previous) {
        previous = geometry;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= 1_000) {
        return;
      }
    }
    await page.waitForTimeout(50);
  }
  throw new Error("Forge host iframe did not settle after evidence capture");
}

/**
 * Chromium normally captures an iframe element through the top-level page
 * compositor, which leaves off-viewport frame pixels unpainted. A true OOPIF
 * can be captured through its own CDP session. When Chromium keeps the frame in
 * the parent's process, temporarily enlarge only the outer compositor while
 * pinning the iframe to its original dimensions, preserving the tested app
 * breakpoint and making every frame pixel paintable.
 */
async function screenshotCustomSurface(page: Page, root: Surface["root"], host?: Surface["root"]): Promise<Buffer> {
  try {
    return await screenshotSeparateFrame(page, root);
  } catch (error) {
    // Depending on Chromium's process model, the child can reject either the
    // session attachment or Page.captureScreenshot itself. The compositor
    // expansion below is the supported fallback whenever we retained its host.
    if (!host) throw error;
  }

  const viewport = page.viewportSize();
  const hostBox = await host.boundingBox();
  if (!viewport || !hostBox) throw new Error("Forge host iframe is not measurable for full-surface capture");
  const documentSize = await root.evaluate(() => ({
    width: Math.ceil(Math.max(document.documentElement.clientWidth, document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0)),
    height: Math.ceil(Math.max(document.documentElement.clientHeight, document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)),
  }));
  const originalStyle = await host.getAttribute("style");

  try {
    await host.evaluate((element, size) => {
      const iframe = element as HTMLIFrameElement;
      for (const [property, value] of Object.entries({
        width: `${size.width}px`, minWidth: `${size.width}px`, maxWidth: `${size.width}px`,
        height: `${size.height}px`, minHeight: `${size.height}px`, maxHeight: `${size.height}px`,
      })) {
        iframe.style.setProperty(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value, "important");
      }
    }, documentSize);

    await page.setViewportSize({
      width: Math.max(viewport.width, Math.ceil(hostBox.x + documentSize.width + 64)),
      height: Math.max(viewport.height, Math.ceil(hostBox.y + documentSize.height + 64)),
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

    const preservedWidth = await root.evaluate(() => document.documentElement.clientWidth);
    if (Math.abs(preservedWidth - documentSize.width) > 1) {
      throw new Error(`Full-surface capture changed the app breakpoint (${documentSize.width}px to ${preservedWidth}px)`);
    }
    return await root.screenshot({ animations: "disabled" });
  } finally {
    await page.setViewportSize(viewport).catch(() => {});
    await host.evaluate((element, style) => {
      if (style === null) element.removeAttribute("style");
      else element.setAttribute("style", style);
    }, originalStyle).catch(() => {});
    await waitForHostPaint(page, host).catch(() => {});
  }
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
    page.on("console", (m) => {
      const location = m.location();
      this.console.push({
        t: this.dt(),
        level: m.type(),
        text: m.text(),
        ...(location.url ? { url: location.url } : {}),
        ...(Number.isFinite(location.lineNumber) ? { lineNumber: location.lineNumber } : {}),
        ...(Number.isFinite(location.columnNumber) ? { columnNumber: location.columnNumber } : {}),
      });
    });
    page.on("pageerror", (e: Error) => this.pageErrors.push(String(e?.message ?? e)));
    page.on("response", (r) => {
      const url = r.url();
      if (isStaticAsset(url)) return; // skip static noise
      this.network.push({ t: this.dt(), method: r.request().method(), url, status: r.status(), resolver: decodeResolver(url) });
    });
    page.on("requestfailed", (r) => {
      const url = r.url();
      if (isStaticAsset(url)) return;
      this.network.push({
        t: this.dt(),
        method: r.method(),
        url,
        status: 0,
        resolver: decodeResolver(url),
        failure: r.failure()?.errorText ?? "request failed",
      });
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
    opts: { expectation?: Expectation; action?: string; capture?: ScreenshotCapture } = {},
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
    try {
      if (opts.capture === "surface-full") {
        shot = this.surface?.kind === "custom"
          ? await screenshotCustomSurface(this.page, this.surface.root, this.surface.host)
          : this.surface
            ? await this.surface.root.screenshot({ animations: "disabled" })
            : await this.page.screenshot({ fullPage: true, animations: "disabled" });
      } else if (opts.capture === "page-full") {
        shot = await this.page.screenshot({ fullPage: true, animations: "disabled" });
      } else {
        // Backwards-compatible default for every existing scenario.
        shot = await this.page.screenshot();
      }
    } catch (captureError) {
      // Explicit capture modes are evidence requirements, not best-effort
      // decoration. A passing manifest with a missing screenshot is false
      // confidence; only the legacy default viewport capture remains tolerant
      // of a page that is still navigating.
      if (opts.capture) {
        status = "fail";
        const detail = String((captureError as Error)?.message ?? captureError);
        error = [error, `evidence capture failed: ${detail}`].filter(Boolean).join("; ");
      }
    }
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

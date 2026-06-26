// Enter a Forge app surface and run a step-1 diagnostic.
//
// Verified this session (Atlassian E2E blog + community threads):
//  - Forge Custom UI = a SINGLE, non-nested cross-origin iframe.
//  - Canonical selector: iframe[data-testid="hosted-resources-iframe"] (Jira & Confluence).
//  - The app mounts into #root inside that iframe.
//  - Production src is under *.cdn.prod.atlassian-dev.net (NOT permanent — never hardcode).
//  - UI Kit renders natively into the host DOM (no iframe).
import { type Page, type FrameLocator, type Locator } from "@playwright/test";

const CUSTOM_IFRAME_SELECTORS = [
  'iframe[data-testid="hosted-resources-iframe"]', // canonical
  'iframe[title^="Iframe "]', // documented fallback ("Iframe <uuid> from <uuid>")
  'iframe[title*="Iframe"]',
];

export type Surface =
  | { kind: "custom"; frame: FrameLocator; root: Locator }
  | { kind: "uikit"; root: Locator };

export interface EnterOpts {
  surface: "custom" | "uikit";
  /** A selector that proves the app booted, evaluated INSIDE the surface. */
  readySelector?: string;
  timeout?: number;
}

export async function enterForgeSurface(page: Page, o: EnterOpts): Promise<Surface> {
  const t = o.timeout ?? 30_000;

  if (o.surface === "uikit") {
    const root = page.locator("body");
    if (o.readySelector) {
      await page.locator(o.readySelector).first().waitFor({ state: "visible", timeout: t });
    }
    return { kind: "uikit", root };
  }

  // A page can host MANY Forge iframes (esp. Confluence space pages: other apps,
  // banners, nav). Pick the one that actually hosts THIS app, not just the first.
  let frame = await selectAppFrame(page, o, t);
  // Defensive descent: structure is confirmed single/non-nested, but if a nested
  // inner iframe ever appears, descend so selectors don't silently miss.
  if ((await frame.locator("iframe").count().catch(() => 0)) > 0) {
    frame = frame.locator("iframe").first().contentFrame();
  }
  if (o.readySelector) {
    await frame.locator(o.readySelector).first().waitFor({ state: "visible", timeout: t }).catch(() => {});
  }
  return { kind: "custom", frame, root: frame.locator(":root") };
}

/**
 * Among all Forge iframes on the page, return the FrameLocator that hosts the app:
 * a VISIBLE iframe whose readySelector is present, or (no readySelector) whose body
 * has rendered content. Skips hidden/empty iframes (other apps, banners). Falls back
 * to the first visible (or first) iframe — which, if blank, correctly surfaces as a
 * "mounts but blank" failure.
 */
async function selectAppFrame(page: Page, o: EnterOpts, t: number): Promise<FrameLocator> {
  const sel = await firstMatchingIframe(page, t);
  const deadline = Date.now() + t;
  let fallback = 0;
  for (;;) {
    const n = await page.locator(sel).count().catch(() => 0);
    const visible: number[] = [];
    for (let i = 0; i < n; i++) {
      const box = await page.locator(sel).nth(i).boundingBox().catch(() => null);
      if (box && box.width > 40 && box.height > 40) visible.push(i);
    }
    if (visible.length) fallback = visible[0];
    for (const i of visible) {
      const fl = page.locator(sel).nth(i).contentFrame();
      if (o.readySelector) {
        if (await fl.locator(o.readySelector).first().isVisible({ timeout: 500 }).catch(() => false)) return fl;
      } else {
        const txt = await fl.locator("body").textContent().catch(() => null);
        if (txt && txt.replace(/\s+/g, "").length > 0) return fl;
      }
    }
    if (Date.now() > deadline) break;
    await page.waitForTimeout(400);
  }
  return page.locator(sel).nth(fallback).contentFrame();
}

async function firstMatchingIframe(page: Page, timeout: number): Promise<string> {
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const sel of CUSTOM_IFRAME_SELECTORS) {
      if ((await page.locator(sel).count().catch(() => 0)) > 0) return sel;
    }
    if (Date.now() > deadline) return CUSTOM_IFRAME_SELECTORS[0]; // let the caller's waitFor throw clearly
    await page.waitForTimeout(300);
  }
}

export interface FrameDump {
  frames: { url: string; name: string; parent: string | null }[];
  iframes: { src: string; testid: string | null; title: string | null }[];
  cdnIframeFound: boolean;
  canonicalTestidFound: boolean;
}

/**
 * STEP-1 SANITY CHECK. Dumps the live frame tree + every iframe's src/testid/title
 * so we confirm the iframe structure on THIS instance before trusting selectors.
 * Saved into the evidence bundle as frames.json.
 */
export async function dumpForgeFrames(page: Page, settleMs = 1200): Promise<FrameDump> {
  await page.locator("iframe").first().waitFor({ state: "attached", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(settleMs); // let the CDN frame attach/nest
  const frames = page.frames().map((f) => ({
    url: f.url(),
    name: f.name(),
    parent: f.parentFrame()?.url() ?? null,
  }));
  const iframes = await page.locator("iframe").evaluateAll((els) =>
    (els as HTMLIFrameElement[]).map((e) => ({
      src: e.src,
      testid: e.getAttribute("data-testid"),
      title: e.getAttribute("title"),
    })),
  );
  const cdn = /cdn\.prod\.atlassian-dev\.net/;
  return {
    frames,
    iframes,
    cdnIframeFound: iframes.some((i) => cdn.test(i.src)) || frames.some((f) => cdn.test(f.url)),
    canonicalTestidFound: iframes.some((i) => i.testid === "hosted-resources-iframe"),
  };
}

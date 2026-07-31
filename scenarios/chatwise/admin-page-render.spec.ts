// LIVE: ChatWise jira:adminPage ("ChatWise AI Configuration") on wolfaenpak.
// Asserts the page renders for an allow-listed admin AND exposes all five
// configuration tabs — a missing tab means either a render regression or the
// beta gate silently degrading the page to its admin-bootstrap branch (which
// shows ONLY "Beta access"; see ChatWise src/admin-uikit/src/index.jsx).
//
// jira:adminPage deep-linking is NOT officially documented — the URL mirrors the
// lz-ppm-admin target (/jira/settings/apps/<appUuid>/<env>/<moduleKey>) and is
// treated as best-effort.
//
// SURFACE CAVEAT: this is the harness's first UI Kit 2 (`render: native`) target.
// forge/frame.ts's uikit path assumes UI Kit renders into the host DOM with no
// iframe — an assumption from the UI Kit 1 docs that has never been exercised
// here. Rather than bake that guess in, this spec RESOLVES the surface live:
// it looks for the app's own tab in the host DOM and in every iframe, and
// annotates which one won, so the next session has the answer as evidence.
import { test, expect } from "../../fixtures/forge";
import type { Page, FrameLocator, Locator } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("chatwise-admin");

/** The <Tab> labels in src/admin-uikit/src/index.jsx, in render order. */
const TABS = ["Connection", "Beta access", "Epic Fields", "Personas", "Settings"];
/** Unique to ChatWise's admin UI — safe to probe the host DOM with. */
const PROBE_TAB = "Beta access";

type Root = Page | FrameLocator;

/** Tolerates either the ARIA tab role or plain text (a UI Kit renderer detail). */
function tabLocator(root: Root, name: string): Locator {
  return root.getByRole("tab", { name, exact: true }).or(root.getByText(name, { exact: true })).first();
}

/** Find whichever context (host DOM or a Forge iframe) the UI Kit 2 page rendered into. */
async function resolveAdminRoot(page: Page, timeout = 40_000): Promise<{ root: Root; where: string }> {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await tabLocator(page, PROBE_TAB).isVisible({ timeout: 500 }).catch(() => false)) {
      return { root: page, where: "host DOM (UI Kit rendered natively, no iframe)" };
    }
    const frames = await page.locator("iframe").count().catch(() => 0);
    for (let i = 0; i < frames; i++) {
      const fl = page.locator("iframe").nth(i).contentFrame();
      if (await tabLocator(fl, PROBE_TAB).isVisible({ timeout: 500 }).catch(() => false)) {
        const src = await page.locator("iframe").nth(i).getAttribute("src").catch(() => null);
        return { root: fl, where: `hosted iframe #${i} (${src ?? "no src"})` };
      }
    }
    if (Date.now() > deadline) {
      throw new Error(
        `ChatWise admin page: the "${PROBE_TAB}" tab appeared in neither the host DOM nor any of the ` +
          `${frames} iframe(s) within ${timeout / 1000}s — the UI Kit 2 page did not render, or the beta ` +
          `gate degraded it (see frames.json + the step screenshots in the evidence bundle).`,
      );
    }
    await page.waitForTimeout(500);
  }
}

test.describe.configure({ retries: 3 });

test("ChatWise admin page renders with all five configuration tabs", async ({ page, recorder }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo,
  });

  await assertLoggedIn(page);
  await recorder.step("navigate to the ChatWise admin page", async () => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }, { action: "navigate", expectation: { assertion: "the jira:adminPage URL loads (no login redirect)", narrative: "The ChatWise admin page opens under Jira Settings → Apps." } });

  recorder.setFrames(await dumpForgeFrames(page));

  let root!: Root;
  await recorder.step("admin page mounts (surface resolved)", async () => {
    const found = await resolveAdminRoot(page);
    root = found.root;
    test.info().annotations.push({ type: "surface", description: `UI Kit 2 rendered in: ${found.where}` });
    recorder.attachSurface(
      "goto" in root
        ? { kind: "uikit", root: page.locator("body") }
        : { kind: "custom", frame: root, root: root.locator(":root") },
    );
  }, { expectation: { assertion: "the UI Kit 2 admin surface renders the app's own UI", narrative: "The admin page mounts and paints ChatWise's configuration UI, not a blank or errored panel." } });

  await recorder.step("the allow-listed admin gets the full configuration page", async () => {
    await expect(root.getByRole("heading", { name: /ChatWise AI configuration/i }).first()).toBeVisible();
  }, { expectation: { assertion: 'the "ChatWise AI configuration" heading is visible', narrative: "The admin sees the full page, not the beta-blocked bootstrap branch (heading 'ChatWise beta access') or the blocking screen." } });

  await recorder.step(`tab list contains all ${TABS.length} tabs`, async () => {
    const missing: string[] = [];
    for (const name of TABS) {
      if (!(await tabLocator(root, name).isVisible({ timeout: 5_000 }).catch(() => false))) missing.push(name);
    }
    expect(missing, `missing admin tab(s) — expected [${TABS.join(", ")}]`).toEqual([]);
  }, { expectation: { assertion: `the tab list shows ${TABS.join(", ")}`, narrative: "Every ChatWise configuration surface is reachable from the admin page." } });
});

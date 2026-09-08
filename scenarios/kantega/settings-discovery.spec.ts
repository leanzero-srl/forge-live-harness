// LIVE, READ-ONLY: walk Kantega's own navigation inside its Forge iframe and record what each
// screen offers. Rung 1 of the E.ON ladder — nothing is changed. Two harness bugs fixed 2026-09-08
// after the first run blamed the app: getByText('Users') matched an SVG <title>, and "body has
// text" passed when a gated click never left Settings. Now: role-based visible locators, and a
// screen counts as OPEN only if its heading changes; otherwise it is recorded as GATED, which is a
// finding about the product (everything past Settings is locked behind an org API key), not a fail.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

// Any app: DISCOVER_TARGET=techtime-global npx playwright test scenarios/kantega/settings-discovery.spec.ts
const T = getTarget(process.env.DISCOVER_TARGET || "kantega-global");
const SCREEN_LIST = process.env.DISCOVER_SCREENS;
test.describe.configure({ retries: 1 });
const SCREENS: readonly string[] = SCREEN_LIST ? SCREEN_LIST.split("|") : ["Settings", "Scheduling and Cleanup", "Users", "History", "Dashboard"];
const WATCH: [string, RegExp][] = [["self-assign", /self[- ]?assign/i], ["notification", /notif|e-?mail/i],
  ["window", /inactiv|days|months|threshold|last (login|active)/i], ["dry-run", /dry[- ]?run|preview|report/i],
  ["org-api-key", /api[- ]?key|organization id|without scopes/i]];

test(`${T.app}: each navigation screen opens or is recorded as gated`, async ({ page, recorder }) => {
  test.skip(!T.appId || !T.envId, "KANTEGA_APP_ID / KANTEGA_ENV_ID unresolved");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });
  await assertLoggedIn(page);
  await recorder.step("open the Kantega global page", async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); },
    { action: "navigate", expectation: { assertion: "loads without redirect to login", narrative: "Kantega's Confluence global page is reachable." } });
  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: "custom" });
  recorder.attachSurface(surface);
  const root = surface.kind === "custom" ? surface.frame : page;
  await recorder.step("app finishes loading (spinner gone)", async () => {
    await expect(root.locator("text=/Loading app/i")).toHaveCount(0, { timeout: 60_000 });
  }, { expectation: { assertion: "'Loading app' disappears within 60s", narrative: "The app boots rather than hanging on its splash." } });

  const heading = async () => (await root.locator("h1, h2").first().innerText().catch(() => "")).trim();
  const findings: string[] = [];
  for (const name of SCREENS) {
    await recorder.step(`"${name}": open, or record as gated`, async () => {
      const before = await heading();
      // the nav label, visible only — never an SVG <title>
      const item = root.getByText(name, { exact: true }).filter({ visible: true }).last();
      if (!(await item.count())) { findings.push(`${name}: ABSENT`); test.info().annotations.push({ type: `screen:${name}`, description: "ABSENT" }); return; }
      const dimmed = await item.evaluate((el: HTMLElement) => {
        const n = el.closest("a,button,[role=button],[role=link],li,div") as HTMLElement | null;
        const cs = n ? getComputedStyle(n) : null;
        return !!(n && (n.getAttribute("aria-disabled") === "true" || (cs && parseFloat(cs.opacity) < 0.7)));
      }).catch(() => false);
      await item.click({ timeout: 10_000, force: true }).catch(() => {});
      await page.waitForTimeout(3_000);
      const after = await heading();
      const txt = (await root.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
      const opened = after && after !== before && new RegExp(name.split(" ")[0], "i").test(after);
      const matched = WATCH.filter(([, re]) => re.test(txt)).map(([k]) => k);
      const verdict = opened ? "OPEN" : (dimmed ? "GATED (dimmed)" : "GATED (click did not navigate)");
      findings.push(`${name}: ${verdict}; heading="${after}"; matched=[${matched.join(",")}]`);
      test.info().annotations.push({ type: `kantega:${name}`, description: `${verdict} :: matched ${matched.join("|") || "none"} :: ${txt.slice(0, 400)}` });
      // the assertion is only that the surface is alive; OPEN vs GATED is the recorded observation
      expect(txt.trim().length, "surface still renders").toBeGreaterThan(20);
    }, { expectation: { assertion: `"${name}" either opens (heading changes) or is recorded as gated`, narrative: `Whether Kantega's ${name} screen is reachable before credentials are set up.` } });
  }
  await recorder.step("findings", async () => { console.log(`\n${T.app.toUpperCase()} SCREENS:\n  ` + findings.join("\n  ") + "\n"); },
    { expectation: { assertion: "findings printed", narrative: "One line per screen: OPEN or GATED, and which vendor-question keywords its text contains." } });
});

// LIVE, READ-ONLY: walk Kantega's own navigation inside its Forge iframe and record what each
// screen offers. This is rung 1 of the E.ON ladder — nothing is changed, the point is EVIDENCE:
// does the Confluence app expose self-assign at all (open vendor question #1), is there a
// notification switch (#3), and what does the cleanup window look like. The manifest narrative
// carries the observation; the assertions only claim "this screen rendered real content".
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("kantega-global");
test.describe.configure({ retries: 2 });

const SCREENS = ["Settings", "Scheduling and Cleanup", "Users", "Dashboard"] as const;
const WATCH = [/self[- ]?assign/i, /notif|e-?mail/i, /inactiv|days|months|threshold|last (login|active)/i, /dry[- ]?run|preview|report/i];

test("Kantega: each navigation screen renders, and what it offers is recorded", async ({ page, recorder }) => {
  test.skip(!T.appId || !T.envId, "KANTEGA_APP_ID / KANTEGA_ENV_ID unresolved");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });
  await assertLoggedIn(page);

  await recorder.step("open the Kantega global page", async () => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }, { action: "navigate", expectation: { assertion: "loads without redirect to login", narrative: "Kantega's Confluence global page is reachable." } });

  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: "custom" });
  recorder.attachSurface(surface);
  const root = surface.kind === "custom" ? surface.frame : page;

  await recorder.step("app finishes loading (spinner gone)", async () => {
    await expect(root.locator("text=/Loading app/i")).toHaveCount(0, { timeout: 60_000 });
  }, { expectation: { assertion: "'Loading app' disappears within 60s", narrative: "The app boots rather than hanging on its splash." } });

  for (const name of SCREENS) {
    await recorder.step(`open "${name}" and record what it offers`, async () => {
      await root.getByText(name, { exact: true }).first().click({ timeout: 15_000 });
      await page.waitForTimeout(4_000);
      const txt = (await root.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
      expect(txt.trim().length, `${name} rendered text`).toBeGreaterThan(20);
      const seen = WATCH.map((re) => (re.test(txt) ? re.source : null)).filter(Boolean);
      // observation, not assertion — this is what the E.ON questions need answering from the product
      test.info().annotations.push({ type: `kantega:${name}`, description: `matched: ${seen.join(" | ") || "none"} :: ${txt.slice(0, 600)}` });
    }, { expectation: { assertion: `"${name}" screen renders real content`, narrative: `Kantega's ${name} screen loads inside the Forge iframe; its text is captured for the vendor questions.` } });
  }
});

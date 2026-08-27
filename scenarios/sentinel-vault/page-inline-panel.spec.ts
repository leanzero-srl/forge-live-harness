// DEEP page-context journey for the inline-panel MACRO (embedded in the page body). Extends the
// it26 stuck-loading guard to this Custom-UI surface (a spinner must NOT be the terminal state),
// asserts it renders the sealed fixture in a "Sealed" section, and cross-checks that the panel
// AGREES with the doc-ribbon banner on the seal state (owner's "banner/panel agree"). Dev-scoped
// (env 17516615) — the prod install renders its own panel too. Read-only (no mutation; the
// seal/unseal lifecycle is covered by page-seal-unseal.spec.ts).
import { test, expect } from "../../fixtures/forge";
const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const DEV = "17516615";
const OUT = "/tmp/sv-panel";
import { mkdirSync } from "node:fs";
test.describe.configure({ retries: 1 });

test("inline-panel loads past spinner, shows the sealed fixture, and agrees with the banner", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);

  const iframes = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');

  // 1) find the DEV inline-panel (has .sv-panel-container; the banner iframe does not) and the
  // dev doc-ribbon banner.
  //
  // POLL, do not sleep. The it49 lesson, which this spec had not picked up: the banner iframe
  // lazy-loads and renders a skeleton bar first, so a fixed waitForTimeout RACES it and captures
  // an empty body — a flake that reads exactly like "the banner is broken". Re-resolve the frames
  // on every iteration too: Forge iframes REMOUNT after first paint, so a reference taken before
  // the remount goes stale.
  let panel: any = null, bannerText = "";
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    panel = null; bannerText = "";
    const n = await iframes.count();
    for (let i = 0; i < n; i++) {
      const src = (await iframes.nth(i).getAttribute("src").catch(() => "")) || "";
      if (!src.includes(DEV)) continue;
      const cf = iframes.nth(i).contentFrame();
      if ((await cf.locator(".sv-panel-container").count().catch(() => 0)) > 0) { panel = cf; continue; }
      // the doc-ribbon banner (NOT the panel) is the iframe carrying the "Manage Attachments" action
      const t = (await cf.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      if (/Manage Attachments/i.test(t) && /on this page/i.test(t)) bannerText = t.slice(0, 90);
    }
    if (panel && bannerText) break;
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${OUT}/page.png` });
  expect(panel, "dev inline-panel present on the page").toBeTruthy();

  // 2) STUCK-LOADING GUARD: the spinner must not be the terminal state (it26 hang class)
  await expect(panel.locator(".sv-panel-loading")).toHaveCount(0, { timeout: 15000 });
  const terminal = await panel.locator(".sv-card-section, .sv-panel-empty, .sv-panel-error").count();
  expect(terminal, "panel reached a terminal state (cards / empty / error, not a spinner)").toBeGreaterThanOrEqual(1);

  // 3) the panel shows the sealed fixture in a "Sealed" section
  const panelBody = (await panel.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  console.log("### panel body (first 160):", JSON.stringify(panelBody.slice(0, 160)));
  const sealedSection = await panel.locator(".sv-card-section", { hasText: "Sealed" }).count();
  expect(sealedSection, "panel has a 'Sealed' section").toBeGreaterThanOrEqual(1);
  expect(/sv-aql-sealed-fixture/i.test(panelBody), "panel shows the sealed fixture file").toBeTruthy();

  // 4) CONSISTENCY: the banner agrees the fixture is sealed (not "none sealed")
  console.log("### dev banner:", JSON.stringify(bannerText));
  expect(bannerText, "dev banner present").toBeTruthy();
  expect(/\bsealed on this page/i.test(bannerText) && !/none sealed/i.test(bannerText),
    `banner + panel agree the fixture is sealed (banner: "${bannerText}")`).toBeTruthy();
});

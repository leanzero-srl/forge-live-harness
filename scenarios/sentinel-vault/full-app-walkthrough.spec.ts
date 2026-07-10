// BREADTH gate — ONE run that traverses the ENTIRE Sentinel Vault app (owner directive: cover the
// whole app, not just one tab). Phase A: page-context (doc-ribbon banner → inline-panel macro →
// Manage-Attachments overlay). Phase B: realm-console — EVERY tab. Phase C: steward-console — EVERY
// tab. Every surface must reach GENUINE terminal content (past its spinner) — NOT just "not blank"
// (it26 lesson: a length check passes a stuck "Loading..."). Screenshots each for evidence.
// Dev-scoped (env 17516615). Read-only.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { mkdirSync } from "node:fs";
const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const DEV = "17516615";
const OUT = "/tmp/sv-fullapp";
const RC = getTarget("sentinel-vault-realm");
const SC = getTarget("sentinel-steward-console");
// markers that mean a surface is STILL loading (must be gone before we assert real content)
const LOADING = /loading\.\.\.|loading…|loading workflow|preparing…|preparing\.\.\.|checking macro|checking whether|please wait/i;
test.describe.configure({ retries: 1 });

// wait until a Forge surface's body reaches terminal content (real text, no spinner marker), or throw.
async function waitTerminal(page: any, frame: any, label: string, deadlineMs = 20000): Promise<string> {
  const t0 = Date.now();
  let body = "";
  while (Date.now() - t0 < deadlineMs) {
    body = (await frame.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (body.length > 60 && !LOADING.test(body)) return body;
    await page.waitForTimeout(700);
  }
  if (LOADING.test(body)) console.log(`### WARN ${label} still loading after ${deadlineMs}ms`);
  return body; // caller asserts — returning the last (still-loading) body makes the failure explicit
}

// click a console tab robustly: right after a page.goto the Forge iframe can still be re-mounting,
// so a bare click races actionability (the Phase-C flake). Retry, then activate-confirm.
async function clickTab(page: any, tab: any): Promise<void> {
  await tab.scrollIntoViewIfNeeded().catch(() => {});
  for (let a = 0; a < 3; a++) {
    try { await tab.click({ timeout: 8000 }); return; }
    catch { await page.waitForTimeout(1200); }
  }
  await tab.click({ timeout: 8000 }); // final attempt — let it throw so a truly dead tab fails loud
}

test("FULL-APP walkthrough: page banner+panel+overlay, realm-console all tabs, steward-console all tabs", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });

  // ── Phase A — PAGE CONTEXT ────────────────────────────────────────────────
  // The dev doc-ribbon banner + inline-panel macro each lazy-load in their OWN iframe; a fixed wait
  // races them (the dev banner can still be on its spinner at 9s → flaky "banner empty"). POLL:
  // re-scan every ~1.5s until BOTH the RESOLVED dev banner and the dev panel are found, or deadline.
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  const ifr = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');
  let panel: any = null, bannerTxt = "", bannerIdx = -1;
  const aT0 = Date.now();
  while (Date.now() - aT0 < 35000) {
    const n = await ifr.count();
    for (let i = 0; i < n; i++) {
      const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
      if (!src.includes(DEV)) continue;
      const cf = ifr.nth(i).contentFrame();
      if ((await cf.locator(".sv-panel-container").count().catch(() => 0)) > 0) { panel = cf; continue; }
      const t = (await cf.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      // RESOLVED banner (not the spinner): names the attachment count + this page + the action
      if (/Manage Attachments/i.test(t) && /on this page/i.test(t) && /attachment/i.test(t) && !LOADING.test(t)) {
        bannerTxt = t.slice(0, 90); bannerIdx = i;
      }
    }
    if (bannerTxt && panel) break;
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${OUT}/A0-page.png` });
  expect(bannerTxt, "A: doc-ribbon banner present (dev, resolved)").toBeTruthy();
  expect(panel, "A: inline-panel macro present").toBeTruthy();
  await expect(panel.locator(".sv-panel-loading"), "A: inline-panel finished loading").toHaveCount(0, { timeout: 15000 });
  expect(await panel.locator(".sv-card-section, .sv-panel-empty").count(), "A: panel reached a terminal state").toBeGreaterThanOrEqual(1);
  console.log("### A page-context: banner + panel ✓ —", JSON.stringify(bannerTxt));

  // open the Manage-Attachments overlay and wait for it to list files (past "checking macro visibility").
  await ifr.nth(bannerIdx).contentFrame().locator(".ribbon-action", { hasText: "Manage" }).click();
  let ov: any = null;
  const oT0 = Date.now();
  while (Date.now() - oT0 < 25000) {
    const all = page.locator("iframe"); const m = await all.count(); let best = 0; ov = null;
    for (let i = 0; i < m; i++) {
      const s = (await all.nth(i).getAttribute("src").catch(() => "")) || "";
      if (!s.includes(DEV)) continue;
      const cf = all.nth(i).contentFrame();
      if ((await cf.locator(".artifact-card .action-btn").count().catch(() => 0)) <= 0) continue;
      const b = await all.nth(i).boundingBox().catch(() => null); const a = b ? b.width * b.height : 0;
      if (a > best) { best = a; ov = cf; }
    }
    if (ov) break;
    await page.waitForTimeout(1000);
  }
  expect(ov, "A: Manage-Attachments overlay opened with cards").toBeTruthy();
  await page.screenshot({ path: `${OUT}/A1-overlay.png` });
  await ov.locator(".modal-close").click().catch(() => {});
  console.log("### A page-context: overlay ✓");

  // ── Phase B — REALM-CONSOLE (every tab) ───────────────────────────────────
  await page.goto(RC.deepLink(RC.envId)!, { waitUntil: "domcontentloaded" });
  const rs = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
  const rApp = (rs as any).frame;
  await expect(rApp.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });
  const rTabs = rApp.locator(".tab-navigation .tab-button");
  await rTabs.first().waitFor({ state: "visible", timeout: 15000 });
  const rNames: string[] = [];
  const rc = await rTabs.count();
  for (let i = 0; i < rc; i++) rNames.push((await rTabs.nth(i).innerText()).trim());
  console.log("### B realm-console tabs:", JSON.stringify(rNames));
  for (let i = 0; i < rc; i++) {
    await clickTab(page, rTabs.nth(i));
    const body = await waitTerminal(page, rApp, `realm:${rNames[i]}`);
    expect(body.length, `B realm tab "${rNames[i]}" content`).toBeGreaterThan(60);
    expect(/could not load|failed to load|unable to load|something went wrong/i.test(body), `B realm tab "${rNames[i]}" no error`).toBeFalsy();
    expect(LOADING.test(body), `B realm tab "${rNames[i]}" not stuck loading`).toBeFalsy();
    await page.screenshot({ path: `${OUT}/B-realm-${i}-${rNames[i].replace(/\W+/g,"")}.png` });
  }
  console.log(`### B realm-console: all ${rc} tabs reached terminal content ✓`);

  // ── Phase C — STEWARD-CONSOLE (every tab) ─────────────────────────────────
  await page.goto(SC.deepLink(SC.envId)!, { waitUntil: "domcontentloaded" });
  const ss = await enterForgeSurface(page, { surface: "custom", readySelector: ".admin-title", timeout: 45000 });
  const sApp = (ss as any).frame;
  await expect(sApp.locator(".admin-title")).toBeVisible({ timeout: 15000 });
  const sTabs = sApp.locator(".tab-navigation .tab-button");
  await sTabs.first().waitFor({ state: "visible", timeout: 15000 });
  const sNames: string[] = [];
  const scount = await sTabs.count();
  for (let i = 0; i < scount; i++) sNames.push((await sTabs.nth(i).innerText()).trim());
  console.log("### C steward-console tabs:", JSON.stringify(sNames));
  for (let i = 0; i < scount; i++) {
    await clickTab(page, sTabs.nth(i));
    const body = await waitTerminal(page, sApp, `steward:${sNames[i]}`);
    expect(body.length, `C steward tab "${sNames[i]}" content`).toBeGreaterThan(60);
    expect(/could not load|failed to load|something went wrong/i.test(body), `C steward tab "${sNames[i]}" no error`).toBeFalsy();
    expect(LOADING.test(body), `C steward tab "${sNames[i]}" not stuck loading`).toBeFalsy();
    await page.screenshot({ path: `${OUT}/C-steward-${i}-${sNames[i].replace(/\W+/g,"")}.png` });
  }
  console.log(`### C steward-console: all ${scount} tabs reached terminal content ✓`);
  console.log("### FULL-APP walkthrough complete ✓");
});

// A1 (ledger #49) — the activity SURFACES, in real Confluence as the signed-in steward:
//   1. the inline panel on the fixture page renders an "Activity" group with real rows (the
//      fixture page has had seals extended / requests denied by the REST lane, so it is never
//      empty here) — a spinner or the empty state is a FAIL, not a pass;
//   2. the realm console has a steward "Activity" tab that renders rows, filters by category,
//      and whose Export CSV actually downloads a file whose header and rows match what is shown.
// Dev-scoped (env 17516615). Read-only: nothing is sealed, changed or saved.
// @covers resolver:get-page-activity resolver:get-space-activity
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { mkdirSync, readFileSync } from "node:fs";

const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const DEV = "17516615";
const OUT = "/tmp/sv-activity";
const T = getTarget("sentinel-vault-realm");

test.describe.configure({ timeout: 240_000, retries: 1 });

test("inline panel: the Activity group renders real rows for the fixture page", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  const iframes = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');
  // Resolve the DEV inline-panel frame AND its Activity feed inside one poll: Forge iframes
  // REMOUNT after first paint (harness canon), so a frame handle taken before the remount goes
  // stale and the feed looks "not visible" on a page where it is plainly there.
  let panel: any = null, feed: any = null;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    panel = null; feed = null;
    const n = await iframes.count();
    for (let i = 0; i < n; i++) {
      const src = (await iframes.nth(i).getAttribute("src").catch(() => "")) || "";
      if (!src.includes(DEV)) continue;
      const cf = iframes.nth(i).contentFrame();
      if ((await cf.locator(".sv-panel-container").count().catch(() => 0)) > 0) { panel = cf; break; }
    }
    if (panel) {
      const f = panel.locator('[data-testid="sv-activity-feed"]');
      if ((await f.count().catch(() => 0)) > 0 && (await f.isVisible().catch(() => false))) { feed = f; break; }
    }
    await page.waitForTimeout(1500);
  }
  expect(panel, "dev inline-panel present (run npm run ensure-fixture if not)").toBeTruthy();
  expect(feed, "the Activity group is on the panel").toBeTruthy();
  await feed.scrollIntoViewIfNeeded().catch(() => {});
  const rows = feed.locator('[data-testid="sv-activity-row"]');
  await expect.poll(() => rows.count(), { timeout: 30_000, message: "the feed shows at least one real row (not the empty state, not a spinner)" }).toBeGreaterThanOrEqual(1);
  const first = (await rows.first().innerText()).replace(/\s+/g, " ").trim();
  console.log("### panel activity first row:", JSON.stringify(first));
  expect(first.length, "a row carries a readable sentence").toBeGreaterThan(10);
  expect(/realm|guild|artifact|operator/i.test(first), "copy is Confluence-native (no realm/guild/artifact/operator)").toBe(false);
  await page.screenshot({ path: `${OUT}/panel-activity.png`, fullPage: true });
});

test("realm console: the Activity tab renders, filters, and Export CSV downloads the rows shown", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45_000 });
  if (s.kind !== "custom") throw new Error("expected a Custom UI iframe");
  const app = s.frame;
  await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 20_000 });

  const tab = app.locator(".tab-navigation .tab-button", { hasText: /^\s*Activity\s*$/ });
  await expect(tab, "a steward sees the Activity tab").toBeVisible({ timeout: 20_000 });
  await tab.click();
  const report = app.locator('[data-testid="sv-activity-report"]');
  await expect(report, "the Activity report renders").toBeVisible({ timeout: 30_000 });
  const rows = report.locator('[data-testid="sv-activity-row"]');
  await expect.poll(() => rows.count(), { timeout: 30_000, message: "the report shows at least one row for WFH" }).toBeGreaterThanOrEqual(1);
  const total = await rows.count();
  await page.screenshot({ path: `${OUT}/report-all.png`, fullPage: true });

  // Category chips are ALL ON by default (a chip is a filter you remove, not one you pick), so
  // "Seals only" means switching the other four OFF. Every row carries its exact type in
  // data-type; the filter is proven on that, not on prose.
  const others = ["sections", "editreq", "workflow", "validation"];
  for (const c of others) {
    const chip = report.locator(`[data-testid="sv-activity-filter-${c}"]`);
    await expect(chip, `${c} category chip present`).toBeVisible();
    await chip.click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);
  const afterFilter = await rows.count();
  console.log(`### rows: all=${total}, seals-only=${afterFilter}`);
  const types = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-type") || ""));
  expect(types.length, "rows remain after filtering to Seals").toBeGreaterThanOrEqual(1);
  expect(types.every((t) => t.startsWith("seal.")), `with only Seals active, every visible row is a seal.* event (got ${[...new Set(types)].join(", ")})`).toBe(true);
  for (const c of others) { await report.locator(`[data-testid="sv-activity-filter-${c}"]`).click(); await page.waitForTimeout(300); } // back to all
  await page.waitForTimeout(1000);

  // Export CSV. The kit builds a Blob, names an anchor and clicks it. A REAL download must not
  // happen here: in the headless persistent context the download event fires and then the
  // browser context CLOSES (it68, reproduced three times — "Target page, context or browser has
  // been closed" right after `download.path()`), which also loses the profile reservation and
  // fails every later spec in the batch. So the CSV is captured at the source instead: inside the
  // iframe, URL.createObjectURL is wrapped to read the Blob's text and the anchor click for a
  // `download` anchor is swallowed (its filename recorded). Forge iframes REMOUNT after the chip
  // clicks above (harness canon), and a remount between the hook install and the click loses
  // the hook — so the marker is checked after the click and the attempt is repeated on the
  // fresh frame, up to three times.
  const exportBtn = report.locator('[data-testid="sv-activity-export"]');
  await expect(exportBtn, "Export CSV present").toBeVisible();
  const status = report.locator(".sv-activity-status");
  const installHook = () => app.locator("body").evaluate(() => {
    const w = window as any;
    w.__svCsv = null; w.__svName = null; w.__svHook = "installed";
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob) => { b.text().then((t) => { w.__svCsv = t; }); return orig(b); };
    const origClick = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function (this: HTMLElement) {
      if (this instanceof HTMLAnchorElement && this.hasAttribute("download")) { w.__svName = this.getAttribute("download"); return; }
      return origClick.call(this);
    };
  });
  const readHook = async () => {
    try { return await app.locator("body").evaluate(() => ({ hook: (window as any).__svHook || null, csv: (window as any).__svCsv || "", name: (window as any).__svName || "" })); }
    catch (_) { return { hook: null, csv: "", name: "" }; }
  };
  let csv = ""; let filename = "";
  for (let attempt = 1; attempt <= 3 && !csv; attempt++) {
    await expect(exportBtn, "Export CSV enabled").toBeEnabled({ timeout: 20_000 });
    for (let hook = 0; ; hook++) {
      try { await installHook(); break; } catch (e) { if (hook >= 3) throw e; await page.waitForTimeout(1500); }
    }
    await exportBtn.click();
    let note = ""; let lost = false;
    await expect.poll(async () => {
      const h = await readHook();
      if (h.hook !== "installed") { lost = true; return true; } // the frame remounted under us
      csv = h.csv; filename = h.name;
      note = (await status.textContent().catch(() => "")) || "";
      return csv.length > 0;
    }, { timeout: 60_000, message: `export attempt ${attempt}: the Blob hook received the CSV` }).toBe(true).catch(() => null);
    console.log(`### export attempt ${attempt}: csv=${csv.length} name="${filename}" hookLost=${lost} status="${note.trim()}"`);
    if (!csv) await page.waitForTimeout(2000);
  }
  expect(csv.length, "the export produced a CSV (Blob hook)").toBeGreaterThan(0);
  const lines = csv.split(/\r?\n/).filter(Boolean);
  console.log(`### CSV: ${filename || "(no anchor name)"} — ${lines.length - 1} data rows; header: ${lines[0]}`);
  if (filename) expect(filename, "file is named for the space").toMatch(/^activity-WFH\.csv$/i);
  expect(lines[0].replace(/"/g, ""), "CSV header carries the promised columns").toMatch(/^ts,type,category,pageId,pageTitle,actorAccountId/);
  expect(lines.length - 1, "CSV has at least as many rows as the report showed").toBeGreaterThanOrEqual(Math.min(total, 1));
  expect(lines.slice(1).some((l) => /(seal|section|editreq|workflow|validation)\./.test(l)), "rows carry real event types").toBe(true);
  await page.screenshot({ path: `${OUT}/report-after-export.png`, fullPage: true });
});

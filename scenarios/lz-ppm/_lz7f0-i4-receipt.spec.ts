// LZ7F0 item 4 — receipt Targets IDENTITY (commit 6a1251f8), dev 7.15.0.
// Two targets on LZPT: one EPIC-scoped (LZPT-190 "E5 · Edge Dates", 5 leaf tasks)
// and one WHOLE-PLAN (62 leaf tasks). LZPT carries NO fixVersions, so the
// release-scoped row is not constructible on this bed.
// Expected, for EVERY target row, on BOTH readers (in-app receipt and the
// downloaded HTML), the SAME three strings:
//   identity  "<name> · 2026-10-30"
//   scope     "LZPT-190 · E5 · Edge Dates · 5 tasks"  /  "Whole plan · 62 tasks"
//             (no "(epic 21782)" parenthetical, no "1 tasks" plural defect)
//   finish    a date, or the single word "Unavailable"
// And NO UUID anywhere in the Targets section or the downloaded rows.
// Restores: report deleted, both targets deleted.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7f0";
const PLAN = "LZPT Scenarios";
const T_EPIC = "LZ7F0 epic gate", T_PLAN = "LZ7F0 plan gate";
const REPORT = "LZ7F0 identity archive";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
test.describe.configure({ retries: 0, timeout: 3_000_000 });
const txt = async (l: any) => ((await l.textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("F4: one identity per target row, on both readers", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Planning$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);

  const addTarget = async (name: string, scopeMatch: RegExp | null) => {
    await frame.getByRole("button", { name: /^Targets$/i }).first().click().catch(() => {});
    const ed = frame.locator('[data-testid="targets-editor"]');
    await ed.waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(2500);
    await frame.locator("button").filter({ hasText: /^Add target$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(1500);
    await ed.getByLabel("Target name").fill(name);
    await page.waitForTimeout(400);
    await ed.getByRole("button", { name: /Target date/i }).first().dispatchEvent("click");
    await page.waitForTimeout(1200);
    await frame.locator('button[aria-label="Next month"]').first().dispatchEvent("click");
    await page.waitForTimeout(800);
    await frame.locator('button[aria-label="2026-10-30"]').first().dispatchEvent("click").catch((e: any) => console.log("DAY_ERR", String(e).slice(0, 90)));
    await page.waitForTimeout(1200);
    console.log(name, "DATE_BTN", await txt(ed.getByRole("button", { name: /Target date/i }).first()));
    if (scopeMatch) {
      const scopeSel = ed.getByRole("combobox").first();
      await scopeSel.click();
      await page.waitForTimeout(1200);
      const opt = frame.locator('[role="option"]').filter({ hasText: scopeMatch }).first();
      console.log(name, "SCOPE_OPT", await txt(opt));
      await opt.dispatchEvent("click");
      await page.waitForTimeout(1500);
      console.log(name, "SCOPE_AFTER", await txt(scopeSel));
    }
    await frame.locator("button").filter({ hasText: /^Save target$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(7000);
    console.log(name, "TARGET_ROWS", JSON.stringify((await frame.locator('[data-testid="target-row"]').allTextContents().catch(() => [])).map((r: string) => r.replace(/\s+/g, " ").slice(0, 200))));
  };
  await addTarget(T_EPIC, /E5|Edge Dates/i);
  await addTarget(T_PLAN, null);
  await page.screenshot({ path: `${OUT}/f4-00-targets.png`, fullPage: true });

  // ---------- capture a FRESH archive report ----------
  await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
  const sec = frame.locator('[data-testid="sponsor-reports"]');
  await sec.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(3000);
  console.log("EXISTING_REPORTS", (await txt(sec)).slice(0, 300));
  await sec.getByLabel("Report name").fill(REPORT);
  await sec.getByRole("button", { name: /Capture sponsor report/i }).first().click();
  for (let i = 0; i < 200; i++) {
    const t = await txt(sec);
    if (/Immutable report captured|Report captured and verified/i.test(t)) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(5000);
  console.log("CAPTURE_NOTICE", (await txt(sec)).slice(0, 300));

  // ---------- the TARGETS section of the receipt ----------
  const secBtn = frame.locator("button").filter({ hasText: /^(Timeline|Targets|Changes) \(\d+\)$/ }).first();
  console.log("SECTION_BTN", await txt(secBtn));
  await secBtn.click().catch(() => {});
  await page.waitForTimeout(1500);
  await frame.locator('[role="option"]').filter({ hasText: /^Targets \(\d+\)$/ }).first().dispatchEvent("click").catch((e: any) => console.log("OPT_ERR", String(e).slice(0, 120)));
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/f4-01-receipt-targets.png`, fullPage: true });
  const trows = await frame.locator('[data-target-key]').evaluateAll((els: any[]) => els.map((e) => ({
    key: e.getAttribute("data-target-key"),
    cells: Array.from(e.querySelectorAll("td,th,[data-testid]")).map((c: any) => (c.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean),
    text: (e.textContent || "").replace(/\s+/g, " ").trim(),
  })));
  console.log("RECEIPT_TARGET_ROWS", JSON.stringify(trows, null, 1));
  const secText = await txt(frame.locator('[data-testid="report-preview"], [data-testid="sponsor-reports"]').first());
  fs.writeFileSync(`${OUT}/f4-receipt-section.txt`, secText);
  console.log("RECEIPT_SNIP", JSON.stringify((secText.match(/LZ7F0 epic gate[\s\S]{0,400}/) || [])[0]));
  console.log("RECEIPT_SNIP2", JSON.stringify((secText.match(/LZ7F0 plan gate[\s\S]{0,400}/) || [])[0]));
  console.log("RECEIPT_UUID_IN_TARGET_TEXT", trows.map((r: any) => `${r.key}:${UUID.test(r.text)}`).join(" "));
  console.log("RECEIPT_PARENTHETICAL", JSON.stringify((secText.match(/\((epic|release|plan)\s+\d+\)/gi) || [])));
  console.log("RECEIPT_ONE_TASKS", /\b1 tasks\b/.test(secText));

  // ---------- the DOWNLOAD ----------
  const dlBtn = frame.locator("button").filter({ hasText: /Download complete HTML report/i }).first();
  console.log("DOWNLOAD_BTN", await txt(dlBtn));
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 150_000 }).catch((e: any) => { console.log("NO_DOWNLOAD_EVENT", String(e).slice(0, 80)); return null; }),
    dlBtn.click().catch((e: any) => console.log("DL_CLICK_ERR", String(e).slice(0, 80))),
  ]);
  if (dl) {
    const p = `${OUT}/f4-archive.html`;
    await dl.saveAs(p);
    const html = fs.readFileSync(p, "utf8");
    console.log("DOWNLOAD_BYTES", html.length, "NAME", dl.suggestedFilename());
    const rows = html.match(/<tr data-target-key="[^"]*">[\s\S]*?<\/tr>/g) || [];
    console.log("DL_TARGET_ROW_COUNT", rows.length);
    for (const r of rows) {
      const cells = (r.match(/<td>([\s\S]*?)<\/td>/g) || []).map((c) => c.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
      console.log("  DL_ROW_KEY", (r.match(/data-target-key="([^"]*)"/) || [])[1], "CELLS", JSON.stringify(cells));
      console.log("  DL_ROW_UUID_IN_CELLS", cells.some((c) => UUID.test(c)));
    }
    console.log("DL_PARENTHETICAL", JSON.stringify((html.match(/\((epic|release|plan)\s+\d+\)/gi) || [])));
    console.log("DL_ONE_TASKS", /\b1 tasks\b/.test(html));
  }
  await page.screenshot({ path: `${OUT}/f4-02-downloaded.png`, fullPage: true });

  // ---------- restore ----------
  await frame.locator("button").filter({ hasText: /^Delete report$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DEL_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(1500);
  await frame.locator("button").filter({ hasText: /^Delete report$/ }).last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(12000);
  console.log("AFTER_DELETE_REPORTS", (await txt(frame.locator('[data-testid="sponsor-reports"]'))).slice(0, 400));
  for (const name of [T_EPIC, T_PLAN]) {
    await frame.getByRole("button", { name: /^Targets$/i }).first().click().catch(() => {});
    await page.waitForTimeout(4000);
    await frame.locator('[data-testid="target-row"]').filter({ hasText: name }).first().locator("button").filter({ hasText: /^Delete$/ }).first().dispatchEvent("click").catch((e: any) => console.log("TDEL_ERR", name, String(e).slice(0, 90)));
    await page.waitForTimeout(1500);
    await frame.locator("button").filter({ hasText: /^Delete target$/ }).last().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(7000);
  }
  console.log("TARGETS_FINAL", JSON.stringify(await frame.locator('[data-testid="target-row"]').allTextContents().catch(() => [])));
  await page.screenshot({ path: `${OUT}/f4-03-clean.png`, fullPage: true });
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
});

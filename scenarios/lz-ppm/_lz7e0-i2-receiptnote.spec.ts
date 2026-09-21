// LZ7E0 item 2 — dev 7.14.0 / UI v4.58.651, bed "LZPT Scenarios".
// Add ONE epic-scoped target, capture a FRESH archive report, and read the target
// row on BOTH readers: the in-app receipt line (`report-target-forecast`) and the
// downloaded HTML. An unsimulated target must read "Not simulated — <reason>" (or
// the reason alone when it already opens with "Not simulated"), the same words on
// both, and "Not simulated" must not appear twice in that one line.
// Restores: the report is deleted, then the target is deleted.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7e0";
const PLAN = "LZPT Scenarios";
const TARGET_NAME = "LZ7E0 epic target";
const REPORT = "LZ7E0 archive note";
test.describe.configure({ retries: 0, timeout: 2_400_000 });
const txt = async (l: any) => ((await l.textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("E2: the receipt and the download compose 'Not simulated' once", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Planning$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);

  // ---------- add ONE epic-scoped target ----------
  await frame.getByRole("button", { name: /^Targets$/i }).first().click().catch(() => {});
  const ed = frame.locator('[data-testid="targets-editor"]');
  await ed.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(3000);
  console.log("TARGETS_BEFORE", JSON.stringify(await frame.locator('[data-testid="target-row"]').allTextContents().catch(() => [])));
  await frame.locator("button").filter({ hasText: /^Add target$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(1500);
  await ed.getByLabel("Target name").fill(TARGET_NAME);
  await page.waitForTimeout(500);
  // the date is a CUSTOM picker (no native input): open it, step a month, click the day
  await ed.getByRole("button", { name: /Target date/i }).first().dispatchEvent("click");
  await page.waitForTimeout(1200);
  console.log("CAL_OPEN", await frame.locator('[role="dialog"][aria-label*="calendar"]').count());
  await frame.locator('button[aria-label="Next month"]').first().dispatchEvent("click");
  await page.waitForTimeout(800);
  await frame.locator('button[aria-label="2026-10-30"]').first().dispatchEvent("click").catch((e: any) => console.log("DAY_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(1200);
  console.log("DATE_BTN", await txt(ed.getByRole("button", { name: /Target date/i }).first()));
  const scopeSel = ed.getByRole("combobox").first();
  console.log("SCOPE_BEFORE", await txt(scopeSel));
  await scopeSel.click();
  await page.waitForTimeout(1200);
  const opts = await frame.locator('[role="option"]').allTextContents().catch(() => []);
  console.log("SCOPE_OPTIONS", JSON.stringify(opts));
  const epicOpt = frame.locator('[role="option"]').filter({ hasText: /E5|Edge Dates/i }).first();
  console.log("EPIC_OPT", await txt(epicOpt));
  await epicOpt.dispatchEvent("click");
  await page.waitForTimeout(1500);
  console.log("SCOPE_AFTER", await txt(scopeSel));
  console.log("FORM_PREVIEW", (await txt(ed)).match(/\d+ current leaf tasks[^.]*\./)?.[0] || (await txt(ed)).slice(-300));
  await page.screenshot({ path: `${OUT}/e2-00-target-form.png`, fullPage: true });
  await frame.locator("button").filter({ hasText: /^Save target$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(6000);
  const rows = await frame.locator('[data-testid="target-row"]').allTextContents().catch(() => []);
  console.log("TARGETS_AFTER", JSON.stringify(rows.map((r: string) => r.replace(/\s+/g, " ").slice(0, 220))));
  const targetId = await frame.locator('[data-testid="target-row"]').first().getAttribute("data-target-id").catch(() => null);
  console.log("TARGET_ID", targetId);
  await page.screenshot({ path: `${OUT}/e2-01-target-saved.png`, fullPage: true });

  // ---------- capture a FRESH archive report ----------
  await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
  const sec = frame.locator('[data-testid="sponsor-reports"]');
  await sec.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(3000);
  console.log("EXISTING_REPORTS", (await txt(sec)).slice(0, 400));
  await sec.getByLabel("Report name").fill(REPORT);
  await sec.getByRole("button", { name: /Capture sponsor report/i }).first().click();
  for (let i = 0; i < 200; i++) {
    const t = await txt(sec);
    if (/Immutable report captured|Report captured and verified/i.test(t)) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(5000);
  console.log("CAPTURE_NOTICE", (await txt(sec)).slice(0, 400));
  await page.screenshot({ path: `${OUT}/e2-02-receipt.png`, fullPage: true });

  // ---------- the TARGETS section of the receipt ----------
  const secBtn = frame.locator("button").filter({ hasText: /^(Timeline|Targets|Changes) \(\d+\)$/ }).first();
  console.log("SECTION_BTN", await txt(secBtn));
  await secBtn.click().catch(() => {});
  await page.waitForTimeout(1500);
  console.log("SECTION_OPTIONS", JSON.stringify(await frame.locator('[role="option"]').allTextContents().catch(() => [])));
  await frame.locator('[role="option"]').filter({ hasText: /^Targets \(\d+\)$/ }).first().dispatchEvent("click").catch((e: any) => console.log("OPT_ERR", String(e).slice(0, 120)));
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/e2-03-targets.png`, fullPage: true });
  const lines = await frame.locator('[data-testid="report-target-forecast"]').allTextContents().catch(() => []);
  console.log("RECEIPT_TARGET_LINES", JSON.stringify(lines.map((l: string) => l.replace(/\s+/g, " "))));
  for (const l of lines) {
    const n = (l.match(/Not simulated/g) || []).length;
    console.log("  RECEIPT_LINE:", JSON.stringify(l.replace(/\s+/g, " ")), "| NotSimulatedCount:", n, "| hasUnavailable:", /Unavailable/.test(l), "| opensWithLabel:", l.trim().startsWith("Not simulated"));
  }
  const tbody = await bodyText(frame);
  fs.writeFileSync(`${OUT}/e2-targets-receipt.txt`, tbody);
  console.log("TARGETS_SNIP", JSON.stringify((tbody.match(new RegExp(TARGET_NAME.replace(/ /g, "\\s") + "[\\s\\S]{0,600}")) || [])[0]));

  // ---------- the DOWNLOAD ----------
  const dlBtn = frame.locator("button").filter({ hasText: /Download complete HTML report/i }).first();
  console.log("DOWNLOAD_BTN", await txt(dlBtn));
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }).catch((e: any) => { console.log("NO_DOWNLOAD_EVENT", String(e).slice(0, 80)); return null; }),
    dlBtn.click().catch((e: any) => console.log("DL_CLICK_ERR", String(e).slice(0, 80))),
  ]);
  if (dl) {
    const p = `${OUT}/e2-archive-download.html`;
    await dl.saveAs(p);
    const html = fs.readFileSync(p, "utf8");
    console.log("DOWNLOAD_BYTES", html.length, "NAME", dl.suggestedFilename());
    const trow = html.match(/<tr data-target-key="[^"]*">[\s\S]*?<\/tr>/g) || [];
    console.log("DL_TARGET_ROWS", JSON.stringify(trow.map((r) => r.replace(/<[^>]*>/g, " | ").replace(/\s+/g, " "))));
    for (const r of trow) {
      const plain = r.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      console.log("  DL_ROW NotSimulatedCount:", (plain.match(/Not simulated/g) || []).length, "| hasUnavailable:", /Unavailable/.test(plain));
      console.log("  DL_ROW_CELLS", JSON.stringify((r.match(/<td>([\s\S]*?)<\/td>/g) || []).map((c) => c.replace(/<[^>]*>/g, "").replace(/\s+/g, " "))));
    }
  }
  await page.screenshot({ path: `${OUT}/e2-04-downloaded.png`, fullPage: true });

  // ---------- restore: delete the report, then the target ----------
  await frame.locator("button").filter({ hasText: /^Delete report$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DEL_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(1500);
  await frame.locator("button").filter({ hasText: /^Delete report$/ }).last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(12000);
  console.log("AFTER_DELETE", (await txt(frame.locator('[data-testid="sponsor-reports"]'))).slice(0, 500));
  await page.screenshot({ path: `${OUT}/e2-05-report-deleted.png`, fullPage: true });

  await frame.getByRole("button", { name: /^Targets$/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="target-row"]').filter({ hasText: TARGET_NAME }).first().locator("button").filter({ hasText: /^Delete$/ }).first().dispatchEvent("click").catch((e: any) => console.log("TDEL_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(1500);
  await frame.locator("button").filter({ hasText: /^Delete target$/ }).last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(6000);
  console.log("TARGETS_FINAL", JSON.stringify(await frame.locator('[data-testid="target-row"]').allTextContents().catch(() => [])));
  await page.screenshot({ path: `${OUT}/e2-06-target-deleted.png`, fullPage: true });
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
});

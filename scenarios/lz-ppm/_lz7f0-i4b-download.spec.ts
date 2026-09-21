// LZ7F0 item 4b — the DOWNLOAD half, captured at `URL.createObjectURL` because
// clicking the download anchor in a HEADLESS run tears the context down (it did,
// on the first attempt at this item — the trap is NOT limited to Export CSV).
// Reads the already-captured report "LZ7F0 identity archive", compares the three
// target strings on both readers, then deletes the report and both targets.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7f0";
const PLAN = "LZPT Scenarios", REPORT = "LZ7F0 identity archive";
const T_EPIC = "LZ7F0 epic gate", T_PLAN = "LZ7F0 plan gate";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
test.describe.configure({ retries: 0, timeout: 3_000_000 });
const txt = async (l: any) => ((await l.textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("F4b: receipt vs download, three strings per target row", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  const real: any = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Planning$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
  const sec = frame.locator('[data-testid="sponsor-reports"]');
  await sec.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(4000);
  console.log("REPORTS_LIST", (await txt(sec)).slice(0, 400));
  await frame.locator("button").filter({ hasText: /Open captured report/i }).first().dispatchEvent("click").catch((e: any) => console.log("OPEN_ERR", String(e).slice(0, 100)));
  await page.waitForTimeout(9000);
  const secBtn = frame.locator("button").filter({ hasText: /^(Timeline|Targets|Changes) \(\d+\)$/ }).first();
  console.log("SECTION_BTN", await txt(secBtn));
  await secBtn.click().catch(() => {});
  await page.waitForTimeout(1500);
  console.log("SECTION_OPTIONS", JSON.stringify(await frame.locator('[role="option"]').allTextContents().catch(() => [])));
  await frame.locator('[role="option"]').filter({ hasText: /^Targets \(\d+\)$/ }).first().dispatchEvent("click").catch((e: any) => console.log("OPT_ERR", String(e).slice(0, 120)));
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/f4b-01-receipt.png`, fullPage: true });
  const receipt = await frame.locator('table[aria-label="Report preview"] tbody tr').evaluateAll((trs: any[]) => trs.map((tr) => ({
    identity: (tr.querySelector("th")?.textContent || "").replace(/\s+/g, " ").trim(),
    cells: Array.from(tr.querySelectorAll("td")).map((td: any) => (td.textContent || "").replace(/\s+/g, " ").trim()),
    scopeP: (tr.querySelector("td p")?.textContent || "").replace(/\s+/g, " ").trim(),
    forecast: (tr.querySelector('[data-testid="report-target-forecast"]')?.textContent || "").replace(/\s+/g, " ").trim(),
  })));
  console.log("RECEIPT_ROWS", JSON.stringify(receipt, null, 1));

  // ---------- the DOWNLOAD, captured as a Blob (never click the anchor) ----------
  await real.evaluate(() => {
    (window as any).__blobs = [];
    const mk = URL.createObjectURL.bind(URL);
    (URL as any).createObjectURL = (b: any) => { (window as any).__blobs.push(b); return mk(b); };
    (URL as any).revokeObjectURL = () => {};
    const proto: any = HTMLAnchorElement.prototype;
    const orig = proto.click;
    proto.click = function () { if (this.download) return; return orig.apply(this, arguments as any); };
  });
  await frame.locator("button").filter({ hasText: /Download complete HTML report/i }).first().dispatchEvent("click").catch((e: any) => console.log("DL_ERR", String(e).slice(0, 100)));
  for (let i = 0; i < 60; i++) {
    const n = await real.evaluate(() => ((window as any).__blobs || []).length);
    if (n) break;
    await page.waitForTimeout(2000);
  }
  const files: string[] = await real.evaluate(async () => {
    const out: string[] = [];
    for (const b of (window as any).__blobs || []) { try { out.push(await b.text()); } catch (e) { out.push(`(err ${e})`); } }
    return out;
  });
  console.log("BLOBS", files.length, "BYTES", files.map((f) => f.length).join(","));
  if (files.length) {
    const html = files[files.length - 1];
    fs.writeFileSync(`${OUT}/f4b-archive.html`, html);
    const rows = html.match(/<tr data-target-key="[^"]*">[\s\S]*?<\/tr>/g) || [];
    console.log("DL_TARGET_ROW_COUNT", rows.length);
    for (const r of rows) {
      const key = (r.match(/data-target-key="([^"]*)"/) || [])[1];
      const cells = (r.match(/<td>([\s\S]*?)<\/td>/g) || []).map((c) => c.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
      console.log("  DL_ROW", JSON.stringify({ key, keyIsUuid: UUID.test(String(key)), cells, cellsHaveUuid: cells.some((c) => UUID.test(c)) }));
    }
    console.log("DL_PARENTHETICAL", JSON.stringify((html.match(/\((epic|release|plan)\s+\d+\)/gi) || [])));
    console.log("DL_ONE_TASKS", /\b1 tasks\b/.test(html));
    console.log("DL_UNAVAILABLE_COUNT", (html.match(/Unavailable/g) || []).length);
    console.log("DL_EMDASH_FINISH", /<td>\s*—\s*<\/td>/.test(html));
  }
  await page.screenshot({ path: `${OUT}/f4b-02-after-download.png`, fullPage: true });

  // ---------- restore ----------
  await frame.locator("button").filter({ hasText: /^Delete report$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DEL_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(1800);
  await frame.locator("button").filter({ hasText: /^Delete report$/ }).last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(12000);
  console.log("AFTER_DELETE_REPORTS", (await txt(sec)).slice(0, 350));
  for (const name of [T_EPIC, T_PLAN]) {
    await frame.getByRole("button", { name: /^Targets$/i }).first().click().catch(() => {});
    await page.waitForTimeout(4500);
    await frame.locator('[data-testid="target-row"]').filter({ hasText: name }).first().locator("button").filter({ hasText: /^Delete$/ }).first().dispatchEvent("click").catch((e: any) => console.log("TDEL_ERR", name, String(e).slice(0, 90)));
    await page.waitForTimeout(1800);
    await frame.locator("button").filter({ hasText: /^Delete target$/ }).last().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(8000);
  }
  console.log("TARGETS_FINAL", JSON.stringify(await frame.locator('[data-testid="target-row"]').allTextContents().catch(() => [])));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/f4b-03-clean.png`, fullPage: true });
});

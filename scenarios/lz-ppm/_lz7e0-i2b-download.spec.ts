// LZ7E0 item 2 (second half) — the DOWNLOAD of the archive captured by E2 must
// print the SAME composed note as the receipt, once. The epic-scoped target is
// deleted FIRST (the capture is immutable, so it keeps its frozen target row).
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

test("E2b: the download composes the same note once; the target is removed", async ({ page }) => {
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
  await frame.getByRole("button", { name: /^Planning$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);

  // NOTE: the target was already deleted by the previous run of this spec.
  // ---------- delete the target first (the capture froze its own copy) ----------
  await frame.getByRole("button", { name: /^Targets$/i }).first().click().catch(() => {});
  await frame.locator('[data-testid="targets-editor"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(3000);
  console.log("TARGETS_NOW", JSON.stringify((await frame.locator('[data-testid="target-row"]').allTextContents().catch(() => [])).map((t: string) => t.replace(/\s+/g, " ").slice(0, 120))));
  await frame.locator('[data-testid="target-row"]').filter({ hasText: TARGET_NAME }).first().locator("button").filter({ hasText: /^Delete$/ }).first().dispatchEvent("click").catch((e: any) => console.log("TDEL_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(2000);
  await frame.locator("button").filter({ hasText: /^Delete target$/ }).last().dispatchEvent("click").catch((e: any) => console.log("TCONF_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(7000);
  console.log("TARGETS_AFTER_DELETE", JSON.stringify(await frame.locator('[data-testid="target-row"]').allTextContents().catch(() => [])));
  await page.screenshot({ path: `${OUT}/e2b-00-target-deleted.png`, fullPage: true });

  // ---------- open the captured report and download it ----------
  await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
  const sec = frame.locator('[data-testid="sponsor-reports"]');
  await sec.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(4000);
  console.log("REPORT_LIST", (await txt(sec)).slice(0, 600));
  const openBtn = frame.locator("button").filter({ hasText: /^Open captured report$/ });
  console.log("OPEN_BTN_COUNT", await openBtn.count());
  if (await openBtn.count()) await openBtn.first().dispatchEvent("click").catch((e: any) => console.log("OPEN_ERR", String(e).slice(0, 90)));
  else await frame.getByText(REPORT, { exact: false }).first().dispatchEvent("click").catch((e: any) => console.log("OPEN_ERR2", String(e).slice(0, 90)));
  await page.waitForTimeout(10000);
  console.log("RECEIPT_TARGET_LINES", JSON.stringify(await frame.locator('[data-testid="report-target-forecast"]').allTextContents().catch(() => [])));
  console.log("OPENED", (await txt(sec)).slice(0, 300));
  await page.screenshot({ path: `${OUT}/e2b-01-report-open.png` });
  const dlBtn = frame.locator("button").filter({ hasText: /Download complete HTML report/i }).first();
  console.log("DOWNLOAD_BTN", await txt(dlBtn), "count", await frame.locator("button").filter({ hasText: /Download complete HTML report/i }).count());
  const p = `${OUT}/e2b-archive-download.html`;
  try {
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 180_000 }),
      dlBtn.dispatchEvent("click"),
    ]);
    await dl.saveAs(p);
    console.log("DOWNLOAD_SAVED", fs.statSync(p).size, "NAME", dl.suggestedFilename());
  } catch (e: any) { console.log("DOWNLOAD_FAILED", String(e).slice(0, 200)); }
  if (fs.existsSync(p)) {
    const html = fs.readFileSync(p, "utf8");
    const trow = html.match(/<tr data-target-key="[^"]*">[\s\S]*?<\/tr>/g) || [];
    console.log("DL_TARGET_ROW_COUNT", trow.length);
    for (const r of trow) {
      const cells = (r.match(/<td>([\s\S]*?)<\/td>/g) || []).map((c) => c.replace(/<[^>]*>/g, "").replace(/\s+/g, " "));
      const plain = r.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      console.log("  DL_ROW_CELLS", JSON.stringify(cells));
      console.log("  DL_ROW NotSimulatedCount:", (plain.match(/Not simulated/g) || []).length, "| hasUnavailable:", /Unavailable/.test(plain), "| doubleLabel:", /Not simulated\s*[—-]\s*Not simulated/.test(plain));
    }
  }
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/e2b-02-final.png` });
});

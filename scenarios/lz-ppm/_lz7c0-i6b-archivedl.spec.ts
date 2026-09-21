// LZ7C0 item 6, second half + CLEANUP. Opens the two LZ7C0 reports, downloads the
// ARCHIVE html and compares its Targets table against the in-app receipt line (the
// two readers of "was this target simulated?"), re-reads the finished STORYLINE
// receipt, then DELETES both reports.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7c0";
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 1_800_000 });
const txt = async (l: any) => ((await l.textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("C6b: archive download vs receipt, storyline receipt, then delete both reports", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /^Planning$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
  const sec = frame.locator('[data-testid="sponsor-reports"]');
  await sec.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/c6b-00-list.png`, fullPage: true });
  console.log("LIST", (await txt(sec)).slice(0, 1500));

  const openReport = async (name: string) => {
    await frame.getByText(name, { exact: false }).first().click().catch((e: any) => console.log("OPEN_ERR", String(e).slice(0, 80)));
    await page.waitForTimeout(8000);
  };

  // ---------- ARCHIVE ----------
  await openReport("LZ7C0 archive cut");
  await page.screenshot({ path: `${OUT}/c6b-01-archive.png`, fullPage: true });
  const secBtn = frame.locator("button").filter({ hasText: /^(Timeline|Targets|Changes) \(\d+\)$/ }).first();
  await secBtn.click().catch(() => {});
  await page.waitForTimeout(1200);
  await frame.locator('[role="option"]').filter({ hasText: /^Targets \(\d+\)$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  const receiptLines = await frame.locator('[data-testid="report-target-forecast"]').allTextContents().catch(() => []);
  console.log("RECEIPT_TARGET_LINES", JSON.stringify(receiptLines.map((l) => l.replace(/\s+/g, " "))));
  const previewTable = await frame.locator('table[aria-label="Report preview"]').first().evaluate((el: any) => el.innerText.replace(/\s+/g, " ")).catch(() => "");
  console.log("RECEIPT_TARGET_TABLE", JSON.stringify(previewTable.slice(0, 900)));
  await page.screenshot({ path: `${OUT}/c6b-02-archive-targets.png`, fullPage: true });

  // NEVER click the download anchor in headless: it tears the context down and
  // leaves the profile reservation active (runbook, _lc681-h). Capture the Blob.
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await realFrame!.evaluate(() => {
    (window as any).__blobs = [];
    const mk = URL.createObjectURL.bind(URL);
    (URL as any).createObjectURL = (b: any) => { (window as any).__blobs.push(b); return mk(b); };
    (URL as any).revokeObjectURL = () => {};
    const proto: any = HTMLAnchorElement.prototype;
    const orig = proto.click;
    proto.click = function () { if (this.download) return; return orig.apply(this, arguments as any); };
  });
  const dlA = frame.locator("button").filter({ hasText: /Download complete HTML report/i }).first();
  console.log("ARCHIVE_DL_BTN", await txt(dlA));
  await dlA.dispatchEvent("click").catch((e: any) => console.log("DLA_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(6000);
  const files: string[] = await realFrame!.evaluate(async () => {
    const out: string[] = [];
    for (const b of (window as any).__blobs || []) { try { out.push(await b.text()); } catch (e) { out.push(`(err ${e})`); } }
    return out;
  });
  console.log("BLOBS", files.length, files.map((f) => f.length));
  if (files.length) {
    const html = files[files.length - 1];
    fs.writeFileSync(`${OUT}/archive-download.html`, html);
    console.log("ARCHIVE_BYTES", html.length);
    const targetsSection = (html.match(/<h2>Targets<\/h2>[\s\S]{0,4000}?<\/table>/) || [])[0] || "";
    const plain = targetsSection.replace(/<\/t[dh]>/g, " | ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    console.log("ARCHIVE_TARGETS_TABLE", JSON.stringify(plain.slice(0, 1400)));
    console.log("ARCHIVE_HAS_NOT_SIMULATED", /Not simulated/.test(html), "COUNT", (html.match(/Not simulated/g) || []).length);
    console.log("ARCHIVE_HAS_UNAVAILABLE_IN_TARGETS", /Unavailable/.test(targetsSection));
    console.log("ARCHIVE_VERDICT_BADGE", JSON.stringify(html.match(/<span class="lz-slrep-verdict"[^>]*>[^<]*<\/span>|<span class="vw"[^>]*>[^<]*<\/span>/)?.[0]));
    console.log("ARCHIVE_PAST_DATE", JSON.stringify((html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").match(/[^.]{0,140}past (its|their) date[^.]{0,60}\./g) || []).slice(0, 4)));
  }

  // ---------- STORYLINE (now finished) ----------
  await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await openReport("LZ7C0 storyline cut");
  await page.screenshot({ path: `${OUT}/c6b-03-storyline.png`, fullPage: true });
  const sBody = await bodyText(frame);
  fs.writeFileSync(`${OUT}/c6b-storyline-receipt.txt`, sBody);
  console.log("STORYLINE_DOC", await frame.locator('[data-testid="storyline-report"]').count());
  console.log("STORYLINE_FINISH_LINE", JSON.stringify(await txt(frame.locator('[data-testid="storyline-report-finish-line"]').first())));
  const badge = await frame.locator('.lz-slrep-verdict').first().evaluate((el: any) => ({ text: el.textContent, inline: el.style.background, computed: getComputedStyle(el).backgroundColor })).catch((e: any) => String(e).slice(0, 60));
  console.log("STORYLINE_RECEIPT_BADGE", JSON.stringify(badge));
  console.log("STORYLINE_PAST_DATE", JSON.stringify((sBody.match(/[^.]{0,140}past (its|their) date[^.]{0,60}\./g) || []).slice(0, 6)));
  console.log("STORYLINE_AGO", JSON.stringify((sBody.match(/[^.]{0,80}\d+ (day|days|week|weeks) (past|ago)[^.]{0,50}\./g) || []).slice(0, 8)));

  // ---------- DELETE BOTH ----------
  const del = async (name: string) => {
    await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    await openReport(name);
    const b = frame.locator("button").filter({ hasText: /^Delete report$/ }).first();
    console.log("DELETE_BTN for", name, await b.count());
    await b.dispatchEvent("click").catch((e: any) => console.log("DEL_ERR", String(e).slice(0, 80)));
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/c6b-del-${name.replace(/\W+/g, "-")}.png`, fullPage: true });
    const confirmBtn = frame.locator("button").filter({ hasText: /^Delete report$/ }).last();
    await confirmBtn.dispatchEvent("click").catch((e: any) => console.log("CONF_ERR", String(e).slice(0, 80)));
    await page.waitForTimeout(6000);
    console.log("AFTER_DELETE", name, "still listed:", (await bodyText(frame)).includes(name));
  };
  await del("LZ7C0 archive cut");
  await del("LZ7C0 storyline cut");
  await frame.getByRole("button", { name: /Refresh reports/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const fin = await bodyText(frame);
  console.log("FINAL_LIST_HAS_ARCHIVE", fin.includes("LZ7C0 archive cut"), "HAS_STORYLINE", fin.includes("LZ7C0 storyline cut"));
  await page.screenshot({ path: `${OUT}/c6b-04-final.png`, fullPage: true });
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(fin));
});

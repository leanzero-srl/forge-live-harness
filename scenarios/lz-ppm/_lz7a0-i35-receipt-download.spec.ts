// LZ7A0 items 3 + 5 (on-screen half) — the ARCHIVE RECEIPT opens on the frozen
// verdict with the rung's badge; the scoped-target table says "Not simulated" with
// the rule sentence; Assumptions names the whole-plan population; and the DOWNLOADED
// archive carries the same lede, readable instants and the rung's badge colour.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SP = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7a0";
const PLAN = "LZ7A0 retest bed";
test.describe.configure({ retries: 0, timeout: 1_500_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("I3/I5: archive receipt, scoped targets, download", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  for (let i = 0; i < 8; i++) { await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(3000); if (await frame.getByRole("button", { name: /^Planning/i }).count()) break; }
  await frame.getByRole("button", { name: /^Planning/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByText("Sponsor reports", { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SP}/i3-00-reports-tab.png`, fullPage: true });

  // ---------------- ARCHIVE RECEIPT ----------------
  await frame.getByText("LZ7A0 archive", { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SP}/i3-01-archive-receipt.png`, fullPage: true });
  const word = frame.locator('[data-testid="report-archive-verdict-word"]').first();
  console.log("RECEIPT_WORD", JSON.stringify((await word.textContent().catch(() => null)) || null));
  console.log("RECEIPT_WORD_BG", await word.evaluate((el: any) => getComputedStyle(el).backgroundColor).catch(() => null));
  console.log("RECEIPT_LEDE", JSON.stringify(await frame.locator('[data-testid="report-archive-verdict-line"]').first().textContent().catch(() => null)));
  console.log("RECEIPT_COMMITMENT", JSON.stringify(await frame.locator('[data-testid="report-archive-verdict-commitment"]').allTextContents().catch(() => [])));
  console.log("RECEIPT_FORECAST", JSON.stringify(await frame.locator('[data-testid="report-forecast"]').first().textContent().catch(() => null)));

  // ---------------- SCOPED TARGETS SECTION ----------------
  await frame.locator("button").filter({ hasText: /^Timeline \(\d+\)$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  console.log("SECTION_OPTIONS", JSON.stringify(await frame.locator('[role="option"]').allTextContents().catch(() => [])));
  await frame.locator('[role="option"]').filter({ hasText: /^Targets \(\d+\)$/ }).first().dispatchEvent("click").catch((e: any) => console.log("OPT_ERR", String(e).slice(0, 140)));
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${SP}/i3-02-targets-section.png`, fullPage: true });
  const t2 = await bodyText(frame);
  console.log("HAS_NOT_SIMULATED", /Not simulated/.test(t2));
  console.log("NOT_SIMULATED_COUNT", (t2.match(/Not simulated/g) || []).length);
  console.log("HAS_SCOPE_RULE", /Not simulated: a target is forecast over every task in its scope, and not every task in this one has a usable date\./.test(t2));
  console.log("HAS_OLD_UNAVAILABLE_SENTENCE", /dependency network is incomplete or the forecast could not finish/.test(t2));
  console.log("HAS_COULD_NOT_FINISH", /could not finish/.test(t2));
  const tgt = t2.match(/.{0,120}Go-live complete.{0,400}/); console.log("TARGET_ROW_CTX", tgt ? tgt[0] : "(none)");
  const tgt2 = t2.match(/.{0,120}Platform gate.{0,400}/); console.log("TARGET_ROW2_CTX", tgt2 ? tgt2[0] : "(none)");

  // ---------------- DOWNLOAD ----------------
  const dl = page.waitForEvent("download", { timeout: 180_000 });
  await frame.getByRole("button", { name: /Download complete HTML report/i }).first().click().catch((e: any) => console.log("DL_CLICK_ERR", String(e).slice(0, 140)));
  const d = await dl;
  await d.saveAs(`${SP}/archive-download.html`);
  console.log("DOWNLOADED", d.suggestedFilename());
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SP}/i3-03-after-download.png`, fullPage: true });

  // ---------------- STORYLINE RECEIPT ----------------
  await frame.getByText("LZ7A0 storyline", { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SP}/i3-04-storyline-receipt.png`, fullPage: true });
  const sw = frame.locator('[data-testid="storyline-report-verdict"]').first();
  console.log("STORY_WORD", JSON.stringify(await sw.textContent().catch(() => null)));
  console.log("STORY_WORD_BG", await sw.evaluate((el: any) => getComputedStyle(el).backgroundColor).catch(() => null));
  console.log("STORY_LEDE", JSON.stringify(await frame.locator('[data-testid="storyline-report-verdict-line"]').first().textContent().catch(() => null)));
  console.log("STORY_PRESSURE", JSON.stringify(await frame.locator('[data-testid="storyline-report-pressure"]').first().textContent().catch(() => null)));
  console.log("STORY_COMMITMENT", JSON.stringify(await frame.locator('[data-testid="storyline-report-commitment"]').first().textContent().catch(() => null)));
  const dl2 = page.waitForEvent("download", { timeout: 180_000 }).catch(() => null);
  await frame.locator("button").filter({ hasText: /Download/i }).first().click().catch(() => {});
  const d2 = await dl2;
  if (d2) { await d2.saveAs(`${SP}/storyline-download.html`); console.log("DOWNLOADED2", d2.suggestedFilename()); }
});

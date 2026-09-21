// LZ7C0 item 6 — the five copy cuts on a FRESH capture of LZPT Scenarios.
// Captures an ARCHIVE and a STORYLINE report, reads the in-app receipt and the
// DOWNLOADED storyline file, then deletes both. NEVER publishes to Confluence.
//   a) receipt Targets row: "Not simulated: a target is forecast over every task…"
//      and the word "Unavailable" must NOT be on that line.
//   b) downloaded storyline: the verdict badge carries an INLINE background equal
//      to the rung colour (late => #dc2626), not the stylesheet's navy #15233b.
//   c) "N ticket(s) is/are past its/their date" agrees with its own number.
//   d) an overdue ticket under 7 days reads "N days past its date" (bed-dependent).
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7c0";
const PLAN = "LZPT Scenarios";
const ARCHIVE = "LZ7C0 archive cut";
const STORY = "LZ7C0 storyline cut";
test.describe.configure({ retries: 0, timeout: 1_800_000 });
const txt = async (l: any) => ((await l.textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("C6: the five copy cuts on a fresh LZPT capture", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Planning$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
  const sec = frame.locator('[data-testid="sponsor-reports"]');
  await sec.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(2500);
  console.log("EXISTING_REPORTS", (await txt(sec)).slice(0, 600));

  const capture = async (name: string, storyline: boolean) => {
    await sec.getByLabel("Report name").fill(name);
    const combo = sec.getByRole("combobox").first();
    console.log(name, "TEMPLATE_BEFORE", await txt(combo));
    if (storyline) {
      await combo.click(); await page.waitForTimeout(900);
      await frame.getByRole("option", { name: /Storyline report/i }).first().dispatchEvent("click").catch((e: any) => console.log("OPT_ERR", String(e).slice(0, 90)));
      await page.waitForTimeout(900);
    }
    console.log(name, "TEMPLATE_AFTER", await txt(combo));
    await sec.getByRole("button", { name: /Capture sponsor report/i }).first().click();
    for (let i = 0; i < 160; i++) {
      const t = await txt(sec);
      if (/Immutable report captured|Report captured and verified/i.test(t)) break;
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(4000);
    console.log(name, "NOTICE", (await txt(sec)).slice(0, 400));
  };

  // ================= ARCHIVE =================
  await capture(ARCHIVE, false);
  await page.screenshot({ path: `${OUT}/c6-01-archive-receipt.png`, fullPage: true });
  const verdictWord = await txt(frame.locator('[data-testid="report-archive-verdict-word"]').first());
  const verdictLine = await txt(frame.locator('[data-testid="report-archive-verdict-line"]').first());
  const verdictHeadline = await txt(frame.locator('[data-testid="report-archive-verdict"]').first());
  console.log("ARCHIVE_VERDICT_WORD", JSON.stringify(verdictWord));
  console.log("ARCHIVE_VERDICT_LEDE", JSON.stringify(verdictLine));
  console.log("ARCHIVE_VERDICT_BLOCK", JSON.stringify(verdictHeadline));
  const wordBg = await frame.locator('[data-testid="report-archive-verdict-word"]').first().evaluate((el: any) => ({ inline: el.style.background, computed: getComputedStyle(el).backgroundColor })).catch(() => null);
  console.log("ARCHIVE_WORD_BG", JSON.stringify(wordBg));
  const receipt = await bodyText(frame);
  console.log("PAST_DATE_SENTENCES", JSON.stringify((receipt.match(/[^.]{0,120}past (its|their) date[^.]{0,80}\./g) || [])));
  console.log("AGO_SENTENCES", JSON.stringify((receipt.match(/[^.]{0,120}\d+ (day|days|week|weeks)[^.]{0,80}\./g) || []).slice(0, 12)));
  fs.writeFileSync(`${OUT}/c6-archive-receipt.txt`, receipt);

  // section picker -> Targets
  const secBtn = frame.locator("button").filter({ hasText: /^(Timeline|Targets|Changes) \(\d+\)$/ }).first();
  console.log("SECTION_BTN", await txt(secBtn));
  await secBtn.click().catch(() => {});
  await page.waitForTimeout(1200);
  console.log("SECTION_OPTIONS", JSON.stringify(await frame.locator('[role="option"]').allTextContents().catch(() => [])));
  await frame.locator('[role="option"]').filter({ hasText: /^Targets \(\d+\)$/ }).first().dispatchEvent("click").catch((e: any) => console.log("OPT_ERR", String(e).slice(0, 120)));
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/c6-02-archive-targets.png`, fullPage: true });
  const forecastLines = await frame.locator('[data-testid="report-target-forecast"]').allTextContents().catch(() => []);
  console.log("TARGET_FORECAST_LINES", JSON.stringify(forecastLines));
  for (const l of forecastLines) console.log("  LINE:", JSON.stringify(l.replace(/\s+/g, " ")), "| has Unavailable:", /Unavailable/.test(l), "| has Not simulated:", /Not simulated/.test(l));
  const targetsBody = await bodyText(frame);
  console.log("TARGETS_SECTION_HAS_UNAVAILABLE", /Unavailable/.test(targetsBody));
  console.log("TARGETS_SNIP", JSON.stringify((targetsBody.match(/LZ7C0[\s\S]{0,700}/) || [])[0]));
  fs.writeFileSync(`${OUT}/c6-archive-targets.txt`, targetsBody);

  // ================= STORYLINE =================
  await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  // back to the capture form: a report is open, so click the list entry away
  const newBtn = frame.locator("button").filter({ hasText: /Back to reports|All reports|Reports list/i });
  if (await newBtn.count()) { await newBtn.first().dispatchEvent("click").catch(() => {}); await page.waitForTimeout(2500); }
  console.log("FORM_PRESENT", await sec.getByLabel("Report name").count());
  await capture(STORY, true);
  await page.screenshot({ path: `${OUT}/c6-03-storyline-receipt.png`, fullPage: true });
  const storyBody = await bodyText(frame);
  fs.writeFileSync(`${OUT}/c6-storyline-receipt.txt`, storyBody);
  console.log("STORYLINE_DOC_PRESENT", await frame.locator('[data-testid="storyline-report"]').count());
  console.log("STORYLINE_FINISH_LINE", JSON.stringify(await txt(frame.locator('[data-testid="storyline-report-finish-line"]').first())));
  console.log("STORYLINE_PAST_DATE", JSON.stringify((storyBody.match(/[^.]{0,120}past (its|their) date[^.]{0,80}\./g) || [])));
  console.log("STORYLINE_AGO", JSON.stringify((storyBody.match(/[^.]{0,120}\d+ (day|days|week|weeks)[^.]{0,80}\./g) || []).slice(0, 12)));

  // ---- DOWNLOAD the storyline file ----
  const dlBtn = frame.locator("button").filter({ hasText: /Download/i }).first();
  console.log("DOWNLOAD_BTN", await txt(dlBtn));
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }).catch((e: any) => { console.log("NO_DOWNLOAD_EVENT", String(e).slice(0, 80)); return null; }),
    dlBtn.click().catch((e: any) => console.log("DL_CLICK_ERR", String(e).slice(0, 80))),
  ]);
  if (dl) {
    const p = `${OUT}/storyline-download.html`;
    await dl.saveAs(p);
    const html = fs.readFileSync(p, "utf8");
    console.log("DOWNLOAD_BYTES", html.length, "NAME", dl.suggestedFilename());
    const badge = html.match(/<span class="vw"[^>]*>([^<]*)<\/span>/);
    console.log("BADGE_TAG", JSON.stringify(html.match(/<span class="vw"[^>]*>[^<]*<\/span>/)?.[0]));
    console.log("BADGE_WORD", JSON.stringify(badge?.[1]));
    console.log("BADGE_INLINE_BG", JSON.stringify(html.match(/<span class="vw"[^>]*style="background:([^"]*)"/)?.[1]));
    console.log("STYLESHEET_VW_RULE", JSON.stringify(html.match(/\.vw\{[^}]*\}/)?.[0]));
    console.log("DL_PAST_DATE", JSON.stringify((html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").match(/[^.]{0,140}past (its|their) date[^.]{0,80}\./g) || [])));
    console.log("DL_AGO", JSON.stringify((html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").match(/[^.]{0,140}\d+ (day|days|week|weeks)[^.]{0,80}\./g) || []).slice(0, 12)));
    console.log("DL_HAS_UNAVAILABLE", /Unavailable/.test(html));
  }
  await page.screenshot({ path: `${OUT}/c6-04-after-download.png`, fullPage: true });
});

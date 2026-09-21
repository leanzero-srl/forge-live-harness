// LZ7E0 item 3 — the capture banner drains with the deletion (030dbab5).
// Deletes the archive report E2 left behind, then captures a STORYLINE report and
// deletes THAT, and after each deletion re-opens the plan COLD (full reload) to see
// whether "Report: <name> · … · Finish capture cleanup" is still there. Counts the
// cleanup passes by watching the resolver traffic.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7e0";
const PLAN = "LZPT Scenarios";
const ARCHIVE = "LZ7E0 archive note";
const STORY = "LZ7E0 storyline drain";
test.describe.configure({ retries: 0, timeout: 2_700_000 });
const txt = async (l: any) => ((await l.textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("E3: a deleted report takes its capture banner with it", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    const d = r.postData() || "";
    for (const name of ["cancelSponsorReportCapture", "getSponsorReportCapture", "deleteSponsorReport", "beginSponsorReportCapture"]) {
      if (d.includes(name)) calls.push(`${new Date().toISOString().slice(11, 23)} ${name}`);
    }
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  const open = async (tag: string) => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
    await page.waitForTimeout(9000);
    console.log(tag, "SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
    await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(9000);
    if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
    await frame.getByRole("button", { name: /^Planning$/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
    await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
    await frame.locator('[data-testid="sponsor-reports"]').waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(6000);
    return frame;
  };
  const banner = async (frame: any, tag: string) => {
    const t = await bodyText(frame);
    const prog = await frame.locator('[data-testid="report-capture-progress"]').count();
    console.log(tag, "CAPTURE_BANNER_NODE", prog, "TEXT", JSON.stringify(prog ? await txt(frame.locator('[data-testid="report-capture-progress"]').first()) : null));
    console.log(tag, "FINISH_BTN", await frame.locator("button").filter({ hasText: /Finish capture cleanup/i }).count());
    console.log(tag, "CLEANING_TEXT", /Cleaning up temporary data/i.test(t), "| REPORT_LINE", JSON.stringify((t.match(/Report:\s*[^·]{0,60}·[^·]{0,60}/) || [])[0] ?? null));
    console.log(tag, "NO_REPORTS_TEXT", /No reports found/i.test(t));
    return t;
  };

  // ============ 1. delete the ARCHIVE report E2 left behind ============
  let frame = await open("A_OPEN");
  await banner(frame, "A_BEFORE_DELETE");
  await page.screenshot({ path: `${OUT}/e3-00-before-archive-delete.png`, fullPage: true });
  const openBtn = frame.locator("button").filter({ hasText: /^Open captured report$/ });
  if (await openBtn.count()) { await openBtn.first().dispatchEvent("click"); await page.waitForTimeout(9000); }
  else { await frame.getByText(ARCHIVE, { exact: false }).first().dispatchEvent("click").catch(() => {}); await page.waitForTimeout(9000); }
  console.log("A_DELETE_BTN", await frame.locator("button").filter({ hasText: /^Delete report$/ }).count());
  calls.length = 0;
  await frame.locator("button").filter({ hasText: /^Delete report$/ }).first().dispatchEvent("click").catch((e: any) => console.log("A_DEL_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(2000);
  await frame.locator("button").filter({ hasText: /^Delete report$/ }).last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(20000);
  console.log("A_CALLS_DURING_DELETE", JSON.stringify(calls));
  console.log("A_CANCEL_PASSES", calls.filter((c) => c.includes("cancelSponsorReportCapture")).length);
  await banner(frame, "A_AFTER_DELETE");
  await page.screenshot({ path: `${OUT}/e3-01-after-archive-delete.png`, fullPage: true });

  // ---- COLD OPEN ----
  frame = await open("A_COLD");
  const coldText = await banner(frame, "A_COLD");
  console.log("A_COLD_LIST", JSON.stringify((await txt(frame.locator('[data-testid="sponsor-reports"]'))).slice(0, 400)));
  await page.screenshot({ path: `${OUT}/e3-02-archive-coldopen.png`, fullPage: true });

  // ============ 2. capture a STORYLINE, then delete it ============
  const sec = frame.locator('[data-testid="sponsor-reports"]');
  await sec.getByLabel("Report name").fill(STORY);
  const combo = sec.getByRole("combobox").first();
  await combo.click(); await page.waitForTimeout(1200);
  console.log("TEMPLATE_OPTIONS", JSON.stringify(await frame.locator('[role="option"]').allTextContents().catch(() => [])));
  await frame.getByRole("option", { name: /Storyline report/i }).first().dispatchEvent("click").catch((e: any) => console.log("OPT_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(1200);
  console.log("TEMPLATE_AFTER", await txt(combo));
  await sec.getByRole("button", { name: /Capture sponsor report/i }).first().click();
  for (let i = 0; i < 200; i++) {
    const t = await txt(sec);
    if (/Immutable report captured|Report captured and verified/i.test(t)) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(6000);
  console.log("STORY_NOTICE", (await txt(sec)).slice(0, 300));
  await banner(frame, "S_AFTER_CAPTURE");
  await page.screenshot({ path: `${OUT}/e3-03-storyline-captured.png`, fullPage: true });

  const sOpen = frame.locator("button").filter({ hasText: /^Open captured report$/ });
  if (await sOpen.count()) { await sOpen.first().dispatchEvent("click"); await page.waitForTimeout(9000); }
  console.log("S_DELETE_BTN", await frame.locator("button").filter({ hasText: /^Delete report$/ }).count());
  calls.length = 0;
  await frame.locator("button").filter({ hasText: /^Delete report$/ }).first().dispatchEvent("click").catch((e: any) => console.log("S_DEL_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(2000);
  await frame.locator("button").filter({ hasText: /^Delete report$/ }).last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(25000);
  console.log("S_CALLS_DURING_DELETE", JSON.stringify(calls));
  console.log("S_CANCEL_PASSES", calls.filter((c) => c.includes("cancelSponsorReportCapture")).length);
  await banner(frame, "S_AFTER_DELETE");
  await page.screenshot({ path: `${OUT}/e3-04-after-storyline-delete.png`, fullPage: true });

  // ---- COLD OPEN ----
  frame = await open("S_COLD");
  await banner(frame, "S_COLD");
  console.log("S_COLD_LIST", JSON.stringify((await txt(frame.locator('[data-testid="sponsor-reports"]'))).slice(0, 500)));
  await page.screenshot({ path: `${OUT}/e3-05-storyline-coldopen.png`, fullPage: true });
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
});

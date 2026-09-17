// STORYLINE reading mode — live acceptance on LZPT (dev).
// LZPT's chains are 7/5/4/3, all under the 12-ticket BEAT_FLOOR, so the page must
// explain itself calmly rather than show an empty screen. Read-only; never Applies.
// Restore afterwards: what=aiViewDelete&planId=plan-msq9dg8l-gz6mz1 + what=clearDrafts.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const SHOT = process.env.SHOT_DIR || "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6670";
test.describe.configure({ retries: 0, timeout: 900_000 });

const errors: string[] = [];
async function bodyText(frame: any) { return (await frame.locator("body").innerText().catch(() => "")) || ""; }

async function openPlan(page: any, label = PLAN) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no forge frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(2000);
  await frame.getByText(label, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  return { frame, realFrame };
}

function watch(page: any) {
  page.on("console", (m: any) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });
  page.on("pageerror", (e: any) => errors.push("pageerror: " + String(e).slice(0, 300)));
}

async function toolbarState(frame: any) {
  const t = await bodyText(frame);
  const btn = async (re: RegExp) => await frame.getByRole("button", { name: re }).count();
  return {
    staged: /Apply \d+ change|Save \(\d+\)/.test(t),
    save: await btn(/^Save/), apply: await btn(/^Apply/), del: await btn(/^Delete/),
    reindex: await btn(/Re-?index/i), zoom: await btn(/^Zoom/i),
    tabs: { gantt: await btn(/^Gantt$/), table: await btn(/^Table$/), storyline: await frame.locator('[data-testid="view-tab-storyline"]').count() },
  };
}

test("STORY1 LZPT: storyline tab, below-floor copy, back, persistence", async ({ page }) => {
  watch(page);
  const { frame, realFrame } = await openPlan(page);
  await frame.getByRole("button", { name: /^Gantt$/ }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  const prefKey = `ppm.display.viewMode.${PLAN_ID}`;
  const prefBefore = await realFrame.evaluate((k: string) => window.localStorage.getItem(k), prefKey);
  console.log("VIEWMODE PREF BEFORE:", prefBefore);
  console.log("TOOLBAR IN GANTT:", JSON.stringify(await toolbarState(frame)));

  // --- the tab exists and is clickable
  const tab = frame.locator('[data-testid="view-tab-storyline"]');
  expect(await tab.count()).toBe(1);
  console.log("TAB LABEL:", (await tab.innerText()).trim());
  await tab.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT}/story1-a-nobuild.png`, fullPage: false });

  // --- BEFORE any build: prompt to build
  const emptyA = frame.locator('[data-testid="storyline-empty"]');
  console.log("EMPTY(no build) count:", await emptyA.count());
  console.log("EMPTY(no build) text:", (await emptyA.innerText().catch(() => "")).replace(/\n/g, " | "));
  console.log("REBUILD BUTTON count:", await frame.locator('[data-testid="storyline-rebuild"]').count());
  console.log("BACK BUTTON count:", await frame.locator('[data-testid="storyline-back"]').count());
  console.log("TOOLBAR IN STORYLINE:", JSON.stringify(await toolbarState(frame)));
  const prefAfterTab = await realFrame.evaluate((k: string) => window.localStorage.getItem(k), prefKey);
  console.log("VIEWMODE PREF AFTER TAB:", prefAfterTab);

  // --- back to the ticket Gantt
  await frame.locator('[data-testid="storyline-back"]').first().click();
  await page.waitForTimeout(2500);
  console.log("AFTER BACK — gantt rows:", await frame.locator('[data-testid="gantt-row"]').count(),
              "storyline mounted:", await frame.locator('[data-testid="storyline-view"], [data-testid="storyline-empty"]').count());
  await page.screenshot({ path: `${SHOT}/story1-b-back.png` });

  // --- build the structure from the storyline empty state
  await tab.click();
  await page.waitForTimeout(1500);
  const rb = frame.locator('[data-testid="storyline-rebuild"]');
  if (await rb.count()) {
    await rb.first().click();
    console.log("BUILD: clicked rebuild");
    await page.waitForTimeout(3000);
    for (let i = 0; i < 60; i++) {
      const t = await bodyText(frame);
      if (!/Rebuilding the structure/i.test(t)) break;
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(3000);
  } else {
    console.log("BUILD: no rebuild button offered");
  }
  await page.screenshot({ path: `${SHOT}/story1-c-afterbuild.png` });
  const emptyB = frame.locator('[data-testid="storyline-empty"]');
  console.log("AFTER BUILD empty count:", await emptyB.count());
  console.log("AFTER BUILD text:", (await emptyB.innerText().catch(() => "")).replace(/\n/g, " | "));
  console.log("AFTER BUILD view count:", await frame.locator('[data-testid="storyline-view"]').count());
  console.log("TOOLBAR AFTER BUILD:", JSON.stringify(await toolbarState(frame)));

  // --- persistence across a reload
  const prefNow = await realFrame.evaluate((k: string) => window.localStorage.getItem(k), prefKey);
  console.log("VIEWMODE PREF BEFORE RELOAD:", prefNow);
  const r2 = await openPlan(page);
  await page.waitForTimeout(3000);
  const t2 = await bodyText(r2.frame);
  console.log("AFTER RELOAD storyline mounted:", await r2.frame.locator('[data-testid="storyline-view"], [data-testid="storyline-empty"]').count(),
              "gantt rows:", await r2.frame.locator('[data-testid="gantt-row"]').count());
  console.log("AFTER RELOAD text head:", t2.slice(0, 400).replace(/\n/g, " | "));
  await page.screenshot({ path: `${SHOT}/story1-d-reload.png` });
  console.log("TOOLBAR AFTER RELOAD:", JSON.stringify(await toolbarState(r2.frame)));

  // --- restore the view mode to Gantt for the next run and report staged state
  await r2.frame.getByRole("button", { name: /^Gantt$/ }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const fin = await toolbarState(r2.frame);
  console.log("FINAL TOOLBAR:", JSON.stringify(fin));
  console.log("STAGED_AFTER_CLEANUP=" + fin.staged);
  console.log("CONSOLE ERRORS (" + errors.length + "):\n" + errors.slice(0, 20).join("\n"));
});

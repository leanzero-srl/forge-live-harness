// LZ770B D1b — a REAL Jira change lands while local unsaved edits are on screen.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { setFields } from "../../data/jira-build.mjs";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const BED = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
const PLAN = "[harness-test] LZ770B saved-edit bed";
const LEAF = BED.l1, OTHER = BED.c1;
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";

test("D1b: a real Jira change under local unsaved edits", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(6000);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);

  const row = frame.locator(`[data-testid="table-row"][data-row-key="${LEAF}"]`).first();
  await row.getByText(/^5d$/).first().click();
  await page.waitForTimeout(600);
  const input = row.locator('input[inputmode="numeric"]').first();
  await input.fill("7"); await input.press("Enter");
  await page.waitForTimeout(2500);
  const localDue = await row.getAttribute("data-row-due");
  console.log("LOCAL_UNSAVED", localDue, await row.getAttribute("data-row-duration"));

  // A REAL Jira move on a DIFFERENT row of the same plan.
  await setFields(OTHER, { duedate: "2026-10-22" });
  console.log("JIRA_MOVED", OTHER, "duedate 2026-10-20 -> 2026-10-22");
  const otherRow = frame.locator(`[data-testid="table-row"][data-row-key="${OTHER}"]`).first();
  let sawJira = false;
  for (let i = 0; i < 45; i++) {
    if ((await otherRow.getAttribute("data-row-due")) === "2026-10-22") { sawJira = true; console.log("JIRA_VISIBLE_AFTER_S", i); break; }
    await page.waitForTimeout(1000);
  }
  const t = (await bodyText(frame)).replace(/\s+/g, " ");
  console.log("JIRA_ROW_VISIBLE", sawJira, "now=", await otherRow.getAttribute("data-row-due"));
  console.log("BANNER", /This plan changed in Jira[^.]*\./.exec(t)?.[0] ?? "none");
  console.log("ANY_NOTICE", t.match(/.{0,60}(changed in Jira|Refreshing plan|refreshed|new version).{0,80}/i)?.[0] ?? "none");
  console.log("LOCAL_ROW_NOW", await row.getAttribute("data-row-due"), await row.getAttribute("data-row-duration"));
  console.log("STAGED", /Save \(\d+\)/.exec(t)?.[0] ?? "none", "|", /Apply \d+ change/.exec(t)?.[0] ?? "none");
  await page.screenshot({ path: `${OUT}/d1b-01.png` });
  expect(await row.getAttribute("data-row-duration"), "local unsaved edit survived a real Jira change").toBe("7");

  // RESTORE: discard local, put Jira back.
  for (let i = 0; i < 4; i++) {
    const b = (await bodyText(frame)).replace(/\s+/g, " ");
    if (!/Apply \d+ change/.test(b)) break;
    await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  await setFields(OTHER, { duedate: "2026-10-20" });
  const final = (await bodyText(frame)).replace(/\s+/g, " ");
  console.log("FINAL_STAGED", /Apply \d+ change/.exec(final)?.[0] ?? "none", "|", /Save \(\d+\)/.exec(final)?.[0] ?? "none");
  await page.screenshot({ path: `${OUT}/d1b-02.png` });
  const p = await getTestState("lz-ppm", { what: "plan", planId: BED.planId });
  console.log("META", JSON.stringify({ ver: p.meta?.version, savedEdits: p.meta?.savedEdits, editDrops: p.meta?.editDrops }));
});

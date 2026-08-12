// PERSISTENT feature journey — the Dashboard milestone tracker must list EXACTLY
// what the Gantt draws as a diamond (read-only).
//
// This journey used to assert the old rule: "every single-day non-buffer leaf is a
// milestone", which on LZPT meant 11 of them (WIDE-01..10 + the 0-day EDGE task).
// That rule was the reported rhombus bug — it made every one-day task a milestone,
// and a cascade that collapsed a task to one day silently created new ones.
// Milestones are now DECLARED (zero duration, or a milestone issue type).
//
// So the meaningful invariant is no longer a magic number, it is AGREEMENT: the
// Dashboard tracker and the Gantt derive milestones from one shared predicate, and
// must produce the same set for the same plan. They previously had separate copies
// of the rule, which is exactly how the two views came to disagree.
//
// On LZPT the set is legitimately EMPTY — the project has no Milestone issue type
// and editmeta confirms PPM Duration is not settable there, so nothing can declare
// itself one. An empty set still proves agreement, and the emptiness itself is
// asserted against Jira rather than assumed. The positive (diamond) case is covered
// offline in test/visual, where the fixture is ours.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 1, timeout: 260_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";

test("Dashboard milestone tracker == the Gantt's diamonds (one shared rule)", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);

  // INDEPENDENT check that LZPT genuinely cannot declare a milestone, so an empty
  // tracker is the correct answer rather than a broken query.
  const declarable = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", {
      method: "POST", credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" },
      body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["issuetype", "customfield_10180"] }),
    });
    const d = await res.json();
    return (d.issues || []).filter((i: any) =>
      /milestone/i.test(i.fields.issuetype?.name || "") || Number(i.fields.customfield_10180) === 0
    ).map((i: any) => i.key);
  });
  console.log("issues that DECLARE themselves milestones in Jira:", JSON.stringify(declarable));

  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first()
    .waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);

  // --- GANTT: which bars are drawn as diamonds ---
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await frame.locator('[data-testid="gantt-bar"]').first().waitFor({ state: "visible", timeout: 90_000 });
  await frame.locator('[data-testid="tab-loading-overlay"]').waitFor({ state: "detached", timeout: 60_000 }).catch(() => {});
  const ganttDiamonds: string[] = await realFrame!.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="gantt-bar"][data-milestone="1"]'))
      .map((el) => (el as HTMLElement).dataset.key!).sort());

  // --- DASHBOARD: which issues the tracker lists ---
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="tab-loading-overlay"]').waitFor({ state: "detached", timeout: 60_000 }).catch(() => {});
  const trackerRows: string[] = await realFrame!.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="milestone-row"]'))
      .map((el) => (el as HTMLElement).dataset.key!).sort());

  console.log("GANTT diamonds:", JSON.stringify(ganttDiamonds), " DASHBOARD tracker:", JSON.stringify(trackerRows));

  // THE invariant: one rule, one answer.
  expect(trackerRows, "the Dashboard tracker and the Gantt must agree on what a milestone is").toEqual(ganttDiamonds);
  // And the answer matches what Jira actually declares.
  expect(new Set(ganttDiamonds), "milestones are exactly the DECLARED issues").toEqual(new Set(declarable));

  // The plan must still have rendered — an empty tracker because the Dashboard
  // failed to load would pass the equality above vacuously.
  expect(await bodyText(frame), "the dashboard actually rendered").toMatch(/Complete|Issues|health/i);
});

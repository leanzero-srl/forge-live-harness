// PERSISTENT regression journey for the reported defect:
//
//   "When you make a connection between the tickets, after click on apply N changes
//    2 problems appear: the connection disappears from the board, and the notification
//    shows that it successfully wrote 0 issues."
//
// ROOT CAUSE (measured, not guessed): writeChunk pre-filtered every payload through
// GET /issue/{key}/editmeta, treating the EDIT SCREEN as the writable field set.
// wolfaenpak's TPP project — the reporter's project — has an edit screen that lists
// neither `duedate` nor `customfield_10015`, yet a PUT of either returns 204 and the
// value lands (updateIssue passes overrideScreenSecurity=true). So the filter emptied
// every payload, every change was silently skipped, and Apply announced "Successfully
// wrote 0 issues" — then completeWrite re-indexed those issues from Jira, pulling the
// untouched (empty) dates over KVS and erasing the plan's whole schedule. No dates
// means no bars, and a connector is drawn between two bar positions, so every arrow
// vanished too.
//
// This journey schedules DATE-LESS TPP issues from inside the app (the exact shape that
// broke), Applies, and asserts the three things that were wrong:
//   1. Jira actually holds the dates afterwards.
//   2. The toast does not claim success for zero writes.
//   3. The plan still renders its bars after the post-apply reload (it wasn't emptied).
// Restores by clearing the dates it set and re-indexing. wolfaenpak is a test env.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "test";
const START = "customfield_10015";
// Two issues in the plan that carry a real dependency (TPP-32 blocks TPP-33) and no
// dates of their own — so the connector between them can only appear once both are
// scheduled, which is precisely what Apply used to destroy.
const KEYS = ["TPP-32", "TPP-33"];

test.describe.configure({ retries: 0, timeout: 720_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }

type Snap = Record<string, { start: string | null; due: string | null; summary: string }>;
async function jiraSnapshot(page: any): Promise<Snap> {
  return page.evaluate(async ([startField]: [string]) => {
    const res = await fetch("/rest/api/3/search/jql", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" },
      credentials: "include",
      body: JSON.stringify({ jql: "project = TPP", maxResults: 100, fields: ["summary", "duedate", startField] }),
    });
    const d = await res.json();
    const out: Record<string, any> = {};
    for (const i of d.issues || []) out[i.key] = { start: i.fields[startField] || null, due: i.fields.duedate || null, summary: i.fields.summary };
    return out;
  }, [START]);
}
async function jiraPutDates(page: any, key: string, start: string | null, due: string | null) {
  return page.evaluate(async ([k, s, dd, startField]: [string, string | null, string | null, string]) => {
    const res = await fetch(`/rest/api/3/issue/${k}`, {
      method: "PUT",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" },
      credentials: "include",
      body: JSON.stringify({ fields: { [startField]: s, duedate: dd } }),
    });
    return res.status;
  }, [key, start, due, START]);
}

test("TPP APPLY: a plan on a project whose edit screen omits the date fields still WRITES, and is not emptied", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  let s = await enterForgeSurface(page, { surface: "custom" });
  let frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");

  const reenter = async () => {
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
    const ss = await enterForgeSurface(page, { surface: "custom" });
    const f = ss.kind === "custom" ? ss.frame : null; if (!f) throw new Error("no frame"); return f;
  };
  const openPlan = async (fr: any, tab: RegExp) => {
    // "test" is a substring of other plan names/labels — pick the plan CARD by its
    // heading, then Open plan.
    await fr.getByText(PLAN, { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    if (!/Gantt|Table|Dashboard/i.test(await bodyText(fr))) await fr.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    await fr.getByRole("button", { name: tab }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
  };
  const discardDraft = async (fr: any) => {
    for (let i = 0; i < 3; i++) {
      if (!(await isStaged(fr))) break;
      await fr.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
      await page.waitForTimeout(1000);
      await fr.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
      await page.waitForTimeout(1800);
    }
  };

  const ORIG = await jiraSnapshot(page);
  for (const k of KEYS) {
    expect(ORIG[k], `${k} exists in TPP`).toBeTruthy();
    console.log(`ORIG ${k}:`, JSON.stringify(ORIG[k]));
  }

  const toastText: string[] = [];
  page.on("console", () => {});

  await page.waitForTimeout(1500);
  await openPlan(frame, /^Gantt/i);
  await discardDraft(frame);
  // A prior run's restore is an EXTERNAL change as far as the plan is concerned, and
  // Apply's conflict gate would stop the write before it started. Re-index first so
  // the KVS matches fresh Jira and the journey tests the write, not the gate.
  await frame.getByRole("button", { name: /Re-?index/i }).first().click().catch(() => {});
  await page.waitForTimeout(14000);
  frame = await reenter();
  await openPlan(frame, /^Gantt/i);
  await discardDraft(frame);

  try {
    // --- Schedule the two date-less issues from INSIDE the app ---
    // An unscheduled row has no bar; clicking its timeline cell on a working day
    // schedules it (5 working days) — the app's own "give this task dates" gesture.
    for (const key of KEYS) {
      let done = false;
      for (let attempt = 0; attempt < 4 && !done; attempt++) {
        const row = frame.locator(`[data-row-key="${key}"]`).first();
        await row.scrollIntoViewIfNeeded().catch(() => {});
        const box = await row.boundingBox().catch(() => null);
        if (!box) { await page.waitForTimeout(2000); continue; }
        // Click well right of the sticky sidebar, in the middle of the visible timeline.
        // The ghost click ignores NON-WORKING days, and which weekday a fixed x lands on
        // drifts with the calendar (fit-to-work scrolls to today on a dateless plan) — so
        // walk right by ~3 days per attempt instead of hammering the same pixel.
        const x = Math.max(box.x + 700, 1000) + attempt * 40;
        await page.mouse.click(x, box.y + box.height / 2);
        await page.waitForTimeout(1500);
        done = (await frame.locator(`[data-testid="gantt-bar"][data-key="${key}"]`).count()) > 0;
        console.log(`schedule ${key} attempt ${attempt}: bar=${done}`);
      }
      expect(done, `${key} got a bar from the ghost click`).toBeTruthy();
    }

    expect(await isStaged(frame), "scheduling staged a change").toBeTruthy();

    // --- APPLY ---
    await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click();
    await page.waitForTimeout(1500);
    await frame.locator('[data-testid="apply-review-modal"]').first().waitFor({ state: "visible", timeout: 15_000 });
    const modalRows = await frame.locator('[data-testid="apply-change-row"]').count();
    console.log("APPLY modal change rows:", modalRows);
    expect(modalRows, "modal lists the staged date changes").toBeGreaterThan(0);
    await frame.locator('[data-testid="apply-review-modal"]').getByRole("button", { name: /Apply \d+ Change/i }).first().click();
    await page.waitForTimeout(2000);
    if (/changed in Jira since|Apply Anyway/i.test(await bodyText(frame))) {
      console.log("CONFLICT gate fired — acknowledging and proceeding");
      await frame.locator('input[type="checkbox"], [role="checkbox"]').last().click().catch(() => {});
      await frame.getByRole("button", { name: /Apply Anyway/i }).first().click().catch(() => {});
    }

    // Watch the write and CAPTURE the toast text — "Successfully wrote 0 issues" is
    // the exact string the reporter saw, and it must never appear again.
    let finalPhase: string | null = null;
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(1500);
      const t = await bodyText(frame);
      const title = (t.match(/(Preparing…|Writing to Jira|Verifying|Applied|Apply failed)/) || [])[0] || null;
      const toast = (t.match(/(Successfully wrote [^\n]{0,80}|Wrote \d+ issue[^\n]{0,80}|Jira refused every change[^\n]{0,80}|Nothing could be written[^\n]{0,80}|Jira didn't store[^\n]{0,80}|Verification failed)/) || [])[0] || null;
      if (toast && !toastText.includes(toast)) toastText.push(toast);
      console.log(`WP[${i}] phase=${title} toast=${toast}`);
      if (title === "Applied" || title === "Apply failed") { finalPhase = title; break; }
    }
    console.log("FINAL WriteProgress phase:", finalPhase);
    expect(finalPhase, "the write reached the Applied state, not Apply failed").not.toBe("Apply failed");
    await page.waitForFunction(
      () => { const t = document.body.innerText || ""; return !/Apply \d+ change/i.test(t); },
      undefined, { timeout: 90_000 },
    ).catch(() => {});
    await page.waitForTimeout(5000);

    // 1. JIRA HOLDS THE DATES. This is the assertion the old code failed silently.
    const AFTER = await jiraSnapshot(page);
    for (const k of KEYS) {
      console.log(`AFTER ${k}:`, JSON.stringify(AFTER[k]));
      expect(AFTER[k].start, `${k} start date was WRITTEN to Jira`).toBeTruthy();
      expect(AFTER[k].due, `${k} due date was WRITTEN to Jira`).toBeTruthy();
    }

    // 2. The toast told the truth. Asserted POSITIVELY as well as negatively, so this
    //    can't pass just because no toast was captured.
    console.log("TOASTS:", JSON.stringify(toastText));
    expect(toastText.some((t) => /Successfully wrote 0 issues/.test(t)),
      'no "Successfully wrote 0 issues" toast').toBe(false);
    const wroteN = toastText.map((t) => (t.match(/wrote (\d+) issue/i) || [])[1]).filter(Boolean).map(Number);
    console.log("reported write counts:", JSON.stringify(wroteN));
    expect(wroteN.length, "a write-result toast was shown").toBeGreaterThan(0);
    expect(Math.max(...wroteN), "the toast reports a non-zero write").toBeGreaterThan(0);

    // 3. THE PLAN WAS NOT EMPTIED. After the post-apply reload the bars are still
    //    there — the symptom the reporter photographed was every bar (and therefore
    //    every connector) disappearing from the board.
    const barsAfter = await frame.locator('[data-testid="gantt-bar"]').count();
    console.log("bars rendered after apply:", barsAfter);
    expect(barsAfter, "the Gantt still renders bars after Apply").toBeGreaterThan(0);
    for (const k of KEYS) {
      expect(await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).count(),
        `${k} still has a bar after Apply`).toBeGreaterThan(0);
    }
    // and the dependency arrow between them survived
    const arrows = await frame.locator('[data-testid="dep-arrow-hit"]').count();
    console.log("dependency arrows rendered after apply:", arrows);
    expect(arrows, "dependency connectors still render after Apply").toBeGreaterThan(0);

    await page.screenshot({ path: "test-results/tpp-apply-after.png", fullPage: false });
  } finally {
    // --- RESTORE: clear the dates this journey wrote, then re-index. ---
    for (let pass = 1; pass <= 3; pass++) {
      const AFTER = await jiraSnapshot(page).catch(() => ({} as Snap));
      const toRestore = Object.keys(ORIG).filter((k) => AFTER[k] && (AFTER[k].due !== ORIG[k].due || AFTER[k].start !== ORIG[k].start));
      console.log(`RESTORE pass ${pass} — reverting`, toRestore.length, "issues");
      if (toRestore.length === 0) break;
      for (const k of toRestore) await jiraPutDates(page, k, ORIG[k].start, ORIG[k].due).catch(() => {});
      await page.waitForTimeout(2500);
      try {
        frame = await reenter();
        await openPlan(frame, /^Gantt/i);
        await discardDraft(frame);
        await frame.getByRole("button", { name: /Re-?index/i }).first().click().catch(() => {});
        await page.waitForTimeout(8000);
      } catch { /* best-effort */ }
    }
    try { frame = await reenter(); await openPlan(frame, /^Gantt/i); await discardDraft(frame); } catch { /* best-effort */ }
  }
});

// PERSISTENT feature journey — the APPLY → JIRA WRITE path on LZPT. This is the app's
// headline action and, until the owner authorised writing to wolfaenpak (all-test), was the
// one big untested feature: every other journey STAGES then DISCARDS; this one COMMITS.
// Flow: snapshot every issue's dates from Jira → drag the head to stage a real cascade →
// click "Apply N changes" → confirm in the review modal → the app writes to Jira → VERIFY by
// re-reading Jira REST that the head AND a cascaded successor now hold their new dates (proves
// the write happened, not just the preview). Then RESTORE in a finally: PUT every changed
// issue back to its snapshot date + Re-index, so LZPT is bit-for-bit restored. Bulletproof
// regardless of how many issues cascaded. wolfaenpak is a test env (owner-authorised).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const START = "customfield_10015";
test.describe.configure({ retries: 0, timeout: 300_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }

type Snap = Record<string, { start: string | null; due: string | null; summary: string }>;
async function jiraSnapshot(page: any): Promise<Snap> {
  return page.evaluate(async ([startField]: [string]) => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary", "duedate", startField] }) });
    const d = await res.json(); const out: Record<string, any> = {};
    for (const i of d.issues || []) out[i.key] = { start: i.fields[startField] || null, due: i.fields.duedate || null, summary: i.fields.summary };
    return out;
  }, [START]);
}
async function jiraPutDates(page: any, key: string, start: string | null, due: string | null) {
  return page.evaluate(async ([k, s, dd, startField]: [string, string | null, string | null, string]) => {
    const fields: any = {}; if (s) fields[startField] = s; if (dd) fields.duedate = dd;
    const res = await fetch(`/rest/api/3/issue/${k}`, { method: "PUT", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ fields }) });
    return res.status;
  }, [key, start, due, START]);
}

test("LZPT APPLY: staged cascade is WRITTEN to Jira, then fully restored", async ({ page }) => {
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
    await fr.getByText(PLAN, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    if (!/Gantt|Table|Dashboard/i.test(await bodyText(fr))) await fr.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    await fr.getByRole("button", { name: tab }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
  };
  const discardDraft = async (fr: any) => {
    for (let i = 0; i < 3; i++) { if (!(await isStaged(fr))) break; await fr.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {}); await page.waitForTimeout(1000); await fr.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {}); await page.waitForTimeout(1800); }
  };

  // Snapshot EVERY issue's dates from Jira (the restore baseline).
  const ORIG = await jiraSnapshot(page);
  const headKey = Object.keys(ORIG).find((k) => ORIG[k].summary === "CROSS-A gate")!;
  expect(headKey, "resolved the head (CROSS-A gate)").toBeTruthy();
  console.log("ORIG head:", headKey, JSON.stringify(ORIG[headKey]));

  await page.waitForTimeout(1500);
  await openPlan(frame, /^Gantt/i);
  // The bed may have just been re-seeded — re-index so the app's KVS matches fresh Jira.
  await frame.getByRole("button", { name: /Re-?index/i }).first().click().catch(() => {});
  await page.waitForTimeout(12000);
  frame = await reenter();
  await openPlan(frame, /^Gantt/i);
  await discardDraft(frame);


  try {
    // --- Stage a real cascade: drag the head bar later (robust: scroll into view + retry) ---
    let staged = false;
    for (let attempt = 0; attempt < 4 && !staged; attempt++) {
      const barLoc = frame.locator(`[data-testid="gantt-bar"][data-key="${headKey}"]`).first();
      await barLoc.scrollIntoViewIfNeeded().catch(() => {});
      const box = await barLoc.boundingBox().catch(() => null);
      if (!box) { await page.waitForTimeout(2500); continue; }
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2, dx = 140;
      await page.mouse.move(cx, cy); await page.mouse.down();
      for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(3000);
      staged = await isStaged(frame);
      console.log(`drag attempt ${attempt}: staged=${staged}`);
    }
    expect(staged, "drag staged a change").toBeTruthy();

    // --- APPLY: toolbar → review modal → confirm ("... will be written to Jira") ---
    await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click();
    await page.waitForTimeout(1500);
    await frame.locator('[data-testid="apply-review-modal"]').first().waitFor({ state: "visible", timeout: 15_000 });
    const modalRows = await frame.locator('[data-testid="apply-change-row"]').count();
    console.log("APPLY modal change rows:", modalRows);
    expect(modalRows, "modal lists the staged date changes").toBeGreaterThan(0);
    await frame.locator('[data-testid="apply-review-modal"]').getByRole("button", { name: /Apply \d+ Change/i }).first().click();

    // --- DIAGNOSTIC: capture the WriteProgress modal state (phase title + any error rows) ---
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(2000);
      const t = await bodyText(frame);
      const title = (t.match(/(Preparing…|Writing to Jira|Verifying|Applied|Apply failed)/) || [])[0] || null;
      const err = (t.match(/(cannot be set|not on the appropriate screen|Field '?[a-z0-9_]+'? cannot|is not on the appropriate screen, or unknown|Write chunk failed|Failed to start write|Write lock lost|Verification failed|couldn't be written|verification warning)/i) || [])[0] || null;
      const staged = /Apply \d+ change/i.test(t);
      console.log(`WP[${i}] phase=${title} err=${err} staged=${staged}`);
      if (title === "Applied" || title === "Apply failed" || (!staged && !title)) break;
    }

    // --- Wait for the write to complete (Apply badge clears once Jira write + reindex finish) ---
    await page.waitForFunction(
      () => { const t = document.body.innerText || ""; return !/Apply \d+ change/i.test(t); },
      undefined, { timeout: 90_000 },
    ).catch(() => {});
    await page.waitForTimeout(4000);
    console.log("post-apply staged?", await isStaged(frame));

    // --- VERIFY THE WRITE: Jira now holds the new dates (head moved + a successor cascaded) ---
    const AFTER = await jiraSnapshot(page);
    const headMoved = AFTER[headKey].due !== ORIG[headKey].due || AFTER[headKey].start !== ORIG[headKey].start;
    const changedKeys = Object.keys(ORIG).filter((k) => AFTER[k] && (AFTER[k].due !== ORIG[k].due || AFTER[k].start !== ORIG[k].start));
    console.log("WRITTEN to Jira — changed keys:", changedKeys.length, JSON.stringify(changedKeys.slice(0, 8)));
    expect(headMoved, "the dragged head's new dates were WRITTEN to Jira (not just previewed)").toBe(true);
    expect(changedKeys.length, "the cascade wrote multiple issues to Jira").toBeGreaterThan(1);
    // the head moved LATER (a forward drag)
    if (ORIG[headKey].due && AFTER[headKey].due) expect(AFTER[headKey].due! > ORIG[headKey].due!, "head due moved later").toBe(true);
  } finally {
    // --- RESTORE: PUT every changed issue back to its snapshot dates, then Re-index ---
    const AFTER = await jiraSnapshot(page).catch(() => ({} as Snap));
    const toRestore = Object.keys(ORIG).filter((k) => AFTER[k] && (AFTER[k].due !== ORIG[k].due || AFTER[k].start !== ORIG[k].start));
    console.log("RESTORE — reverting", toRestore.length, "issues to snapshot");
    for (const k of toRestore) await jiraPutDates(page, k, ORIG[k].start, ORIG[k].due);
    // Re-index so the app's KVS index re-reads the restored Jira dates.
    try {
      frame = await reenter();
      await openPlan(frame, /^Gantt/i);
      await discardDraft(frame);
      await frame.getByRole("button", { name: /Re-?index/i }).first().click().catch(() => {});
      await page.waitForTimeout(6000);
    } catch { /* best-effort */ }
    // Verify Jira is bit-for-bit restored.
    const FINAL = await jiraSnapshot(page).catch(() => ({} as Snap));
    const stillOff = Object.keys(ORIG).filter((k) => FINAL[k] && (FINAL[k].due !== ORIG[k].due || FINAL[k].start !== ORIG[k].start));
    console.log("RESTORE check — issues still off snapshot:", stillOff.length, JSON.stringify(stillOff));
    expect(stillOff.length, "LZPT restored to its Jira snapshot (all dates back)").toBe(0);
  }
});

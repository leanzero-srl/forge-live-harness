// PERSISTENT feature journey — the #12 report, reproduced FAITHFULLY on LZPT:
// "created a parent and children, established the connections between them, clicked
//  save and then apply changes, but after this step my schema disappeared."
//
// Flow: create a fresh Epic + 2 child Tasks in Jira (the "created since the last
// index" case that Save used to silently drop) → Re-index so the plan sees them →
// DRAW the dependency in the Gantt → SAVE (the KVS checkpoint that used to write
// whole client rows over the indexed baseline) → APPLY (writes the link + pushed
// dates to Jira) → RELOAD → the schema must still be there: all rows, the new link
// as a REAL indexed arrow, the pre-existing links untouched, the hierarchy intact,
// and the link present in Jira itself. Cleanup deletes the 3 created issues and
// restores any drifted original dates, then re-indexes back to 45.
// wolfaenpak is a test env (owner-authorised).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const START = "customfield_10015";
const EPIC_TYPE = "10133", TASK_TYPE = "10135";
test.describe.configure({ retries: 0, timeout: 720_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }

async function api(page: any, method: string, path: string, body?: any) {
  return page.evaluate(
    async ([m, p, b]: [string, string, any]) => {
      const res = await fetch(p, {
        method: m,
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" },
        credentials: "include",
        body: b ? JSON.stringify(b) : undefined,
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      return { status: res.status, ok: res.ok, data };
    },
    [method, path, body],
  );
}

type Snap = Record<string, { start: string | null; due: string | null; summary: string }>;
async function jiraSnapshot(page: any): Promise<Snap> {
  const r = await api(page, "POST", "/rest/api/3/search/jql", { jql: "project = LZPT", maxResults: 100, fields: ["summary", "duedate", START] });
  const out: Snap = {};
  for (const i of r.data?.issues || []) out[i.key] = { start: i.fields[START] || null, due: i.fields.duedate || null, summary: i.fields.summary };
  return out;
}

test("LZPT #12: create parent+children, link, Save, Apply — the schema SURVIVES", async ({ page }) => {
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
  const openPlan = async (fr: any) => {
    await fr.getByText(PLAN, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    if (!/Gantt|Table|Dashboard/i.test(await bodyText(fr))) await fr.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    await fr.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(3500);
  };
  const discardDraft = async (fr: any) => {
    for (let i = 0; i < 3; i++) { if (!(await isStaged(fr))) break; await fr.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {}); await page.waitForTimeout(1000); await fr.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {}); await page.waitForTimeout(1800); }
  };
  const reindexAndReopen = async () => {
    await frame!.getByRole("button", { name: /Re-?index/i }).first().click().catch(() => {});
    await page.waitForTimeout(14_000);
    await page.reload({ waitUntil: "domcontentloaded" });
    frame = await reenter();
    await page.waitForTimeout(2000);
    await openPlan(frame);
  };

  const ORIG = await jiraSnapshot(page);
  const origCount = Object.keys(ORIG).length;
  console.log("ORIG issue count:", origCount);

  const created: string[] = [];
  try {
    // --- 1. CREATE the parent + children in Jira (fresh, post-index — the #12 shape) ---
    const ep = await api(page, "POST", "/rest/api/3/issue", { fields: { project: { key: "LZPT" }, issuetype: { id: EPIC_TYPE }, summary: "APLNK parent" } });
    expect(ep.ok, `epic created (${ep.status})`).toBeTruthy();
    created.push(ep.data.key);
    const c1 = await api(page, "POST", "/rest/api/3/issue", { fields: { project: { key: "LZPT" }, issuetype: { id: TASK_TYPE }, summary: "APLNK child-1", parent: { key: ep.data.key }, [START]: "2026-05-11", duedate: "2026-05-15" } });
    const c2 = await api(page, "POST", "/rest/api/3/issue", { fields: { project: { key: "LZPT" }, issuetype: { id: TASK_TYPE }, summary: "APLNK child-2", parent: { key: ep.data.key }, [START]: "2026-05-14", duedate: "2026-05-20" } });
    expect(c1.ok && c2.ok, "children created").toBeTruthy();
    created.push(c1.data.key, c2.data.key);
    const [K1, K2] = [c1.data.key, c2.data.key];
    console.log("CREATED", created.join(", "));

    // --- 2. Open the plan + Re-index so the new family is in the plan ---
    await page.waitForTimeout(1500);
    await openPlan(frame);
    await discardDraft(frame);
    await reindexAndReopen();
    const shown = (await bodyText(frame)).match(/Showing\s+(\d+)\s+of\s+(\d+)/i);
    console.log("after reindex:", shown && shown[0]);
    expect(shown && Number(shown[1]) === origCount + 3, `plan indexed the new family (${shown && shown[0]})`).toBeTruthy();

    // --- 3. DRAW the dependency child-1 → child-2 (the "established the connections" step) ---
    const arrowExists = async (fr: any, f: string, t: string) => {
      const rf = await (await fr.locator(":root").elementHandle())!.ownerFrame();
      return rf!.evaluate(({ a, b }: any) => !!document.querySelector(`[data-testid="dep-arrow-hit"][data-link="${a}-${b}"]`), { a: f, b: t });
    };
    let drawn = false;
    for (let attempt = 0; attempt < 4 && !drawn; attempt++) {
      const srcLoc = frame.locator(`[data-testid="gantt-bar"][data-key="${K1}"]`).first();
      await srcLoc.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(600);
      const srcBox = await srcLoc.boundingBox().catch(() => null);
      const dstBox = await frame.locator(`[data-testid="gantt-bar"][data-key="${K2}"]`).first().boundingBox().catch(() => null);
      if (!srcBox || !dstBox) { await page.waitForTimeout(2000); continue; }
      await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
      await page.waitForTimeout(400);
      const dotX = srcBox.x + srcBox.width + 4, dotY = srcBox.y + srcBox.height / 2;
      await page.mouse.move(dotX, dotY);
      await page.mouse.down();
      const tx = dstBox.x + dstBox.width / 2, ty = dstBox.y + dstBox.height / 2;
      for (const f of [0.3, 0.6, 0.9, 1]) await page.mouse.move(dotX + (tx - dotX) * f, dotY + (ty - dotY) * f, { steps: 5 });
      await page.waitForTimeout(200);
      await page.mouse.up();
      await page.waitForTimeout(2500);
      drawn = await arrowExists(frame, K1, K2);
      console.log(`draw attempt ${attempt}: drawn=${drawn}`);
    }
    expect(drawn, "the dependency was drawn").toBeTruthy();

    // --- 4. SAVE (the step that used to corrupt the stored rows) ---
    await frame.locator('[data-testid="plan-save-btn"]').first().click().catch(() => {});
    await page.waitForTimeout(4000);
    console.log("after save, staged:", await isStaged(frame));

    // --- 5. APPLY (writes the link + the pushed child-2 dates to Jira) ---
    if (await isStaged(frame)) {
      await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click();
      await page.waitForTimeout(1500);
      await frame.locator('[data-testid="apply-review-modal"]').first().waitFor({ state: "visible", timeout: 15_000 });
      await frame.locator('[data-testid="apply-review-modal"]').getByRole("button", { name: /Apply \d+ Change/i }).first().click();
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(2000);
        const t = await bodyText(frame);
        const phase = (t.match(/(Preparing…|Writing to Jira|Verifying|Applied|Apply failed)/) || [])[0] || null;
        console.log(`APPLY[${i}] phase=${phase} staged=${/Apply \d+ change/i.test(t)}`);
        if (phase === "Applied" || phase === "Apply failed" || (!/Apply \d+ change/i.test(t) && !phase)) break;
      }
      await page.waitForTimeout(3000);
    }

    // --- 6. RELOAD and assert the SCHEMA SURVIVED (the #12 failure mode) ---
    await page.reload({ waitUntil: "domcontentloaded" });
    frame = await reenter();
    await page.waitForTimeout(2000);
    await openPlan(frame);

    const t = await bodyText(frame);
    const shown2 = t.match(/Showing\s+(\d+)\s+of\s+(\d+)/i);
    console.log("after apply+reload:", shown2 && shown2[0]);
    expect(shown2 && Number(shown2[1]) === origCount + 3, "every row still renders — nothing disappeared").toBeTruthy();

    // The drawn link is now a REAL indexed arrow (survived Save+Apply+reload)...
    expect(await arrowExists(frame, K1, K2), "the created link SURVIVED Save+Apply+reload").toBeTruthy();
    // ...and it exists in JIRA, not just in the app's storage.
    const links = await api(page, "GET", `/rest/api/3/issue/${K2}?fields=issuelinks`);
    const linkedFrom = (links.data?.fields?.issuelinks || []).some((l: any) => l.inwardIssue?.key === K1);
    expect(linkedFrom, `Jira holds the ${K1} blocks ${K2} link`).toBeTruthy();

    // Pre-existing schema untouched: the seeded CHAIN link still renders.
    const chain1 = Object.keys(ORIG).find((k) => ORIG[k].summary === "CHAIN-1 kickoff")!;
    const chain2 = Object.keys(ORIG).find((k) => ORIG[k].summary === "CHAIN-2 build")!;
    expect(await arrowExists(frame, chain1, chain2), "pre-existing CHAIN link untouched").toBeTruthy();

    // The hierarchy is intact: both children still sit under the created parent.
    const fam = await api(page, "POST", "/rest/api/3/search/jql", { jql: `parent = ${created[0]}`, maxResults: 10, fields: ["summary"] });
    expect((fam.data?.issues || []).length, "parent still has both children").toBe(2);

    // No un-discardable staged residue (the original bug left phantom staged arrows).
    await discardDraft(frame);
    expect(await isStaged(frame), "no lingering staged state after Apply").toBeFalsy();
  } finally {
    // --- CLEANUP: delete the created family, restore any drifted originals, re-index ---
    for (const k of created.slice().reverse()) {
      const del = await api(page, "DELETE", `/rest/api/3/issue/${k}?deleteSubtasks=true`);
      console.log("deleted", k, del.status);
    }
    const AFTER = await jiraSnapshot(page);
    let drifted = 0;
    for (const k of Object.keys(ORIG)) {
      if (!AFTER[k]) continue;
      if (AFTER[k].start !== ORIG[k].start || AFTER[k].due !== ORIG[k].due) {
        drifted++;
        const fields: any = { [START]: ORIG[k].start, duedate: ORIG[k].due };
        await api(page, "PUT", `/rest/api/3/issue/${k}`, { fields });
      }
    }
    console.log("restored drifted originals:", drifted);
    try {
      await reindexAndReopen();
      await discardDraft(frame);
      const endText = await bodyText(frame!);
      console.log("FINAL:", (endText.match(/Showing\s+\d+\s+of\s+\d+/i) || [])[0], "staged:", await isStaged(frame!));
    } catch (e) {
      console.log("cleanup reopen failed (bed restored via REST regardless):", String(e).slice(0, 200));
    }
  }
});

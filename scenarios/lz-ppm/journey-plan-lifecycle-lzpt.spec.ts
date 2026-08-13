// PLAN LIFECYCLE journey — closes three gaps in one non-destructive run: the wizard's full
// CREATE flow, the degenerate SINGLE-ISSUE plan state (only empty + huge were covered), and
// DELETE-plan (confirm dialog + removal). Creates a throwaway 1-issue plan (key = LZPT-99),
// verifies it renders without NaN/crash, then deletes it via the confirm dialog and checks it
// is gone. wolfaenpak is an authorised test env. Self-cleaning: the delete IS the cleanup;
// a finally also tries to delete if an assertion aborts mid-way.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const NAME = `AUDIT DeleteMe ${Date.now()}`; // unique per run so leftovers can't confuse verify
test.describe.configure({ retries: 0, timeout: 300_000 });
async function bodyText(f: any) { return (await f.locator("body").textContent().catch(() => "")) || ""; }

test("LIFECYCLE: create single-issue plan → renders → delete", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(1500);

  const deleteIfPresent = async () => {
    // Best-effort cleanup: if the throwaway plan is open, delete it via toolbar + confirm.
    if (!/Delete/i.test(await bodyText(frame))) return;
    await frame.locator("button").filter({ hasText: /^Delete$/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    await frame.getByRole("button", { name: /^Delete$/ }).last().click().catch(() => {});
    await page.waitForTimeout(2500);
  };

  try {
    // --- CREATE via wizard ---
    await frame.getByRole("button", { name: /New plan/i }).first().click().catch(async () => {
      await frame.getByText(/New plan/i).first().click().catch(() => {});
    });
    await page.waitForTimeout(1500);
    await frame.getByPlaceholder(/Q2 Release Plan/i).first().fill(NAME);
    const cont = () => frame.getByRole("button", { name: /Continue/i }).first();
    await cont().click();
    await page.waitForTimeout(1000);
    // Sources: JQL for exactly one issue. The key must be RESOLVED, not hardcoded —
    // LZPT keys float on every reseed, and a dead key makes the wizard's invalid-JQL
    // gate (correctly) disable Continue, which used to read as a 20s click timeout.
    const oneKey: string = await page.evaluate(async () => {
      // Must be a LEAF with no children — an Epic's plan pulls its whole subtree
      // via hierarchy discovery and renders N bars, not 1. Resolve by EXACT
      // summary match client-side: JQL `summary ~` tokenizes, so "WIDE-10" also
      // matches the "Wide parent" epic (that mistake rendered 11 bars).
      const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }) });
      const d = await res.json();
      const hit = (d.issues || []).find((i: any) => i.fields.summary === "WIDE-10");
      return hit?.key || "";
    });
    expect(oneKey, "resolved a live LZPT key for the 1-issue plan").toBeTruthy();
    await frame.getByPlaceholder(/project = PROJ/i).first().fill(`key = ${oneKey}`);
    await frame.getByText(/✓ Valid/i).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    await cont().click(); await page.waitForTimeout(800);
    await cont().click(); await page.waitForTimeout(800); // Schedule (defaults)
    await cont().click(); await page.waitForTimeout(800); // Milestones (skip)
    await frame.getByRole("button", { name: /Create & Index/i }).first().click();

    // Wait for indexing to finish + the plan to open (1 issue).
    let opened = false;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(3000);
      if (/Showing\s+1\s+of\s+1|1\s+issue\b/i.test(await bodyText(frame))) { opened = true; break; }
      if (/Gantt|Table/i.test(await bodyText(frame)) && !/Indexing|Creating/i.test(await bodyText(frame))) { opened = true; break; }
    }
    expect(opened, "the new single-issue plan opened").toBe(true);

    // --- SINGLE-ISSUE render: open Gantt, exactly one bar, finite geometry, no NaN ---
    await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    // Count-based settle: a freshly-created plan's first Gantt paint waits on the calendar
    // resolver (Lambda cold-start), so poll for the bar rather than a fixed sleep.
    let bars = 0;
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(2000);
      bars = await frame.locator('[data-testid="gantt-bar"]').count().catch(() => 0);
      if (bars > 0) break;
    }
    const body = await bodyText(frame);
    await page.screenshot({ path: "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad/audit/single-issue-gantt.png" });
    const showing = (body.match(/Showing\s+[\d,]+\s+of\s+[\d,]+/i) || [])[0] || "none";
    const noIssues = /No issues|empty/i.test(body);
    console.log("SINGLE: bars=", bars, "showing=", showing, "noIssues=", noIssues, "hasNaN=", /NaN|Infinity/.test(body));
    // Two bars, not one: createPlan defaults includeParents ON (ffa2636d), so a
    // single-CHILD plan legitimately hydrates its missing parent — the row plus
    // its rolled-up parent bracket. The defect this guards (a BLANK Gantt on a
    // degenerate near-empty plan) fails either assertion.
    expect(bars, "single-issue plan renders its bar + the hydrated parent").toBe(2);
    const ownBar = await frame.locator(`[data-testid="gantt-bar"][data-key="${oneKey}"]`).count().catch(() => 0);
    expect(ownBar, `the resolved issue ${oneKey} has its own bar`).toBe(1);
    expect(/NaN|Infinity/.test(body), "no NaN/Infinity in a single-issue plan").toBe(false);

    // --- DELETE: toolbar Delete → confirm dialog "Delete" ---
    await frame.locator("button").filter({ hasText: /^Delete$/ }).first().click();
    await frame.getByText(/cannot be undone/i).first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    await frame.getByRole("button", { name: /^Delete$/ }).last().click();
    await page.waitForTimeout(3500);

    // --- Verify gone: back at the portfolio, the plan is not listed ---
    const after = await bodyText(frame);
    console.log("AFTER DELETE: planStillListed=", after.includes(NAME));
    expect(after.includes(NAME), "the deleted plan is gone from the portfolio").toBe(false);
    console.log("LIFECYCLE_DONE");
  } finally {
    await deleteIfPresent();
  }
});

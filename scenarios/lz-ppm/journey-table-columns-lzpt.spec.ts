// PERSISTENT feature journey — Table COLUMN show/hide + PERSISTENCE on LZPT
// (read-only view op). Add the optional "Status" column via the picker → its header
// appears + its cells show the seeded statuses (Done=6, In Progress=4); the choice
// PERSISTS across a view switch (Gantt↔Table, localStorage layout); removing it
// restores the default. Mutates NOTHING (view pref). NEVER Applies. Keys by summary.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Table columns: add Status → cells correct + persists across view switch", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  const keyMap: Record<string, string> = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }) });
    const d = await res.json(); const m: Record<string, string> = {}; for (const i of d.issues || []) m[i.fields.summary] = i.key; return m;
  });
  const K = (x: string) => keyMap[x];
  const c1 = K("CHAIN-1 kickoff"), c2 = K("CHAIN-2 build");

  const openTable = async () => { await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {}); await page.waitForTimeout(2500); };
  await page.waitForTimeout(1800);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await openTable();

  const statusHeader = () => realFrame!.evaluate(() => !!document.querySelector('[data-testid="table-sort-status"]'));
  const statusOptionPressed = () => realFrame!.evaluate(() => document.querySelector('[data-testid="col-option-status"]')?.getAttribute("aria-pressed") === "true");
  const openPicker = async () => { await frame.getByRole("button", { name: /Columns/i }).first().click().catch(() => {}); await page.waitForTimeout(500); };
  const toggleStatus = async () => { await frame.locator('[data-testid="col-option-status"]').first().click().catch(() => {}); await page.waitForTimeout(800); };
  const rowStatus = (key: string) => realFrame!.evaluate((k) => document.querySelector(`[data-testid="table-row"][data-row-key="${k}"]`)?.getAttribute("data-row-status"), key);
  const statusCounts = () => realFrame!.evaluate(() => {
    const m: Record<string, number> = {};
    for (const el of Array.from(document.querySelectorAll('[data-testid="table-row"]'))) { const s = el.getAttribute("data-row-status") || "∅"; m[s] = (m[s] || 0) + 1; }
    return m;
  });

  // Normalise: ensure Status column is OFF to start (the harness reuses storage).
  await openPicker();
  if (await statusOptionPressed()) { await toggleStatus(); }
  // close picker
  await frame.getByRole("button", { name: /Columns/i }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  expect(await statusHeader(), "Status column starts hidden").toBeFalsy();

  // ---- Add the Status column ----
  await openPicker();
  await toggleStatus();
  await frame.getByRole("button", { name: /Columns/i }).first().click().catch(() => {}); // close
  await page.waitForTimeout(600);
  expect(await statusHeader(), "Status column header appears after adding").toBeTruthy();

  // Cells show the SEEDED statuses.
  const counts = await statusCounts();
  console.log("STATUS_COUNTS:", JSON.stringify(counts), " CHAIN-1:", await rowStatus(c1), " CHAIN-2:", await rowStatus(c2));
  expect(counts["Done"], "6 issues are Done (as seeded)").toBe(6);
  expect(counts["In Progress"], "4 issues are In Progress (as seeded)").toBe(4);
  expect(await rowStatus(c1), "CHAIN-1 is Done").toBe("Done");
  expect(await rowStatus(c2), "CHAIN-2 is In Progress").toBe("In Progress");

  // ---- PERSISTENCE: switch to Gantt and back — the column survives ----
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await openTable();
  expect(await statusHeader(), "Status column PERSISTED across the view switch").toBeTruthy();

  // ---- Restore default: remove the Status column ----
  await openPicker();
  await toggleStatus();
  await frame.getByRole("button", { name: /Columns/i }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  expect(await statusHeader(), "Status column removed (default restored)").toBeFalsy();
});

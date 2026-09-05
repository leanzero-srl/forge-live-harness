// Inline-panel LABEL round-trip on the sealed fixture — the two asUser() label resolvers driven
// through the real card controls (a11y.spec.ts only reads the button's aria-label; it never clicks):
//   label-artifact    → click "Add a label" (.label-add-btn) on the fixture card, type a unique
//                       name, Enter → LabelCluster.handleAdd (inline-panel/index.jsx:89-104) → the
//                       chip renders after onRefresh → REST v1 GET .../content/{att}/label lists it.
//   unlabel-artifact  → click the chip's "Remove label <name>" (index.jsx:74) → handleRemove
//                       (index.jsx:106-117) → chip gone → REST no longer lists it.
// The REST read is the independent truth: the chip alone could be optimistic UI. Both id forms
// (`att265945089` and `265945089`) answer 200 on the v1 label endpoint (probed 2026-09-05); the
// `att` form is what the app itself sends (panels/actions.js:171), so it is used here.
// CLEANUP IS UNCONDITIONAL: the label is DELETEd over REST in `finally` even if the UI half fails,
// so a broken remove can never leave a stray label on the shared fixture. Dev-scoped (env 17516615).
// @covers resolver:label-artifact resolver:unlabel-artifact
import { test, expect } from "../../fixtures/forge";
// @ts-ignore - plain ESM JS helper
import { request } from "../../data/jira.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const DEV = "17516615";
const FIXTURE_ATT = "att265945089";
const FIXTURE_NAME = "sv-aql-sealed-fixture.txt";
const IFRAMES = 'iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]';
test.describe.configure({ timeout: 180_000, retries: 1 });

/** Label names on the fixture, via the v1 content-label endpoint (the one the app writes to). */
async function restLabels(): Promise<string[]> {
  const r = await request("GET", `/wiki/rest/api/content/${FIXTURE_ATT}/label?limit=200`, { raw: true });
  if (r.status >= 400) throw new Error(`GET labels -> ${r.status}: ${r.text.slice(0, 200)}`);
  return (JSON.parse(r.text).results || []).map((l: any) => l.name);
}
async function restDeleteLabel(name: string): Promise<number> {
  const r = await request("DELETE", `/wiki/rest/api/content/${FIXTURE_ATT}/label?name=${encodeURIComponent(name)}`, { raw: true });
  return r.status;
}

/**
 * Re-resolve the DEV inline-panel frame on EVERY call: Forge iframes remount after first paint and
 * after in-panel refreshes, so a FrameLocator captured once can go stale mid-test (the it49 lesson).
 */
async function findDevPanel(page: any) {
  const iframes = page.locator(IFRAMES);
  const n = await iframes.count();
  for (let i = 0; i < n; i++) {
    const src = (await iframes.nth(i).getAttribute("src").catch(() => "")) || "";
    if (!src.includes(DEV)) continue;
    const cf = iframes.nth(i).contentFrame();
    if ((await cf.locator(".sv-panel-container").count().catch(() => 0)) > 0) return cf;
  }
  return null;
}
async function waitForDevPanel(page: any, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const panel = await findDevPanel(page);
    if (panel) {
      const loading = await panel.locator(".sv-panel-loading").count().catch(() => 1);
      const hasCard = await panel.locator(".artifact-card", { hasText: FIXTURE_NAME }).count().catch(() => 0);
      if (loading === 0 && hasCard > 0) return panel;
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

test("inline-panel labels: add via '+' → chip + REST lists it → remove via chip × → gone (label/unlabel-artifact)", async ({ page }, testInfo) => {
  const OUT = path.join(testInfo.outputDir, "shots");
  mkdirSync(OUT, { recursive: true });
  const label = `aql-label-${Date.now()}`;

  // Precondition: the fixture must not already carry a label with this name (it can't — timestamped),
  // and we record the baseline so the final REST assert is a real delta, not a coincidence.
  const before = await restLabels();
  console.log("### labels before:", JSON.stringify(before));
  expect(before, "unique label name not pre-existing").not.toContain(label);

  try {
    await page.goto(PAGE, { waitUntil: "domcontentloaded" });
    let panel = await waitForDevPanel(page);
    expect(panel, "dev inline-panel rendered the fixture card (not a spinner)").toBeTruthy();
    await page.screenshot({ path: `${OUT}/1-panel.png` });

    // ── ADD ───────────────────────────────────────────────────────────────────────────────────
    let card = panel!.locator(".artifact-card", { hasText: FIXTURE_NAME });
    const addBtn = card.locator('.label-add-btn[aria-label="Add a label"]');
    await expect(addBtn, "'Add a label' button on the fixture card (labels column on)").toBeVisible({ timeout: 15000 });
    await addBtn.click();
    const input = card.locator(".label-input");
    await expect(input, "label input opened").toBeVisible({ timeout: 10000 });
    await input.fill(label);
    await page.screenshot({ path: `${OUT}/2-typed.png` });
    await input.press("Enter"); // handleKeyDown → handleAdd → invoke("label-artifact")

    // The chip appears once onRefresh re-fetches the page artifacts (labels ride on
    // enumerate-panel-artifacts). Re-resolve the panel on every poll — the refresh can remount.
    await expect.poll(async () => {
      panel = await findDevPanel(page);
      if (!panel) return 0;
      return panel.locator(".artifact-card", { hasText: FIXTURE_NAME }).locator(".label-chip", { hasText: label }).count();
    }, { timeout: 40_000, message: `label chip "${label}" renders on the fixture card` }).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: `${OUT}/3-chip-added.png` });
    console.log(`### chip "${label}" rendered ✓`);

    // Independent truth: Confluence itself now lists the label on the attachment.
    await expect.poll(async () => (await restLabels()).includes(label), { timeout: 20_000, message: "REST lists the new label on the attachment" }).toBe(true);
    console.log("### REST GET .../label lists it ✓ (label-artifact wrote to Confluence)");

    // ── REMOVE ────────────────────────────────────────────────────────────────────────────────
    panel = await findDevPanel(page);
    expect(panel, "dev panel still mounted").toBeTruthy();
    card = panel!.locator(".artifact-card", { hasText: FIXTURE_NAME });
    const chip = card.locator(".label-chip", { hasText: label });
    const remove = chip.locator(`.label-chip-remove[aria-label="Remove label ${label}"]`);
    await expect(remove, "chip remove control with its accessible name").toBeVisible({ timeout: 10000 });
    await remove.click(); // handleRemove → invoke("unlabel-artifact")

    await expect.poll(async () => {
      panel = await findDevPanel(page);
      if (!panel) return -1; // panel vanished → keep polling, do not pass on absence
      return panel.locator(".artifact-card", { hasText: FIXTURE_NAME }).locator(".label-chip", { hasText: label }).count();
    }, { timeout: 40_000, message: `label chip "${label}" removed from the fixture card` }).toBe(0);
    await page.screenshot({ path: `${OUT}/4-chip-removed.png` });
    console.log("### chip gone ✓");

    await expect.poll(async () => (await restLabels()).includes(label), { timeout: 20_000, message: "REST no longer lists the label" }).toBe(false);
    console.log("### REST GET .../label no longer lists it ✓ (unlabel-artifact removed it)");
  } finally {
    // Unconditional cleanup — a failed UI remove must never strand a label on the shared fixture.
    const st = await restDeleteLabel(label).catch((e: any) => `err:${e?.message}`);
    const after = await restLabels().catch(() => null);
    console.log(`### cleanup DELETE label -> ${st}; labels after: ${JSON.stringify(after)}`);
    if (after) expect(after, "fixture carries no test label after cleanup").not.toContain(label);
  }
});

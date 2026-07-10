// PERSISTENT journey J7 — Save vs Apply boundary (adversarial, read-only to Jira).
// Proves: (a) Save persists to KVS and SURVIVES a full reload, and the edit stays
// PENDING vs Jira (Apply count unchanged — Save must NOT absorb the edit into the
// baseline); (b) the Apply REVIEW modal's change-list EXACTLY matches the staged
// edits (count claimed == rows rendered, the dragged leaf is listed, and EVERY row
// is a real change — no phantom old==new). NEVER clicks Apply; NEVER writes to Jira.
// Restores clean (Discard All) at the end.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
test.describe.configure({ retries: 0, timeout: 260_000 });

async function bodyText(frame: any): Promise<string> {
  return (await frame.locator("body").textContent().catch(() => "")) || "";
}
async function isStaged(frame: any): Promise<boolean> {
  const t = await bodyText(frame);
  return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t);
}
// The number on the toolbar "Apply N changes" button — the pending-vs-Jira count.
async function applyCount(frame: any): Promise<number | null> {
  const m = (await bodyText(frame)).match(/Apply (\d+) change/i);
  return m ? +m[1] : null;
}
async function dragBar(page: any, box: any, dx: number) {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 4 });
  await page.mouse.up();
}
async function openPlanGantt(page: any, frame: any) {
  await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
}
async function enter(page: any) {
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  return frame;
}
// True restore to the Jira baseline WITHOUT touching Jira. Discard All reverts the
// VIEW to _original but does NOT rewrite the KVS shards — so after a prior Save the
// revert reads as "unsaved" (Save nag) and would resurrect on reload. Persisting the
// baseline (Save) rewrites the shards + clears the draft, leaving the plan truly clean.
async function fullRestore(page: any, frame: any) {
  if (/Apply \d+ change/i.test(await bodyText(frame))) {
    await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  const saveNag = /Save \(\d+\)/i.test(await bodyText(frame));
  console.log("SAVE_NAG_AFTER_DISCARD (two-axis caveat — expected TRUE only after a prior Save):", saveNag);
  if (saveNag) {
    await frame.locator("button").filter({ hasText: /^Save \(/i }).first().click().catch(() => {});
    await page.waitForTimeout(3800); // savePlanState rewrites shards + autosave deleteDraft
  }
}

test("J7 save vs apply: KVS save survives reload + Apply modal matches staged edits", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await assertLoggedIn(page);
  let frame = await enter(page);
  await openPlanGantt(page, frame);

  // Start from a CLEAN baseline (a prior run may have left a draft).
  await fullRestore(page, frame);
  expect(await isStaged(frame), "baseline is clean before the journey").toBeFalsy();

  // Stage a leaf edit: drag a LEAF bar right (later). Capture its key first.
  const leaf = frame.locator('[data-testid="gantt-bar"][data-parent="false"]').first();
  const draggedKey = await leaf.getAttribute("data-key");
  const box = await leaf.boundingBox();
  if (!box || !draggedKey) throw new Error("no leaf bar");
  await dragBar(page, box, 120);
  await page.waitForTimeout(4000); // cascade + debounced autosave
  const nStaged = await applyCount(frame);
  console.log("DRAGGED_LEAF:", draggedKey, " APPLY_COUNT_AFTER_DRAG:", nStaged);
  expect(nStaged, "drag stages >=1 pending change").toBeGreaterThanOrEqual(1);

  // SAVE (KVS). Must NOT change the pending-vs-Jira Apply count (Save != Jira write).
  await frame.locator("button").filter({ hasText: /^Save \(/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const savedToast = /Saved \d+ issue/i.test(await bodyText(frame));
  const nAfterSave = await applyCount(frame);
  console.log("SAVED_TOAST:", savedToast, " APPLY_COUNT_AFTER_SAVE:", nAfterSave);
  await page.screenshot({ path: `${SHOT}/j7-after-save.png` });
  expect(nAfterSave, "Save must not change the pending-vs-Jira count").toBe(nStaged);

  // RELOAD the whole surface. The edit must SURVIVE (persisted to KVS) and still be
  // PENDING vs Jira (Apply count unchanged — not absorbed into the baseline).
  frame = await enter(page);
  await openPlanGantt(page, frame);
  const nAfterReload = await applyCount(frame);
  console.log("APPLY_COUNT_AFTER_RELOAD (should equal", nStaged, "):", nAfterReload);
  await page.screenshot({ path: `${SHOT}/j7-after-reload.png` });
  expect(nAfterReload, "Save persisted across reload AND stayed pending vs Jira").toBe(nStaged);

  // Open the Apply REVIEW modal and read its change-list out of the DOM.
  await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await frame.locator('[data-testid="apply-review-modal"]').first().waitFor({ state: "visible", timeout: 8000 });
  await page.screenshot({ path: `${SHOT}/j7-review-modal.png` });

  // FrameLocator has no .evaluate — resolve the underlying Frame via the root node.
  const rootHandle = await frame.locator(":root").elementHandle();
  const realFrame = await rootHandle!.ownerFrame();
  const data = await realFrame!.evaluate(() => {
    const modal = document.querySelector('[data-testid="apply-review-modal"]');
    if (!modal) return { modalFound: false } as any;
    const subEl = modal.querySelector('[data-testid="apply-review-subtitle"]');
    const subM = subEl ? (subEl.textContent || "").match(/(\d+)\s+changes?\s+will be written/i) : null;
    const applyBtn = Array.from(modal.querySelectorAll("button")).find((b) => /Apply\s+\d+\s+Change/i.test(b.textContent || ""));
    const applyM = applyBtn ? (applyBtn.textContent || "").match(/Apply\s+(\d+)\s+Change/i) : null;
    const rowHasRealDiff = (row: Element) => {
      const tags = Array.from(row.querySelectorAll("span")).filter((sp) => /^(Start|Due|Dur|Buffer):/.test((sp.textContent || "").trim()));
      for (const tag of tags) {
        const txt = (tag.textContent || "").trim();
        const sEl = tag.querySelector("s");
        if (sEl) { // Start/Due: old in <s>, new is the trailing text
          const oldV = (sEl.textContent || "").trim();
          const newV = txt.replace(/^(Start|Due):/, "").split(oldV).join("").trim();
          if (oldV && newV && oldV !== newV) return true;
        } else { // Dur/Buffer: "Dur: 5 -> 7d"
          const parts = txt.replace(/^(Dur|Buffer):/, "").split("→");
          if (parts.length === 2 && parts[0].trim() !== parts[1].replace(/d$/, "").trim()) return true;
        }
      }
      return false;
    };
    const rowEls = Array.from(modal.querySelectorAll('[data-testid="apply-change-row"]'));
    const dateRows = rowEls.map((r) => ({
      key: r.getAttribute("data-issue-key"),
      realDiff: rowHasRealDiff(r),
      text: (r.textContent || "").trim().slice(0, 130),
    }));
    // detect any non-date sections (a pure date drag should produce none)
    const otherSections = Array.from(modal.querySelectorAll("span"))
      .map((sp) => (sp.textContent || "").trim())
      .filter((t) => /^(New Dependencies|Removed Dependencies|Rank Changes)$/.test(t));
    return { modalFound: true, subtitleCount: subM ? +subM[1] : null, applyBtnCount: applyM ? +applyM[1] : null, dateRows, otherSections } as any;
  });
  console.log("MODAL:", JSON.stringify(data, null, 0));

  // Adversarial assertions ---------------------------------------------------
  expect(data.modalFound, "review modal rendered").toBeTruthy();
  expect(data.subtitleCount, "subtitle count == apply-button count").toBe(data.applyBtnCount);
  expect(data.otherSections, "a pure date drag stages only date changes").toEqual([]);
  expect(data.dateRows.length, "every claimed change is a rendered date row").toBe(data.subtitleCount);
  const phantom = data.dateRows.filter((r: any) => !r.realDiff);
  console.log("PHANTOM_ROWS (must be empty):", JSON.stringify(phantom));
  expect(phantom.length, "no phantom rows (each row shows a real old!=new diff)").toBe(0);
  const keys = data.dateRows.map((r: any) => r.key);
  console.log("MODAL_KEYS:", JSON.stringify(keys));
  expect(keys, "the dragged leaf is in the change-list").toContain(draggedKey);

  // CANCEL — never Apply. Cancel keeps the staged changes.
  await frame.getByRole("button", { name: /^Cancel$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const modalGone = (await frame.locator('[data-testid="apply-review-modal"]').count()) === 0;
  const stillStaged = await isStaged(frame);
  console.log("MODAL_CLOSED_ON_CANCEL:", modalGone, " STILL_STAGED_AFTER_CANCEL:", stillStaged);
  expect(modalGone, "Cancel closes the modal").toBeTruthy();
  expect(stillStaged, "Cancel keeps the staged edits (does not discard)").toBeTruthy();

  // CLEANUP — discard everything. NEVER Apply.
  await fullRestore(page, frame);
  const cleanEnd = await isStaged(frame);
  console.log("STAGED_AFTER_CLEANUP (should be FALSE):", cleanEnd);
  expect(cleanEnd, "cleanup left the plan clean").toBeFalsy();
});

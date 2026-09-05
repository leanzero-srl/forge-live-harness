// A5 (ledger #53) on the page: a steward opens the review-date control on the ribbon, picks a
// day in the custom date picker (no native input), saves, and the chip re-renders with the new
// date while the record carries it. Also the fix for the clipping every ribbon popover had: the
// open dialog must sit ENTIRELY inside the banner iframe's visible box — a DOM-visible-but-clipped
// dialog was exactly what the DOM-level assertions could not see.
// @covers resolver:set-review-due
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
import { mkdirSync } from "node:fs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DEV = "17516615";
const OUT = "/tmp/sv-review-due";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const DAY = 24 * 3600 * 1000;
// The picker offers LOCAL calendar days (data-date is a local Y-M-D); the app stores the picked
// day as a UTC end-of-day instant and renders it in UTC, so the stored ISO's date part and the
// chip's day are the picked Y-M-D itself — compare strings, never re-zoned Dates.
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

test.describe.configure({ timeout: 240_000, retries: 1 });

test("steward moves the review date from the ribbon; the dialog is fully visible inside the banner", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const spaceId = await spaceIdByKey(SPACE);
  const p = await createPage({ spaceId, title: `HARNESS sv-review-due-ui ${Date.now()}`, adf: doc(heading("Clock", 2), paragraph("review date on the ribbon")) });
  try {
    await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: MIHAI });
    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: MIHAI });
    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, approvedVersion: "1", actor: MIHAI });
    expect((await getKvs(`workflow-state-${p.id}`))?.reviewDueAt, "the Approved page carries a review clock").toBeTruthy();

    await page.goto(`https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=${p.id}`, { waitUntil: "domcontentloaded" });
    const ifr = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');
    let ribbon: any = null, ribbonEl: any = null;
    for (let t = 0; t < 30 && !ribbon; t++) {
      const n = await ifr.count();
      for (let i = 0; i < n; i++) {
        const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
        if (!src.includes(DEV)) continue;
        const cf = ifr.nth(i).contentFrame();
        if ((await cf.locator('[data-testid="wf-review-due"]').count().catch(() => 0)) > 0) { ribbon = cf; ribbonEl = ifr.nth(i); break; }
      }
      if (!ribbon) await page.waitForTimeout(1500);
    }
    expect(ribbon, "the ribbon renders the review-due control for a steward").toBeTruthy();

    const control = ribbon.locator('[data-testid="wf-review-due"]');
    const before = ((await control.innerText()) as string).replace(/\s+/g, " ").trim();
    console.log("### review-due before:", JSON.stringify(before));
    expect(before, "the indicator reads as a review date").toMatch(/Review (due|overdue)/i);
    await control.click();
    const dialog = ribbon.locator('[data-testid="wf-review-due-dialog"]');
    await expect(dialog, "the review-date dialog opens").toBeVisible({ timeout: 8000 });

    // THE CLIPPING GUARD: the dialog's box (page coordinates) must lie inside the iframe's box.
    // The host resizes the iframe a beat after the in-flow dialog mounts — poll the frame box.
    let frameBox: any = null, dialogBox: any = null;
    for (let i = 0; i < 12; i++) {
      frameBox = await ribbonEl.boundingBox(); dialogBox = await dialog.boundingBox();
      if (frameBox && dialogBox && dialogBox.y + dialogBox.height <= frameBox.y + frameBox.height + 2) break;
      await page.waitForTimeout(1000);
    }
    expect(frameBox && dialogBox, "both boxes measurable").toBeTruthy();
    console.log(`### iframe bottom=${Math.round(frameBox!.y + frameBox!.height)} dialog bottom=${Math.round(dialogBox!.y + dialogBox!.height)}`);
    expect(dialogBox!.y + dialogBox!.height, "the dialog is NOT clipped by the banner iframe (its bottom is inside the frame)").toBeLessThanOrEqual(frameBox!.y + frameBox!.height + 2);
    await page.screenshot({ path: `${OUT}/1-dialog-open.png` });

    // Pick a day two weeks out in the custom picker (no native date input anywhere in the frame).
    expect(await ribbon.locator('input[type="date"]').count(), "no native date input").toBe(0);
    const target = new Date(Date.now() + 14 * DAY);
    const picker = dialog.locator('[data-testid="sv-datepicker"]');
    await expect(picker, "the custom date picker renders").toBeVisible();
    // The picker opens on the month of the CURRENT due date (150 days out on a fresh approval),
    // so the target month is usually BEHIND the one shown — step in whichever direction the grid
    // needs (the enabled day must be in the visible month, not a greyed neighbour-month cell).
    const dayIn = () => dialog.locator(`[data-testid="sv-datepicker-day"][data-date="${ymd(target)}"]:not([disabled]):not([aria-disabled="true"])`);
    let day = dayIn();
    for (let i = 0; i < 8 && (await day.count()) === 0; i++) {
      const shown = ((await picker.innerText().catch(() => "")) as string);
      const shownMonth = new Date(`${shown.match(/([A-Z][a-z]+ \d{4})/)?.[1] || ""} 1`);
      const dir = Number.isFinite(shownMonth.getTime()) && shownMonth.getTime() > target.getTime() ? /previous month/i : /next month/i;
      await dialog.getByRole("button", { name: dir }).click().catch(() => {});
      await page.waitForTimeout(300);
      day = dayIn();
    }
    await expect(day, `the day ${ymd(target)} is offered`).toBeVisible();
    await day.click();
    await dialog.locator('[data-testid="wf-review-due-save"]').click();
    await expect(dialog, "the dialog closes on save").toBeHidden({ timeout: 10_000 });

    // The record moved, and the chip says so.
    let rec: any = null;
    for (let i = 0; i < 10; i++) { rec = await getKvs(`workflow-state-${p.id}`); if (rec?.reviewDueAt && String(rec.reviewDueAt).slice(0, 10) === ymd(target)) break; await page.waitForTimeout(1500); }
    expect(rec?.reviewDueAt && String(rec.reviewDueAt).slice(0, 10), "the record carries the picked date").toBe(ymd(target));
    expect(String(rec?.reviewDueAt), "…anchored to the END of that day in UTC").toBe(`${ymd(target)}T23:59:59.999Z`);
    let after = "";
    for (let i = 0; i < 10; i++) {
      after = ((await ribbon.locator('[data-testid="wf-review-due"]').innerText().catch(() => "")) as string).replace(/\s+/g, " ").trim();
      if (after && after !== before) break;
      await page.waitForTimeout(1500);
    }
    console.log("### review-due after:", JSON.stringify(after));
    expect(after, "the chip re-rendered with the new date").not.toBe(before);
    const monthName = target.toLocaleDateString("en-US", { month: "short" });
    expect(after, `…naming ${monthName} ${target.getDate()}`).toMatch(new RegExp(`${monthName}\\s+${target.getDate()}\\b`));
    await page.screenshot({ path: `${OUT}/2-after-save.png` });
    console.log("### review date set from the ribbon ✓");
  } finally {
    for (const k of [`workflow-state-${p.id}`, `workflow-pending-${p.id}`, `workflow-autoassigned-${p.id}`,
      `workflow-idx-${SPACE}-draft-${p.id}`, `workflow-idx-${SPACE}-in_review-${p.id}`, `workflow-idx-${SPACE}-approved-${p.id}`]) await delKvs(k).catch(() => {});
    for (const prefix of [`workflow-log-${p.id}-`, `activity-page-${p.id}-`]) for (const k of await queryKvs(prefix).catch(() => [] as string[])) await delKvs(k).catch(() => {});
    await deletePage(p.id).catch(() => {});
  }
});

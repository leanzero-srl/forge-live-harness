// A5 (ledger #53) — a review clock on any state, and a steward-editable review date on the page.
//   - set-review-due: a steward moves the date (record + by-state index row, which the dashboard's
//     overdue count reads); a past date is refused; a non-steward is refused; null clears it.
//   - the sweep expires ANY overdue state that has a transition to Expired, and for a state
//     without one records the overdue once (a marker) rather than commenting hourly.
// Hook-driven; WFH steward roster captured + restored; throwaway pages.
// @covers resolver:set-review-due
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_SPACE_KEY || "WFH";
const STEWARD_KEY = `admin-settings-space-${SPACE}`;
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55"; // can read/edit WFH; not on the steward list
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const DAY = 24 * 3600 * 1000;

test.describe.configure({ timeout: 240_000, retries: 1 });

async function cleanup(pageId: string) {
  for (const k of [`workflow-state-${pageId}`, `workflow-pending-${pageId}`, `workflow-autoassigned-${pageId}`, `workflow-review-notified-${pageId}`, `workflow-integrity-notified-${pageId}`,
    `workflow-idx-${SPACE}-draft-${pageId}`, `workflow-idx-${SPACE}-in_review-${pageId}`, `workflow-idx-${SPACE}-approved-${pageId}`, `workflow-idx-${SPACE}-expired-${pageId}`]) await delKvs(k).catch(() => {});
  for (const prefix of [`workflow-log-${pageId}-`, `activity-page-${pageId}-`]) for (const k of await queryKvs(prefix).catch(() => [] as string[])) await delKvs(k).catch(() => {});
  await deletePage(pageId).catch(() => {});
}

test.describe("A5 review clocks", () => {
  let priorSteward: any = null;
  test.beforeAll(async () => {
    priorSteward = await getKvs(STEWARD_KEY);
    const users = [...new Set([...(priorSteward?.adminUsers || []).map((u: any) => (typeof u === "string" ? u : u?.accountId)), MIHAI])];
    await setKvs(STEWARD_KEY, { ...(priorSteward || {}), adminUsers: users });
  });
  test.afterAll(async () => {
    if (priorSteward) await setKvs(STEWARD_KEY, priorSteward); else await delKvs(STEWARD_KEY).catch(() => {});
  });

  test("a steward sets, moves and clears the review date; the past and non-stewards are refused", async () => {
    const spaceId = await spaceIdByKey(SPACE);
    const p = await createPage({ spaceId, title: `HARNESS sv-review-due ${Date.now()}`, adf: doc(heading("Clock", 2), paragraph("review date seed")) });
    try {
      await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: MIHAI });
      await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: MIHAI });
      await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, approvedVersion: "1", actor: MIHAI });
      const before = await getKvs(`workflow-state-${p.id}`);
      expect(before?.stateId).toBe("approved");
      expect(before?.reviewDueAt, "Approved carries the default 150-day clock").toBeTruthy();

      const inTen = new Date(Date.now() + 10 * DAY).toISOString();
      const set = await inv("setReviewDue", { pageId: p.id, reviewDueAt: inTen, actor: MIHAI });
      expect(set.result?.success, `steward sets the date (got ${JSON.stringify(set.result)})`).toBe(true);
      const after = await getKvs(`workflow-state-${p.id}`);
      expect(Math.abs(new Date(after.reviewDueAt).getTime() - new Date(inTen).getTime()), "the record carries the new date").toBeLessThan(2000);
      const idx = await getKvs(`workflow-idx-${SPACE}-approved-${p.id}`);
      expect(idx && Math.abs(new Date(idx.reviewDueAt).getTime() - new Date(inTen).getTime()), "the by-state index row (the dashboard's overdue source) carries it too").toBeLessThan(2000);

      const past = await inv("setReviewDue", { pageId: p.id, reviewDueAt: new Date(Date.now() - DAY).toISOString(), actor: MIHAI });
      expect(past.result?.success, "a past date is refused").toBe(false);
      const stranger = await inv("setReviewDue", { pageId: p.id, reviewDueAt: new Date(Date.now() + 20 * DAY).toISOString(), actor: GABI });
      expect(stranger.result?.success, "a non-steward is refused").toBe(false);
      expect(Math.abs(new Date((await getKvs(`workflow-state-${p.id}`)).reviewDueAt).getTime() - new Date(inTen).getTime()), "…and the date did not move").toBeLessThan(2000);

      const cleared = await inv("setReviewDue", { pageId: p.id, reviewDueAt: "", actor: MIHAI });
      expect(cleared.result?.success, "clearing the clock").toBe(true);
      expect((await getKvs(`workflow-state-${p.id}`)).reviewDueAt ?? null, "…removes the date").toBeNull();

      const log = (await inv("getWorkflowLog", { pageId: p.id })).result?.log || [];
      expect(log.some((e: any) => e.kind === "review-due-set"), "the change is in the workflow log").toBe(true);
      let row: any = null;
      for (let i = 0; i < 8 && !row; i++) {
        row = ((await inv("getPageActivity", { pageId: p.id, actor: MIHAI })).result?.entries || []).find((e: any) => e.type === "workflow.review-due") || null;
        if (!row) await new Promise((r) => setTimeout(r, 2000));
      }
      expect(row, "…and on the activity record").toBeTruthy();
      console.log("### set-review-due ✓ (set, past refused, non-steward refused, cleared, logged)");
    } finally {
      await cleanup(p.id);
    }
  });

  test("the sweep expires an overdue page that has a transition to Expired, and marks one that does not — once", async () => {
    const spaceId = await spaceIdByKey(SPACE);
    const pA = await createPage({ spaceId, title: `HARNESS sv-overdue-approved ${Date.now()}`, adf: doc(heading("A", 2), paragraph("overdue approved")) });
    const pB = await createPage({ spaceId, title: `HARNESS sv-overdue-review ${Date.now()}`, adf: doc(heading("B", 2), paragraph("overdue in review")) });
    try {
      // A: Approved with an overdue clock → the default definition has approved → expired.
      await inv("assignWorkflow", { pageId: pA.id, spaceKey: SPACE, workflowId: "default", actor: MIHAI });
      await inv("transitionWorkflow", { pageId: pA.id, spaceKey: SPACE, to: "in_review", actor: MIHAI });
      await inv("transitionWorkflow", { pageId: pA.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, approvedVersion: "1", actor: MIHAI });
      const recA = await getKvs(`workflow-state-${pA.id}`);
      await setKvs(`workflow-state-${pA.id}`, { ...recA, reviewDueAt: new Date(Date.now() - DAY).toISOString() });
      const idxA = await getKvs(`workflow-idx-${SPACE}-approved-${pA.id}`);
      if (idxA) await setKvs(`workflow-idx-${SPACE}-approved-${pA.id}`, { ...idxA, reviewDueAt: new Date(Date.now() - DAY).toISOString() });
      // B: In Review with an overdue clock → no in_review → expired transition in the default def.
      await inv("assignWorkflow", { pageId: pB.id, spaceKey: SPACE, workflowId: "default", actor: MIHAI });
      await inv("transitionWorkflow", { pageId: pB.id, spaceKey: SPACE, to: "in_review", actor: MIHAI });
      const recB = await getKvs(`workflow-state-${pB.id}`);
      await setKvs(`workflow-state-${pB.id}`, { ...recB, reviewDueAt: new Date(Date.now() - DAY).toISOString() });
      const idxB = await getKvs(`workflow-idx-${SPACE}-in_review-${pB.id}`);
      if (idxB) await setKvs(`workflow-idx-${SPACE}-in_review-${pB.id}`, { ...idxB, reviewDueAt: new Date(Date.now() - DAY).toISOString() });

      // The index is eventually consistent — give the seeded rows a moment, then sweep twice.
      await new Promise((r) => setTimeout(r, 4000));
      const s1 = await inv("workflowSweep");
      expect(s1.result, "the sweep ran").toBeTruthy();
      let a: any = null;
      for (let i = 0; i < 6; i++) { a = await getKvs(`workflow-state-${pA.id}`); if (a?.stateId === "expired") break; await inv("workflowSweep"); await new Promise((r) => setTimeout(r, 2000)); }
      expect(a?.stateId, "the overdue Approved page moved to Expired").toBe("expired");
      const b = await getKvs(`workflow-state-${pB.id}`);
      expect(b?.stateId, "the overdue In Review page stays In Review (no transition to Expired from there)").toBe("in_review");
      const marker = await getKvs(`workflow-review-notified-${pB.id}`);
      expect(marker, "…and was marked as noticed so the hourly sweep does not repeat itself").toBeTruthy();
      const rowsB = (await inv("getPageActivity", { pageId: pB.id, actor: MIHAI })).result?.entries || [];
      const expiredRows = rowsB.filter((e: any) => e.type === "workflow.expired");
      expect(expiredRows.length, "exactly one overdue record for B after two sweeps").toBe(1);
      expect(expiredRows[0].details?.noTransition, "…saying the page could not be moved").toBe(true);
      console.log("### sweep ✓ (Approved → Expired; In Review overdue marked once)");
    } finally {
      await cleanup(pA.id); await cleanup(pB.id);
    }
  });
});

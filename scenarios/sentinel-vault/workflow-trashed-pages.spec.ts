// The workflow index outlives the page. On 2026-09-05 every one of the thirteen pages the WFH
// dashboard listed was in the trash (harness pages deleted by their specs), counted as live work
// and eligible for the hourly sweep's comments. Now the readers ask Confluence where each page IS
// (one batch call per 250 ids): a trashed page is excluded from the dashboard and the approvals
// inbox and skipped by the sweep but KEEPS its record (a restored page keeps its state, as Comala
// does); a purged page (404) has its workflow keys purged by the sweep.
// Hook-driven; WFH steward roster captured + restored; throwaway pages, purged at the end.
// @covers resolver:get-workflow-dashboard resolver:list-my-approvals
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, purgePage, getPageStatus } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_SPACE_KEY || "WFH";
const STEWARD_KEY = `admin-settings-space-${SPACE}`;
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const REQUESTER = "sv-aql-trash-req"; // synthetic: the engine seams never touch content for the requester
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 300_000, retries: 1 });

async function cleanup(pageId: string) {
  for (const k of [`workflow-state-${pageId}`, `workflow-pending-${pageId}`, `workflow-autoassigned-${pageId}`, `workflow-review-notified-${pageId}`, `workflow-integrity-notified-${pageId}`,
    `workflow-inbox-${MIHAI}-${pageId}`, `workflow-approval-${pageId}-approved-approval-${MIHAI}`,
    `workflow-idx-${SPACE}-draft-${pageId}`, `workflow-idx-${SPACE}-in_review-${pageId}`, `workflow-idx-${SPACE}-approved-${pageId}`]) await delKvs(k).catch(() => {});
  for (const prefix of [`workflow-log-${pageId}-`, `workflow-approval-${pageId}-`, `activity-page-${pageId}-`]) for (const k of await queryKvs(prefix).catch(() => [] as string[])) await delKvs(k).catch(() => {});
  await deletePage(pageId).catch(() => {});
  await purgePage(pageId).catch(() => {});
}

const dashboard = async () => (await inv("dashboard", { spaceKey: SPACE, actor: MIHAI })).result;
const listed = (d: any, id: string) => Array.isArray(d?.pages) && d.pages.some((p: any) => String(p.pageId) === String(id));

test.describe("trashed and purged pages leave the workflow readers", () => {
  let priorSteward: any = null;
  test.beforeAll(async () => {
    priorSteward = await getKvs(STEWARD_KEY);
    const users = [...new Set([...(priorSteward?.adminUsers || []).map((u: any) => (typeof u === "string" ? u : u?.accountId)), MIHAI])];
    await setKvs(STEWARD_KEY, { ...(priorSteward || {}), adminUsers: users });
  });
  test.afterAll(async () => {
    if (priorSteward) await setKvs(STEWARD_KEY, priorSteward); else await delKvs(STEWARD_KEY).catch(() => {});
  });

  test("a trashed page drops off the dashboard and the inbox but keeps its record; a purged page loses its keys in the sweep", async () => {
    const spaceId = await spaceIdByKey(SPACE);
    const pA = await createPage({ spaceId, title: `HARNESS sv-trash-A ${Date.now()}`, adf: doc(heading("A", 2), paragraph("to be trashed, kept")) });
    const pB = await createPage({ spaceId, title: `HARNESS sv-trash-B ${Date.now()}`, adf: doc(heading("B", 2), paragraph("to be purged")) });
    try {
      // A: In Review with an approval pending on Mihai (so it sits in the inbox). B: Draft.
      await inv("assignWorkflow", { pageId: pA.id, spaceKey: SPACE, workflowId: "default", actor: REQUESTER });
      await inv("transitionWorkflow", { pageId: pA.id, spaceKey: SPACE, to: "in_review", actor: REQUESTER });
      const ra = await inv("requestApproval", { pageId: pA.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, mode: "any", actor: REQUESTER });
      expect(ra.result?.pending, `approval requested on A (got ${JSON.stringify(ra.result)})`).toBe(true);
      await inv("assignWorkflow", { pageId: pB.id, spaceKey: SPACE, workflowId: "default", actor: REQUESTER });

      // The index is eventually consistent — poll until both rows show up on the dashboard.
      let before: any = null;
      for (let i = 0; i < 10; i++) { before = await dashboard(); if (listed(before, pA.id) && listed(before, pB.id)) break; await new Promise((r) => setTimeout(r, 2000)); }
      expect(listed(before, pA.id) && listed(before, pB.id), `both live pages are on the dashboard (got ${JSON.stringify(before?.pages?.map((p: any) => p.pageId))})`).toBe(true);
      const inboxBefore = (await inv("listMyApprovals", { actor: MIHAI })).result?.approvals || [];
      expect(inboxBefore.some((r: any) => String(r.pageId) === String(pA.id)), "A's approval is in Mihai's inbox").toBe(true);
      const totalBefore = before.total;

      // Trash both.
      await deletePage(pA.id); await deletePage(pB.id);
      expect(await getPageStatus(pA.id), "A is in the trash (still answers a GET)").toBe("trashed");
      const after = await dashboard();
      expect(listed(after, pA.id) || listed(after, pB.id), "neither trashed page is listed").toBe(false);
      expect(after.total, "…and they left the count").toBe(totalBefore - 2);
      expect(after.inTrash, "…and the dashboard says how many are in the trash").toBeGreaterThanOrEqual(2);
      const inboxAfter = (await inv("listMyApprovals", { actor: MIHAI })).result?.approvals || [];
      expect(inboxAfter.some((r: any) => String(r.pageId) === String(pA.id)), "A's approval is no longer in the inbox").toBe(false);
      console.log(`### trashed: dashboard ${totalBefore} → ${after.total} (inTrash=${after.inTrash}), inbox row gone ✓`);

      // The sweep leaves a trashed page's record alone (a restore keeps its state).
      const s1 = (await inv("workflowSweep")).result;
      expect(s1?.skippedTrashed, `the sweep skipped the trashed pages (got ${JSON.stringify(s1)})`).toBeGreaterThanOrEqual(2);
      expect((await getKvs(`workflow-state-${pA.id}`))?.stateId, "A's record survives the trash").toBe("in_review");
      expect((await getKvs(`workflow-state-${pB.id}`))?.stateId, "B's record survives the trash").toBe("draft");

      // Purge B → Confluence 404s → the sweep purges its workflow keys. A stays.
      await purgePage(pB.id);
      expect(await getPageStatus(pB.id), "B is gone").toBe("deleted");
      let s2: any = null;
      for (let i = 0; i < 4; i++) { s2 = (await inv("workflowSweep")).result; if (!(await getKvs(`workflow-state-${pB.id}`))) break; await new Promise((r) => setTimeout(r, 2000)); }
      expect(s2?.purgedPages, `the sweep purged a page (got ${JSON.stringify(s2)})`).toBeGreaterThanOrEqual(1);
      expect(await getKvs(`workflow-state-${pB.id}`), "B's record is gone").toBeFalsy();
      expect(await getKvs(`workflow-idx-${SPACE}-draft-${pB.id}`), "B's index row is gone").toBeFalsy();
      expect((await getKvs(`workflow-state-${pA.id}`))?.stateId, "A (trashed, not purged) still has its record").toBe("in_review");
      console.log("### purged: B's workflow keys swept, A's kept ✓");
    } finally {
      await cleanup(pA.id); await cleanup(pB.id);
    }
  });
});

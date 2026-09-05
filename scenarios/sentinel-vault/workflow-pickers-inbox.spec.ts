// Coverage gap (2026-09-05) — the WorkflowInbox above the realm-console tabs (list-my-approvals)
// and the two approver pickers on the Workflow tab (search-workflow-users / -groups, asApp CQL).
// Seeded the way ribbon-approval-dialog.spec.ts does: throwaway page → assign → In Review →
// requestApproval with Mihai as the sole approver, then the inbox is read as Mihai (must contain
// the page with its title and target state) and as Gabriela (must not — self-scoped).
// list-my-approvals scans `workflow-approval-*` via kvs.query (eventually consistent) → polled.
// Self-cleaning: workflow keys + throwaway page deleted (log rows best-effort via what=query).
// @covers resolver:list-my-approvals resolver:search-workflow-users resolver:search-workflow-groups
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const REQUESTER = "sv-aql-inbox"; // synthetic: the engine seams never touch content

const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 180_000, retries: 1 });

test("list-my-approvals shows the seeded pending approval to its approver only", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const title = `HARNESS sv-inbox ${Date.now()}`;
  const p = await createPage({ spaceId, title, adf: doc(heading("Inbox", 2), paragraph("approval inbox seed")) });
  try {
    const asg = await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: REQUESTER });
    expect(asg.result, "workflow assigned").toBeTruthy();
    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: REQUESTER });
    expect((await getKvs(`workflow-state-${p.id}`))?.stateId).toBe("in_review");
    const ra = await inv("requestApproval", { pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, mode: "any", actor: REQUESTER });
    expect(ra.result?.pending, `approval requested (got: ${JSON.stringify(ra.result)})`).toBe(true);
    const pending = await getKvs(`workflow-pending-${p.id}`);
    expect(pending?.approvers?.includes(MIHAI), "pending approval seeded with Mihai as approver").toBeTruthy();
    expect((await getKvs(`workflow-approval-${p.id}-approved-approval-${MIHAI}`))?.status, "the per-approver record is pending").toBe("pending");
    // 2026-09-05: the inbox reads a per-approver INDEX, not a site-wide scan of every approval
    // record (that scan was capped at 1,500 and this site's orphans pushed a fresh approval past
    // it — the inbox rendered nothing while the banner still showed the request).
    expect(await getKvs(`workflow-inbox-${MIHAI}-${p.id}`), "the approver's inbox index row is written with the approval").toBeTruthy();

    let row: any = null;
    for (let i = 0; i < 12 && !row; i++) {
      const r = await inv("listMyApprovals", { actor: MIHAI });
      row = (r.result?.approvals || []).find((a: any) => String(a.pageId) === String(p.id)) || null;
      if (!row) await new Promise((res) => setTimeout(res, 2000));
    }
    expect(row, "the approver's inbox lists the page").toBeTruthy();
    expect(row.pageTitle, "…with its real title (asApp page read, not the fallback)").toBe(title);
    expect(row.toStateName, "…and the target state").toBe("Approved");
    expect(row.mode).toBe("any");
    expect(row.requestedAt, "…and when it was asked for").toBeTruthy();

    const other = await inv("listMyApprovals", { actor: GABI });
    expect((other.result?.approvals || []).some((a: any) => String(a.pageId) === String(p.id)), "the inbox is self-scoped — a non-approver does not see it").toBe(false);
    console.log(`### list-my-approvals ✓ ("${title}" → Approved, any; hidden from a non-approver)`);

    // Deciding clears the request AND its index row (strong per-key deletes), so the inbox
    // can never re-list a resolved approval and the index cannot grow without bound.
    const dec = await inv("decideApproval", { pageId: p.id, approver: MIHAI, decision: "denied", actor: MIHAI });
    expect(dec.result?.outcome, `deny resolves the request (got ${JSON.stringify(dec.result)})`).toBe("denied");
    expect(await getKvs(`workflow-inbox-${MIHAI}-${p.id}`), "the inbox index row is gone with the decision").toBeFalsy();
    expect(await getKvs(`workflow-approval-${p.id}-approved-approval-${MIHAI}`), "…and so is the approval record").toBeFalsy();
    const after = await inv("listMyApprovals", { actor: MIHAI });
    expect((after.result?.approvals || []).some((a: any) => String(a.pageId) === String(p.id)), "the decided request is no longer in the inbox").toBe(false);
    console.log("### inbox index cleared on decision ✓");
  } finally {
    for (const k of [
      `workflow-state-${p.id}`, `workflow-pending-${p.id}`, `workflow-autoassigned-${p.id}`,
      `workflow-approval-${p.id}-approved-approval-${MIHAI}`, `workflow-inbox-${MIHAI}-${p.id}`,
      `workflow-idx-${SPACE}-draft-${p.id}`, `workflow-idx-${SPACE}-in_review-${p.id}`, `workflow-idx-${SPACE}-approved-${p.id}`,
    ]) await delKvs(k).catch(() => {});
    for (const prefix of [`workflow-log-${p.id}-`, `workflow-approval-${p.id}-`]) {
      const keys = await queryKvs(prefix).catch(() => [] as string[]);
      for (const k of keys) await delKvs(k).catch(() => {});
    }
    await deletePage(p.id).catch(() => {});
  }
});

test("approver pickers: user search finds Mihai by name; group search finds a group", async () => {
  const u = await inv("searchWorkflowUsers", { q: "Mihai", actor: MIHAI });
  const users: any[] = u.result?.users || [];
  expect(users.some((x) => x.accountId === MIHAI), `user search for "Mihai" returns his accountId (got ${JSON.stringify(users)})`).toBe(true);
  expect(users.every((x) => x.accountId && x.name), "every row carries accountId + display name").toBe(true);
  const short = await inv("searchWorkflowUsers", { q: "M", actor: MIHAI });
  expect(short.result?.users, "a 1-char query is not searched (min 2)").toEqual([]);

  const g = await inv("searchWorkflowGroups", { q: "confluence", actor: MIHAI });
  const groups: any[] = g.result?.groups || [];
  expect(groups.length, `group search for "confluence" returns at least one group (got ${JSON.stringify(groups)})`).toBeGreaterThanOrEqual(1);
  expect(groups.every((x) => x.id && x.name), "every group row carries id + name").toBe(true);
  expect(groups.some((x) => /confluence/i.test(x.name)), "…and the match is on the name").toBe(true);
  const empty = await inv("searchWorkflowGroups", { q: "", actor: MIHAI });
  expect(empty.result?.groups, "an empty query returns nothing").toEqual([]);
  console.log(`### pickers ✓ (users: ${users.map((x) => x.name).join(", ")}; groups: ${groups.map((x) => x.name).join(", ")})`);
});

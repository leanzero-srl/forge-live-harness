// SEEDER for the JIRA PLANS import bed on wolfaenpak (Jira Premium since 2026-09-03).
//
// The importer reads Jira's own Plans (ex Advanced Roadmaps). Until the site was
// upgraded there were NO plans to read, so the import could only be live-tested
// through the synthetic `importFixture` hook. This seeder creates three real Jira
// plans that between them cover every branch the import pipeline has:
//
//   #1 "LZ Import Test — Projects"      two Project sources, site-default date fields,
//                                       no exclusion rules  → the plain path.
//   #2 "LZ Import Test — Target dates"  Board + Filter + Project sources, TargetStart/
//                                       TargetEnd scheduling (→ meta.fieldOverrides
//                                       customfield_10022/10023), Concurrent dependencies,
//                                       exclusion rules (issue type + status + 14-day
//                                       completed rule) → the interesting path.
//   #3 "LZ Import Test — Dead board"    a Board source whose board was DELETED after the
//                                       plan was created (real plans reference dead
//                                       boards) + a Project source → the skip-with-a-note path.
//
// Idempotent: plans are matched by NAME, so re-running does not duplicate them.
// Jira plans are never modified by the app, so this bed is stable across runs.
// Guarded: only runs with SEED=1.
//
//   SEED=1 npx playwright test --project=chromium scenarios/lz-ppm/_seed-jira-plans.spec.ts
import { test, expect } from "../../fixtures/forge";
import { assertLoggedIn } from "../../forge/browser";
import { BASE_URL } from "../../config/env";

test.describe.configure({ retries: 0, timeout: 300_000 });

// wolfaenpak ids (stable — see the leanzero-management skill).
export const JIRA_PLAN_BED = {
  projects: { WFH: 10001, TPP: 10007, LZPT: 10153 },
  boards: { LZPT: 187 },
  filters: { TPP_BOARD: 10012 },
  fields: { startDate: 10015, targetStart: "customfield_10022", targetEnd: "customfield_10023" },
  issueTypes: { subtask: 10016 },
  statuses: { rejected: 10009 },
  names: {
    projects: "LZ Import Test — Projects",
    target: "LZ Import Test — Target dates",
    deadBoard: "LZ Import Test — Dead board",
  },
};

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

async function listPlans(page: any): Promise<any[]> {
  const out: any[] = [];
  let cursor = "";
  for (let i = 0; i < 20; i++) {
    const r = await api(page, "GET", `/rest/api/3/plans/plan?maxResults=50${cursor ? `&cursor=${cursor}` : ""}`);
    if (!r.ok) throw new Error(`plans list failed ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);
    out.push(...(r.data?.values || []));
    if (r.data?.isLast !== false) break;
    cursor = r.data?.nextPageCursor || "";
    if (!cursor) break;
  }
  return out;
}

test("seed: the three Jira plans the importer is tested against", async ({ page }) => {
  test.skip(process.env.SEED !== "1", "guarded — run with SEED=1");
  await assertLoggedIn(page);
  await page.goto(`${BASE_URL}/jira/your-work`, { waitUntil: "domcontentloaded" });

  const before = await listPlans(page);
  const byName = new Map(before.map((p) => [p.name, p]));
  console.log("EXISTING PLANS", before.map((p) => `${p.id}:${p.name}`).join(", ") || "(none)");

  const B = JIRA_PLAN_BED;
  const create = async (body: any) => {
    const r = await api(page, "POST", "/rest/api/3/plans/plan", body);
    if (!r.ok) throw new Error(`create plan "${body.name}" failed ${r.status}: ${JSON.stringify(r.data).slice(0, 400)}`);
    return String(r.data);
  };

  // --- #1 plain: two projects, site-default fields, no exclusions -------------
  if (!byName.has(B.names.projects)) {
    const id = await create({
      name: B.names.projects,
      scheduling: {
        estimation: "Days",
        startDate: { type: "DateCustomField", dateCustomFieldId: B.fields.startDate },
        endDate: { type: "DueDate" },
        inferredEpicDates: true, inferredSprintDates: true, dependencies: "Sequential",
      },
      issueSources: [
        { type: "Project", value: B.projects.WFH },
        { type: "Project", value: B.projects.TPP },
      ],
    });
    console.log("CREATED projects plan", id);
  }

  // --- #2 the interesting one: target dates, 3 source kinds, exclusions -------
  if (!byName.has(B.names.target)) {
    const id = await create({
      name: B.names.target,
      scheduling: {
        estimation: "Hours",
        startDate: { type: "TargetStartDate" },
        endDate: { type: "TargetEndDate" },
        inferredEpicDates: false, inferredSprintDates: false, dependencies: "Concurrent",
      },
      issueSources: [
        { type: "Board", value: B.boards.LZPT },
        { type: "Filter", value: B.filters.TPP_BOARD },
        { type: "Project", value: B.projects.TPP },
      ],
      exclusionRules: {
        numberOfDaysToShowCompletedIssues: 14,
        issueTypeIds: [B.issueTypes.subtask],
        workStatusIds: [B.statuses.rejected],
        workStatusCategoryIds: [], issueIds: [], releaseIds: [],
      },
    });
    console.log("CREATED target-dates plan", id);
  }

  // --- #3 dead board: create a throwaway board, plan on it, delete the board --
  if (!byName.has(B.names.deadBoard)) {
    const board = await api(page, "POST", "/rest/agile/1.0/board", {
      name: `LZ Throwaway Board ${Date.now().toString(36)}`, type: "kanban", filterId: B.filters.TPP_BOARD,
    });
    if (!board.ok) throw new Error(`board create failed ${board.status}: ${JSON.stringify(board.data).slice(0, 300)}`);
    const boardId = board.data.id;
    const id = await create({
      name: B.names.deadBoard,
      scheduling: {
        estimation: "Days",
        startDate: { type: "DateCustomField", dateCustomFieldId: B.fields.startDate },
        endDate: { type: "DueDate" },
        inferredEpicDates: true, inferredSprintDates: true, dependencies: "Sequential",
      },
      issueSources: [
        { type: "Board", value: boardId },
        { type: "Project", value: B.projects.WFH },
      ],
      exclusionRules: {
        numberOfDaysToShowCompletedIssues: 30,
        issueTypeIds: [], workStatusIds: [], workStatusCategoryIds: [], issueIds: [], releaseIds: [],
      },
    });
    const del = await api(page, "DELETE", `/rest/agile/1.0/board/${boardId}`);
    console.log("CREATED dead-board plan", id, "board", boardId, "deleted", del.status);
    expect(del.status, "the board must actually be gone for this bed to mean anything").toBe(204);
  }

  const after = await listPlans(page);
  const names = after.map((p) => p.name);
  console.log("PLANS AFTER", after.map((p) => `${p.id}:${p.name}`).join(", "));
  expect(names).toContain(B.names.projects);
  expect(names).toContain(B.names.target);
  expect(names).toContain(B.names.deadBoard);
});

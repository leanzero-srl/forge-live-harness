// SEEDER for the dedicated LZ PPM test project (LZPT) in wolfaenpak. Wipes and
// recreates a DETERMINISTIC scenario set that exercises the PPM app end to end:
// multi-level hierarchy + rollup, linear/diamond/fan-out/cycle/cross-epic
// dependencies, and date edge cases. Issues are found by their stable SUMMARY
// prefixes (keys float across reseeds). Guarded: only runs with SEED=1.
//
//   SEED=1 npx playwright test --project=chromium scenarios/lz-ppm/_seed-lzpt.spec.ts
import { test } from "../../fixtures/forge";
import { assertLoggedIn } from "../../forge/browser";
import { BASE_URL } from "../../config/env";

test.describe.configure({ retries: 0, timeout: 600_000 });

const KEY = "LZPT";
const T = { Epic: "10133", Subtask: "10134", Task: "10135", Story: "10136" };
const DURATION_FIELD = "customfield_10180"; // PPM Duration on wolfaenpak

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

// Declarative scenario. `blocks` = refs this issue blocks (outward). Dates YYYY-MM-DD.
export interface Def { ref: string; type: keyof typeof T; summary: string; parent?: string; start?: string; due?: string; blocks?: string[]; status?: string; duration?: number }

export function buildDefs(): Def[] {
  const d: Def[] = [];
  // --- Epics ---
  d.push({ ref: "E1", type: "Epic", summary: "E1 · Linear Chain" });
  d.push({ ref: "E2", type: "Epic", summary: "E2 · Diamond" });
  d.push({ ref: "E3", type: "Epic", summary: "E3 · Cross-links & Cycle" });
  d.push({ ref: "E4", type: "Epic", summary: "E4 · Rollup & Subtasks" });
  d.push({ ref: "E5", type: "Epic", summary: "E5 · Edge Dates" });
  d.push({ ref: "E6", type: "Epic", summary: "E6 · Wide Parent" });

  // --- E1 linear chain L1->L2->L3->L4->L5 (also the critical path) ---
  d.push({ ref: "L1", type: "Task", parent: "E1", summary: "CHAIN-1 kickoff", start: "2026-05-04", due: "2026-05-08", blocks: ["L2"], status: "Done" });
  d.push({ ref: "L2", type: "Task", parent: "E1", summary: "CHAIN-2 build", start: "2026-05-11", due: "2026-05-15", blocks: ["L3"], status: "In Progress" });
  d.push({ ref: "L3", type: "Task", parent: "E1", summary: "CHAIN-3 test", start: "2026-05-18", due: "2026-05-22", blocks: ["L4"] });
  d.push({ ref: "L4", type: "Task", parent: "E1", summary: "CHAIN-4 review", start: "2026-05-25", due: "2026-05-29", blocks: ["L5"] });
  d.push({ ref: "L5", type: "Task", parent: "E1", summary: "CHAIN-5 release", start: "2026-06-01", due: "2026-06-05", blocks: ["W01"] });

  // --- E2 diamond DA -> DB1,DB2 -> DC ---
  d.push({ ref: "DA", type: "Task", parent: "E2", summary: "DIAMOND-A source", start: "2026-05-04", due: "2026-05-06", blocks: ["DB1", "DB2"] });
  d.push({ ref: "DB1", type: "Task", parent: "E2", summary: "DIAMOND-B1 left", start: "2026-05-07", due: "2026-05-12", blocks: ["DC"] });
  d.push({ ref: "DB2", type: "Task", parent: "E2", summary: "DIAMOND-B2 right (longer)", start: "2026-05-07", due: "2026-05-14", blocks: ["DC"] });
  d.push({ ref: "DC", type: "Task", parent: "E2", summary: "DIAMOND-C sink", start: "2026-05-15", due: "2026-05-19" });

  // --- E3 cross-epic gate, cycle, fan-out ---
  d.push({ ref: "XA", type: "Task", parent: "E3", summary: "CROSS-A gate", start: "2026-04-27", due: "2026-05-01", blocks: ["L1"] }); // cross-epic E3->E1
  d.push({ ref: "CY1", type: "Task", parent: "E3", summary: "CYCLE-X", start: "2026-05-04", due: "2026-05-06", blocks: ["CY2"] });
  d.push({ ref: "CY2", type: "Task", parent: "E3", summary: "CYCLE-Y", start: "2026-05-07", due: "2026-05-11", blocks: ["CY3"] });
  d.push({ ref: "CY3", type: "Task", parent: "E3", summary: "CYCLE-Z", start: "2026-05-12", due: "2026-05-14", blocks: ["CY1"] }); // cycle back
  d.push({ ref: "FO", type: "Task", parent: "E3", summary: "FANOUT-src", start: "2026-05-04", due: "2026-05-06", blocks: ["FO1", "FO2", "FO3", "FO4"] });
  for (let i = 1; i <= 4; i++) d.push({ ref: `FO${i}`, type: "Task", parent: "E3", summary: `FANOUT-${i}`, start: "2026-05-07", due: `2026-05-1${i}` });

  // --- E4 rollup with subtasks (multi-level) + status mix ---
  d.push({ ref: "S1", type: "Story", parent: "E4", summary: "ROLLUP story-1" });
  d.push({ ref: "ST1", type: "Subtask", parent: "S1", summary: "ROLLUP sub-1a", start: "2026-05-04", due: "2026-05-06", status: "Done" });
  d.push({ ref: "ST2", type: "Subtask", parent: "S1", summary: "ROLLUP sub-1b", start: "2026-05-07", due: "2026-05-11", status: "In Progress" });
  d.push({ ref: "S2", type: "Story", parent: "E4", summary: "ROLLUP story-2" });
  d.push({ ref: "ST3", type: "Subtask", parent: "S2", summary: "ROLLUP sub-2a", start: "2026-05-05", due: "2026-05-08" });
  d.push({ ref: "ST4", type: "Subtask", parent: "S2", summary: "ROLLUP sub-2b", start: "2026-05-11", due: "2026-05-15", status: "Done" });

  // --- E5 date edge cases ---
  d.push({ ref: "ED1", type: "Task", parent: "E5", summary: "EDGE unscheduled (no dates)" });
  // NOTE: this can no longer be a real MILESTONE on LZPT. Since milestones became
  // declared-only, a milestone needs PPM Duration = 0 (or a Milestone issue type),
  // and neither exists here: editmeta confirms customfield_10180 is NOT settable on
  // this project — which is exactly why every LZPT issue indexes with duration
  // null. Jira accepts a PUT for it and silently drops the value, so seeding a 0
  // would put a lie in the contract. It stays a one-day TASK, and the milestone
  // journey asserts that it renders as a labelled bar rather than a diamond — the
  // regression guard for the reported rhombuses. The positive diamond case is
  // covered offline in test/visual, where the fixture is ours.
  // NOTE: a DECLARED milestone (PPM Duration = 0) is impossible on this bed —
  // customfield_10180 is company-managed and LZPT is team-managed, so Jira 400s
  // any attempt to set it ("cannot be set ... not on the appropriate screen").
  // The bed therefore has ZERO declared milestones by construction, and the
  // dashboard-milestone journey asserts the EMPTY-tracker agreement instead.
  d.push({ ref: "ED2", type: "Task", parent: "E5", summary: "EDGE milestone (0-day)", start: "2026-05-15", due: "2026-05-15" });
  d.push({ ref: "ED3", type: "Task", parent: "E5", summary: "EDGE invalid start-after-due", start: "2026-05-20", due: "2026-05-12" });
  d.push({ ref: "ED4", type: "Task", parent: "E5", summary: "EDGE long-run", start: "2026-05-04", due: "2026-06-30" });
  d.push({ ref: "ED5", type: "Task", parent: "E5", summary: "EDGE weekend-span", start: "2026-05-08", due: "2026-05-12" });

  // --- E6 wide parent (10 children) for wide rollup + bulk ---
  const wideStarts = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08", "2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14", "2026-05-15"];
  for (let i = 1; i <= 10; i++) {
    const n = String(i).padStart(2, "0");
    d.push({ ref: `W${n}`, type: "Task", parent: "E6", summary: `WIDE-${n}`, start: wideStarts[i - 1], due: wideStarts[i - 1], status: i <= 3 ? "Done" : i <= 5 ? "In Progress" : undefined });
  }
  return d;
}

test("SEED LZPT scenarios", async ({ page }) => {
  test.skip(process.env.SEED !== "1", "guarded: set SEED=1 to (re)seed the LZPT project");
  await assertLoggedIn(page);
  await page.goto(`${BASE_URL}/jira/your-work`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  // Ensure project exists.
  const p = await api(page, "GET", `/rest/api/3/project/${KEY}`);
  if (!p.ok) throw new Error(`LZPT project missing (${p.status}); run _seed.spec.ts first`);

  // WIPE: delete every existing issue in LZPT for a deterministic reseed.
  let deleted = 0;
  for (let guard = 0; guard < 20; guard++) {
    const s = await api(page, "POST", "/rest/api/3/search/jql", { jql: `project = ${KEY} ORDER BY created DESC`, maxResults: 100, fields: ["key"] });
    const issues = s.data?.issues || [];
    if (issues.length === 0) break;
    for (const it of issues) { await api(page, "DELETE", `/rest/api/3/issue/${it.key}?deleteSubtasks=true`); deleted++; }
  }
  console.log("WIPED", deleted);

  const defs = buildDefs();
  const key = new Map<string, string>();

  // Create in hierarchy order: epics, then stories/tasks, then subtasks.
  const tiers = [["Epic"], ["Task", "Story"], ["Subtask"]];
  for (const tier of tiers) {
    for (const def of defs.filter((x) => tier.includes(x.type))) {
      const fields: any = { project: { key: KEY }, issuetype: { id: T[def.type] }, summary: def.summary };
      if (def.parent) fields.parent = { key: key.get(def.parent) };
      if (def.start) fields.customfield_10015 = def.start;
      if (def.due) fields.duedate = def.due;
      // PPM Duration. Only set where the scenario NEEDS it — the bed deliberately
      // leaves it null everywhere else, because a Jira with no duration field is
      // the common real case and the engine must cope with it.
      if (def.duration != null) fields[DURATION_FIELD] = def.duration;
      const r = await api(page, "POST", "/rest/api/3/issue", { fields });
      if (!r.ok) { console.log("CREATE_FAIL", def.ref, r.status, JSON.stringify(r.data).slice(0, 200)); continue; }
      key.set(def.ref, r.data.key);
    }
  }
  console.log("CREATED", key.size, "issues");

  // Dependency links (Blocks: outward blocks inward).
  let links = 0;
  for (const def of defs) {
    for (const b of def.blocks || []) {
      const from = key.get(def.ref), to = key.get(b);
      if (!from || !to) continue;
      // Jira POST semantics (verified live): {outwardIssue:X, inwardIssue:Y} creates
      // "Y blocks X". To make `from` block `to` (from = predecessor), put `to`
      // outward and `from` inward.
      const r = await api(page, "POST", "/rest/api/3/issueLink", { type: { name: "Blocks" }, outwardIssue: { key: to }, inwardIssue: { key: from } });
      if (r.ok) links++; else console.log("LINK_FAIL", def.ref, "->", b, r.status, JSON.stringify(r.data).slice(0, 150));
    }
  }
  console.log("LINKED", links);

  // Statuses via transitions (best-effort — team-managed default workflow).
  let moved = 0;
  for (const def of defs) {
    if (!def.status) continue;
    const k = key.get(def.ref); if (!k) continue;
    const tr = await api(page, "GET", `/rest/api/3/issue/${k}/transitions`);
    const t = (tr.data?.transitions || []).find((x: any) => x.to?.name?.toLowerCase() === def.status!.toLowerCase());
    if (t) { const r = await api(page, "POST", `/rest/api/3/issue/${k}/transitions`, { transition: { id: t.id } }); if (r.ok) moved++; }
  }
  console.log("STATUSED", moved);
  console.log("SEED_DONE keys=", JSON.stringify(Object.fromEntries(key)));
});

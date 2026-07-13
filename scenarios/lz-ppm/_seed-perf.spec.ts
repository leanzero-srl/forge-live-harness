// PERF BED seeder — mass-create thousands of issues in a SEPARATE project (LZPP) so the
// deterministic "LZPT Scenarios" plan (scoped to project = LZPT) stays at 45. Creates the
// project if missing, then bulk-creates N dated tasks (POST /issue/bulk, 50/call) for
// load/render performance testing. Guarded by PERF=1. Idempotent-ish: re-running tops up to N.
//   PERF=1 PERF_N=6000 npx playwright test scenarios/lz-ppm/_seed-perf.spec.ts
import { test, expect } from "../../fixtures/forge";

const KEY = "LZPP";
const TARGET = Number(process.env.PERF_N || 6000);
test.describe.configure({ retries: 0, timeout: 1_800_000 });

test("SEED perf project (LZPP) with many issues", async ({ page }) => {
  test.skip(process.env.PERF !== "1", "guarded: set PERF=1 to mass-create");
  await page.goto("https://wolfaenpak.atlassian.net/jira", { waitUntil: "domcontentloaded" });

  // Robust fetch: 45s per-attempt timeout (AbortController) so a slow/hung Jira response
  // can't wedge the whole seed, plus retry on 429/5xx with backoff (sustained bulk-create
  // gets throttled). Returns { status, ok, data }.
  const jira = async (method: string, path: string, body?: any) =>
    page.evaluate(async (args: any[]) => {
      const [m, p, b] = args as [string, string, any];
      const once = async () => {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 45000);
        try {
          const res = await fetch(p, { method: m, headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: b ? JSON.stringify(b) : undefined, signal: ctrl.signal });
          let data: any = null; const t = await res.text(); try { data = t ? JSON.parse(t) : null; } catch { data = t; }
          return { status: res.status, ok: res.ok, data };
        } finally { clearTimeout(to); }
      };
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let last: any = { status: 0, ok: false, data: null };
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          last = await once();
          if (last.ok || (last.status >= 400 && last.status < 500 && last.status !== 429)) return last;
        } catch (e) { last = { status: 0, ok: false, data: String(e) }; }
        await sleep(1000 * Math.pow(2, attempt)); // 1s,2s,4s,8s backoff on 429/5xx/timeout
      }
      return last;
    }, [method, path, body]);

  // 1. Who am I (project lead) + does LZPP already exist?
  const me = await jira("GET", "/rest/api/3/myself");
  const leadAccountId = me.data?.accountId;
  console.log("LEAD:", leadAccountId, "existingLZPP:", (await jira("GET", `/rest/api/3/project/${KEY}`)).status);

  let proj = await jira("GET", `/rest/api/3/project/${KEY}`);
  if (proj.status === 404) {
    const create = await jira("POST", "/rest/api/3/project", {
      key: KEY, name: "LZPT Performance", projectTypeKey: "software",
      projectTemplateKey: "com.pyxis.greenhopper.jira:gh-simplified-basic",
      leadAccountId, assigneeType: "PROJECT_LEAD",
    });
    console.log("CREATE_PROJECT:", create.status, JSON.stringify(create.data).slice(0, 300));
    expect(create.ok || create.status === 201, "project created").toBeTruthy();
    proj = await jira("GET", `/rest/api/3/project/${KEY}`);
  }
  // 2. Resolve the Task issue type id for this project.
  const cm = await jira("GET", `/rest/api/3/issue/createmeta?projectKeys=${KEY}&expand=projects.issuetypes`);
  const itypes = cm.data?.projects?.[0]?.issuetypes || [];
  const taskType = itypes.find((t: any) => /task/i.test(t.name) && !t.subtask) || itypes.find((t: any) => !t.subtask);
  console.log("TASK_TYPE:", taskType?.id, taskType?.name, " issuetypes:", itypes.map((t: any) => t.name).join(","));
  expect(taskType?.id, "resolved a Task issue type").toBeTruthy();

  // 3. How many already exist? Top up to TARGET. (new-JQL search doesn't return .total
  // reliably, so use the approximate-count endpoint.)
  const approx = await jira("POST", "/rest/api/3/search/approximate-count", { jql: `project = ${KEY}` });
  const already = approx.data?.count ?? 0;
  console.log("ALREADY:", already, " target:", TARGET);

  const toCreate = Math.max(0, TARGET - already);
  const START = "customfield_10015";
  let created = 0, failed = 0;
  const BATCH = 50;
  for (let base = 0; base < toCreate; base += BATCH) {
    const n = Math.min(BATCH, toCreate - base);
    const issueUpdates = Array.from({ length: n }, (_, j) => {
      const idx = already + base + j;
      // Spread dates across ~2 years of working days so the Gantt has real breadth.
      const startDay = new Date(Date.UTC(2026, 0, 5) + (idx % 400) * 86400000);
      const dueDay = new Date(startDay.getTime() + ((idx % 5) + 1) * 86400000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      return { fields: { project: { key: KEY }, issuetype: { id: taskType.id }, summary: `PERF-${String(idx + 1).padStart(5, "0")}`, [START]: iso(startDay), duedate: iso(dueDay) } };
    });
    const res = await jira("POST", "/rest/api/3/issue/bulk", { issueUpdates });
    if (res.ok || res.status === 201) { created += res.data?.issues?.length || 0; failed += res.data?.errors?.length || 0; }
    else { failed += n; if (base < BATCH * 3) console.log("BULK_ERR:", res.status, JSON.stringify(res.data).slice(0, 300)); }
    if (base % (BATCH * 10) === 0) console.log(`... progress ${base + n}/${toCreate} (created ${created}, failed ${failed})`);
  }
  const finalApprox = await jira("POST", "/rest/api/3/search/approximate-count", { jql: `project = ${KEY}` });
  console.log(`PERF_SEED_DONE created=${created} failed=${failed} total_now=${finalApprox.data?.count}`);
  expect(created, "created a meaningful number of perf issues").toBeGreaterThan(0);
});

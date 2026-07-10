// SEED — create/refresh the dedicated LZ PPM test project (LZPT) in wolfaenpak and
// read its issue types. Idempotent: find-or-create. Run explicitly, not in CI sweeps.
import { test } from "../../fixtures/forge";
import { assertLoggedIn } from "../../forge/browser";
import { BASE_URL } from "../../config/env";

test.describe.configure({ retries: 0, timeout: 180_000 });

const KEY = "LZPT";
const LEAD = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086"; // Mihai Perdum

// Same-origin fetch from inside the Jira page → carries session cookie + Origin,
// so state-changing calls pass the XSRF check (page.request does not).
async function api(page: any, method: string, path: string, body?: any) {
  return page.evaluate(
    async ([m, p, b]: [string, string, any]) => {
      const res = await fetch(p, {
        method: m,
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" },
        credentials: "include",
        body: b ? JSON.stringify(b) : undefined,
      });
      let data: any = null;
      const text = await res.text();
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      return { status: res.status, ok: res.ok, data };
    },
    [method, path, body],
  );
}

test("seed: create/find LZPT project", async ({ page }) => {
  await assertLoggedIn(page);
  await page.goto(`${BASE_URL}/jira/your-work`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  let proj: any = null;
  const existing = await api(page, "GET", `/rest/api/3/project/${KEY}`);
  if (existing.ok) {
    proj = existing.data;
    console.log("PROJECT_EXISTS", proj.key, proj.id);
  } else {
    const create = await api(page, "POST", "/rest/api/3/project", {
      key: KEY,
      name: "LZ PPM Harness Test",
      projectTypeKey: "software",
      projectTemplateKey: "com.pyxis.greenhopper.jira:gh-simplified-agility-kanban",
      leadAccountId: LEAD,
      assigneeType: "PROJECT_LEAD",
      description: "Automated test scenarios for the LeanZero Management PPM app. Safe to delete.",
    });
    console.log("CREATE status", create.status, "=>", JSON.stringify(create.data).slice(0, 400));
    if (!create.ok) return;
    proj = (await api(page, "GET", `/rest/api/3/project/${KEY}`)).data;
  }

  const types = (proj.issueTypes || []).map((t: any) => ({ name: t.name, id: t.id, subtask: t.subtask, hierarchy: t.hierarchyLevel }));
  console.log("PROJECT_ID", proj.id);
  console.log("ISSUE_TYPES", JSON.stringify(types));

  // PROBE: can we set the app's date fields (customfield_10015 start, duedate) here?
  const search = await api(page, "POST", "/rest/api/3/search/jql", {
    jql: `project = ${KEY} AND summary ~ "ZZPROBE"`, maxResults: 1, fields: ["summary"],
  });
  let probeKey = search.data?.issues?.[0]?.key;
  if (!probeKey) {
    const mk = await api(page, "POST", "/rest/api/3/issue", {
      fields: { project: { key: KEY }, issuetype: { id: "10135" }, summary: "ZZPROBE dates", duedate: "2026-05-20", customfield_10015: "2026-05-11" },
    });
    console.log("PROBE_CREATE status", mk.status, "=>", JSON.stringify(mk.data).slice(0, 300));
    probeKey = mk.data?.key;
  }
  if (probeKey) {
    const got = await api(page, "GET", `/rest/api/3/issue/${probeKey}?fields=summary,duedate,customfield_10015,customfield_11581`);
    console.log("PROBE_READBACK", probeKey, JSON.stringify({ due: got.data?.fields?.duedate, start: got.data?.fields?.customfield_10015, dur: got.data?.fields?.customfield_11581 }));
  }
});

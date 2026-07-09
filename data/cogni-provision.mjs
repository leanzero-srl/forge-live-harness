// CogniRunner rule-exercise loop — PROJECT PROVISIONER.
// Owner directive: "continuously create new COGTEST-like projects so we don't have to refresh the
// rules and keep accumulating them." Creates a company-managed software project (gh-simplified-basic
// → an editable classic "Software Simplified Workflow for Project <KEY>", the same shape as COGTEST),
// discovers its hub status (the Create transition's target — where a fresh issue lands, so a self-loop
// there fires with no state juggling), and ensures a persistent [rule-lab-fixture] issue.
// Idempotent: reuses an existing project/fixture. Returns everything attachSelfLoopRules needs.
import { get, post, request } from "./jira.mjs";

/** Provision (or reuse) a rule-lab project. Returns { key, workflowName, hubStatusRef, fixtureKey, created }. */
export async function provisionProject(key, name) {
  const me = await get("/rest/api/3/myself");
  let created = false;

  const existing = await request("GET", `/rest/api/3/project/${key}`, { raw: true });
  if (existing.status >= 400) {
    const res = await request("POST", "/rest/api/3/project", { raw: true, body: {
      key, name: name || `CogniRunner Rule Lab ${key}`,
      projectTypeKey: "software",
      projectTemplateKey: "com.pyxis.greenhopper.jira:gh-simplified-basic",
      leadAccountId: me.accountId, assigneeType: "PROJECT_LEAD",
      description: "CogniRunner rule-exercise loop testbed — accumulate rules, no refresh.",
    } });
    if (res.status >= 400) throw new Error(`create project ${key} failed ${res.status}: ${res.text.slice(0, 400)}`);
    created = true;
  }

  const proj = await get(`/rest/api/3/project/${key}`);
  const workflowName = `Software Simplified Workflow for Project ${key}`;
  const wfSearch = await get(`/rest/api/3/workflows/search?queryString=${encodeURIComponent(key)}&expand=values.transitions`);
  const wf = (wfSearch.values || []).find((w) => w.name === workflowName) || (wfSearch.values || [])[0];
  if (!wf) throw new Error(`workflow for ${key} not found after provisioning`);
  // Hub = where a freshly-created issue lands (the Create transition's target status).
  const createT = (wf.transitions || []).find((t) => (t.name || "").toLowerCase() === "create" || String(t.id) === "1");
  const hubStatusRef = String(createT?.toStatusReference || (wf.transitions || [])[0]?.toStatusReference);
  if (!hubStatusRef || hubStatusRef === "undefined") throw new Error(`could not resolve a hub status for ${key}`);

  // Ensure a persistent fixture issue in the hub status.
  const s = await post("/rest/api/3/search/jql", { jql: `project = ${key} AND summary ~ "rule-lab-fixture"`, fields: ["summary", "status"], maxResults: 5 });
  let fixtureKey = (s.issues || [])[0]?.key;
  if (!fixtureKey) {
    const firstType = (proj.issueTypes || []).find((t) => !t.subtask);
    const c = await request("POST", "/rest/api/3/issue", { raw: true, body: {
      fields: { project: { key }, issuetype: { id: firstType?.id }, summary: "[rule-lab-fixture] persistent rule-exercise testbed" },
    } });
    if (c.status >= 400) throw new Error(`create fixture in ${key} failed ${c.status}: ${c.text.slice(0, 300)}`);
    fixtureKey = JSON.parse(c.text).key;
  }

  return { key, workflowName, hubStatusRef, fixtureKey, created };
}

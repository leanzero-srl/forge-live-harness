// Check whether leanzero-demo.atlassian.net has the "Start date" system/custom field
// (customfield_10015, the field lz-ppm-forge defaults to) and whether it has a context
// covering the ATLAS project. Also dumps ATLAS-1's raw fields to see what's really set.
import { chromium } from "@playwright/test";

const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const BASE = "https://leanzero-demo.atlassian.net";

const context = await chromium.launchPersistentContext(PROFILE_PATH, { headless: true, viewport: { width: 1440, height: 900 } });
try {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(`${BASE}/jira/your-work`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(async () => {
    const out = {};
    const fRes = await fetch("/rest/api/3/field", { headers: { Accept: "application/json" }, credentials: "include" });
    const fields = await fRes.json();
    const f10015 = fields.find((f) => f.id === "customfield_10015");
    out.field10015 = f10015 || null;
    out.dateFields = fields.filter((f) => f.schema && (f.schema.type === "date" || f.schema.custom === "com.atlassian.jira.plugin.system.customfieldtypes:datepicker")).map((f) => ({ id: f.id, name: f.name, custom: f.schema.custom }));

    // ATLAS-1 raw fields
    const iRes = await fetch("/rest/api/3/issue/ATLAS-1?fields=*all", { headers: { Accept: "application/json" }, credentials: "include" });
    const issue = await iRes.json();
    out.atlas1_duedate = issue.fields?.duedate;
    out.atlas1_cf10015 = issue.fields?.customfield_10015;
    out.atlas1_keys_with_values = Object.entries(issue.fields || {}).filter(([k, v]) => k.startsWith("customfield_") && v !== null).map(([k, v]) => k);

    // context for customfield_10015 on ATLAS project (project id needed)
    if (f10015) {
      const cRes = await fetch(`/rest/api/3/field/customfield_10015/context`, { headers: { Accept: "application/json" }, credentials: "include" });
      out.field10015_contexts = cRes.ok ? await cRes.json() : { status: cRes.status };
    }

    // ATLAS project id
    const pRes = await fetch(`/rest/api/3/project/ATLAS`, { headers: { Accept: "application/json" }, credentials: "include" });
    const proj = await pRes.json();
    out.atlasProjectId = proj.id;
    out.atlasIssueTypes = (proj.issueTypes || []).map((t) => ({ id: t.id, name: t.name }));

    return out;
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}

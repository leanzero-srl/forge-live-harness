import { chromium } from "@playwright/test";
const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const BASE = "https://leanzero-demo.atlassian.net";
const KEYS = ["ATLAS-16","ATLAS-11","ATLAS-10","ATLAS-13","ATLAS-18"];

const context = await chromium.launchPersistentContext(PROFILE_PATH, { headless: true, viewport: { width: 1440, height: 900 } });
try {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(`${BASE}/jira/your-work`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1000);
  const out = await page.evaluate(async (keys) => {
    const results = {};
    for (const k of keys) {
      const r = await fetch(`/rest/api/3/issue/${k}?fields=duedate,customfield_10015,summary`, { headers: { Accept: "application/json" }, credentials: "include" });
      const j = await r.json();
      results[k] = { summary: j.fields?.summary, duedate: j.fields?.duedate, start: j.fields?.customfield_10015 };
    }
    return results;
  }, KEYS);
  console.log(JSON.stringify(out, null, 2));
} finally {
  await context.close();
}

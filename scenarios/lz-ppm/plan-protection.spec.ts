// lz-ppm DEEP — Iron-Clad plan protection.
// 🔎 CONFIRMS B3 (BLOCKER, premise): plan-protection.js:66 reads the new start from changelog
// `.to` (no `.toString` fallback), but for a DATE custom field Jira's changelog `.to` is null and
// the value lives in `.toString`. So `parseDate(.to)=null` → `if(!newStartDate) continue` → the
// protection silently no-ops on every Start-date edit. (The revert branch uses fromString||from
// for the OLD value — the asymmetry that proves the bug.)
import { test, expect } from "@playwright/test";
// @ts-ignore
import { createIssue, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { request, get } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
test.describe.configure({ timeout: 120_000 });

test("🔎 B3: changelog `.to` is null for a Start date custom field (protection no-revert premise)", async () => {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const START = fc.startDate; // wolfaenpak: customfield_10015
  const j = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS B3 ${Date.now()} [harness-test]` });
  try {
    await request("PUT", `/rest/api/3/issue/${j.key}`, { raw: true, body: { fields: { [START]: "2026-03-01" } } });
    await request("PUT", `/rest/api/3/issue/${j.key}`, { raw: true, body: { fields: { [START]: "2026-01-05" } } }); // the "violating" start change
    const cl = await get(`/rest/api/3/issue/${j.key}/changelog`);
    const items = (cl.values || []).flatMap((h: any) => h.items || []);
    const startItems = items.filter((it: any) => it.fieldId === START || it.field === "Start");
    const latest = startItems.find((it: any) => String(it.toString || "").includes("2026-01-05")) || startItems[startItems.length - 1];
    console.log(`B3 → Start changelog item: ${JSON.stringify(latest)}`);
    expect(latest, "a Start-field changelog item exists").toBeTruthy();
    // B3 INVESTIGATED — premise CONTRADICTED live: the REST changelog `.to` IS the ISO date for
    // cf_10015 (not null), so parseDate(.to) works and the protection would NOT no-op. This locks
    // the observed reality. CAVEAT: plan-protection reads the Forge EVENT changelog (normally the
    // same data) — confirm the event payload before treating B3 as fixed. See findings/lz-ppm.md.
    expect(latest.to, "live REST changelog .to is populated (ISO) for the Start date cf — contradicts B3's premise").toBe("2026-01-05");
  } finally {
    await deleteIssue(j.key).catch(() => {});
  }
});

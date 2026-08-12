// LZPT BED RESTORE — put the project back to exactly what _seed-lzpt declares,
// WITHOUT recreating anything.
//
// Why this exists: the exact-count journeys (status groups, risk RAG, health
// score, cascade deltas) are the bed's drift detector, and when they go red the
// cause is almost never the app — it is that a mutation journey died before its
// restore, or someone clicked something. Re-running the seeder is NOT the answer:
// it wipes and recreates the issues, which changes every key, and the owner
// reports bugs against specific keys (LZPT-104…107).
//
// So this reads the seeder's OWN definitions (buildDefs is exported for exactly
// this) and repairs dates, statuses and Blocks links in place. One source of
// truth, so the contract cannot drift from the checker.
//
// Read-only by default — it reports what is wrong and fails. Pass RESTORE=1 to
// actually repair.
//   npx playwright test --project=chromium scenarios/lz-ppm/_restore-lzpt-bed.spec.ts
//   RESTORE=1 npx playwright test --project=chromium scenarios/lz-ppm/_restore-lzpt-bed.spec.ts
import { test, expect } from "../../fixtures/forge";
import { assertLoggedIn } from "../../forge/browser";
import { BASE_URL } from "../../config/env";
import { buildDefs } from "./_seed-lzpt.spec";

const KEY = "LZPT";
const START_FIELD = "customfield_10015";
const APPLY = process.env.RESTORE === "1";
test.describe.configure({ retries: 0, timeout: 600_000 });

async function api(page: any, method: string, path: string, body?: any) {
  return page.evaluate(async ([m, p, b]: [string, string, any]) => {
    const res = await fetch(p, {
      method: m, credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" },
      body: b ? JSON.stringify(b) : undefined,
    });
    const text = await res.text();
    let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, ok: res.ok, data };
  }, [method, path, body]);
}

test("LZPT bed matches the seed contract", async ({ page }) => {
  await assertLoggedIn(page);
  await page.goto(`${BASE_URL}/jira/your-work`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  const defs = buildDefs();
  const search = await api(page, "POST", "/rest/api/3/search/jql", {
    jql: `project = ${KEY}`, maxResults: 100,
    fields: ["summary", "duedate", START_FIELD, "status", "issuelinks"],
  });
  const issues: any[] = search.data?.issues || [];
  const bySummary = new Map(issues.map((i) => [i.fields.summary, i]));
  const keyOf = (summary: string) => bySummary.get(summary)?.key;

  const drift: string[] = [];
  const repair = async (label: string, fn: () => Promise<any>) => {
    drift.push(label);
    if (APPLY) { const r = await fn(); if (!r?.ok) console.log("  REPAIR FAILED:", label, r?.status, JSON.stringify(r?.data).slice(0, 160)); }
  };

  // ---- dates ----
  // Only issues the seed gives explicit dates to. Epics and stories are left
  // dateless by the seeder and get their dates by ROLL-UP from their children,
  // which Apply legitimately writes back to Jira — so a non-null parent date is
  // correct, not drift. Checking them would fail forever after the first Apply.
  const seedsDates = (d: any) => !!(d.start || d.due);

  // The seed is not fully self-consistent: CHAIN-5 blocks WIDE-01, but CHAIN-5's
  // seeded due (2026-06-05) is AFTER WIDE-01's seeded start (2026-05-04). The
  // app's plan-protection trigger enforces the iron-clad rule on every Jira edit,
  // so it correctly pushes WIDE-01 forward and any attempt to "restore" the
  // seeded date is reverted within seconds. Those issues are not drifted — the
  // seed asks for something the product forbids — so exclude them rather than
  // fight the trigger forever.
  const dueOfRef = new Map(defs.map((d) => [d.ref, d.due]));
  const violatesIronClad = (d: any) => {
    if (!d.start) return false;
    return defs.some((p) => (p.blocks || []).includes(d.ref) && dueOfRef.get(p.ref) && dueOfRef.get(p.ref)! >= d.start!);
  };
  const skipped = defs.filter(seedsDates).filter(violatesIronClad).map((d) => d.summary);
  if (skipped.length) console.log("seed is iron-clad-inconsistent for (dates not enforced):", skipped.join(", "));

  for (const d of defs.filter(seedsDates).filter((x) => !violatesIronClad(x))) {
    const iss = bySummary.get(d.summary);
    if (!iss) { drift.push(`MISSING ISSUE: ${d.summary}`); continue; }
    const start = iss.fields[START_FIELD] || null;
    const due = iss.fields.duedate || null;
    const wantStart = d.start || null, wantDue = d.due || null;
    if (start !== wantStart || due !== wantDue) {
      await repair(
        `DATES ${iss.key} ${d.summary}: ${start}→${due} should be ${wantStart}→${wantDue}`,
        () => api(page, "PUT", `/rest/api/3/issue/${iss.key}`, { fields: { [START_FIELD]: wantStart, duedate: wantDue } }),
      );
    }
  }

  // ---- statuses ----
  for (const d of defs) {
    const iss = bySummary.get(d.summary);
    if (!iss) continue;
    const want = d.status || "To Do";
    const got = iss.fields.status?.name;
    if (got !== want) {
      await repair(`STATUS ${iss.key} ${d.summary}: ${got} should be ${want}`, async () => {
        const t = await api(page, "GET", `/rest/api/3/issue/${iss.key}/transitions`);
        const tr = (t.data?.transitions || []).find((x: any) => x.to?.name === want || x.name === want);
        if (!tr) return { ok: false, status: 0, data: `no transition to ${want}` };
        return api(page, "POST", `/rest/api/3/issue/${iss.key}/transitions`, { transition: { id: tr.id } });
      });
    }
  }

  // ---- Blocks links ----
  const bySummaryOfRef = new Map(defs.map((d) => [d.ref, d.summary]));
  for (const d of defs) {
    const iss = bySummary.get(d.summary);
    if (!iss) continue;
    const wantKeys = (d.blocks || []).map((ref) => keyOf(bySummaryOfRef.get(ref)!)).filter(Boolean).sort();
    const links = (iss.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks");
    const gotKeys = links.filter((l: any) => l.outwardIssue).map((l: any) => l.outwardIssue.key).sort();
    if (JSON.stringify(gotKeys) !== JSON.stringify(wantKeys)) {
      for (const extra of gotKeys.filter((k: string) => !wantKeys.includes(k))) {
        const l = links.find((x: any) => x.outwardIssue?.key === extra);
        await repair(`LINK EXTRA ${iss.key} blocks ${extra}`, () => api(page, "DELETE", `/rest/api/3/issueLink/${l.id}`));
      }
      for (const missing of wantKeys.filter((k: string) => !gotKeys.includes(k))) {
        // Jira POST semantics: {outwardIssue:X, inwardIssue:Y} creates "Y blocks X".
        await repair(`LINK MISSING ${iss.key} blocks ${missing}`, () =>
          api(page, "POST", "/rest/api/3/issueLink", { type: { name: "Blocks" }, outwardIssue: { key: missing }, inwardIssue: { key: iss.key } }));
      }
    }
  }

  if (drift.length) {
    console.log(`${APPLY ? "REPAIRED" : "DRIFT DETECTED"} — ${drift.length} item(s):`);
    for (const d of drift) console.log("  " + d);
  } else {
    console.log("LZPT bed matches the seed contract exactly");
  }

  if (!APPLY) {
    expect(drift, "the bed must match the seed contract — re-run with RESTORE=1 to repair").toEqual([]);
  }
});

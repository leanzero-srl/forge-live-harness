// lz-ppm DEEP — the scheduled hourly refresh.
// 🔎 CONFIRMS B1 (BLOCKER, affects wolfaenpak): the scheduled refresh fetches with DEFAULT field
// ids (no `fields` arg), so on instances whose Duration/Buffer/Start use non-default custom fields
// (wolfaenpak: Duration=cf_10180), the refresh stores null and overwrites them ~1h after every index.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { createIssue, setDates, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { searchJql, get } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import { createFixtureRetry } from "../_support/lzfixture";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
test.describe.configure({ timeout: 150_000 });

test("🔎 B1: the scheduled refresh wipes a configured-field Duration to null", async () => {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const j = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS B1 ${Date.now()} [harness-test]` });
  let planId: string | undefined;
  try {
    await setDates(j.key, { start: "2026-06-01", due: "2026-06-12", duration: 8, buffer: "No" }, fc);
    await waitForTerminal(async () => (await searchJql(`key = ${j.key}`, ["summary"], 1)).length === 1, { timeout: 20_000, label: "issue indexed" });

    // Fresh index (runIndexing → getIndexFields(config.fields)) keeps the configured Duration.
    const cf = await createFixtureRetry("b1", `key = ${j.key}`, [j.key]);
    planId = cf.planId as string;
    const before = (cf.issues || []).find((i: any) => i.key === j.key);
    console.log(`B1 → fresh index duration=${JSON.stringify(before?.duration)}`);
    expect(Number(before?.duration), "fresh index should hold the configured Duration").toBe(8);

    // Run the scheduled refresh for THIS plan (faithful per-plan replica of onScheduledRefresh).
    await getTestState("lz-ppm", { what: "refreshPlan", planId: planId! });
    const after = (await getTestState("lz-ppm", { what: "plan", planId: planId! })).issues.find((i: any) => i.key === j.key);
    console.log(`B1 → after scheduled refresh duration=${JSON.stringify(after?.duration)}`);
    expect(after?.duration == null, `B1: the scheduled refresh should WIPE Duration to null; got ${JSON.stringify(after?.duration)}`).toBe(true);
  } finally {
    if (planId) await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    await deleteIssue(j.key).catch(() => {});
  }
});

// 🔎 CONFIRMS B2: the scheduled refresh re-fetches only the source issues (no discoverDescendants),
// so descendants discovered at full index vanish from the plan after a refresh.
test("🔎 B2: the scheduled refresh drops a descendant discovered only at full index", async () => {
  const tag = Date.now().toString(36);
  const P = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS B2-P ${tag} [harness-test]` });
  const SUB = await createIssue({ projectKey: PROJECT, issueType: "Payment", summary: `HARNESS B2-SUB ${tag} [harness-test]`, fields: { parent: { key: P.key } } });
  let planId: string | undefined;
  try {
    await waitForTerminal(async () => {
      const found = await searchJql(`key in (${P.key},${SUB.key})`, ["summary"], 5);
      if (new Set(found.map((i: any) => i.key)).size < 2) return false;
      const pi: any = await get(`/rest/api/3/issue/${P.key}?fields=subtasks`);
      return (pi.fields.subtasks || []).length >= 1;
    }, { timeout: 25_000, interval: 1_500, label: "parent+subtask propagation" });

    // Source JQL returns ONLY the parent; runIndexing's discoverDescendants pulls in the subtask.
    const cf = await createFixtureRetry("b2", `key = ${P.key}`, [P.key, SUB.key]);
    planId = cf.planId as string;
    const indexedKeys = (cf.issues || []).map((i: any) => i.key);
    console.log(`B2 → fresh index keys: ${indexedKeys.join(", ")}`);
    expect(indexedKeys.includes(SUB.key), "full index should discover the subtask descendant").toBe(true);

    await getTestState("lz-ppm", { what: "refreshPlan", planId: planId! });
    const afterKeys = (await getTestState("lz-ppm", { what: "plan", planId: planId! })).issues.map((i: any) => i.key);
    console.log(`B2 → after refresh keys: ${afterKeys.join(", ")}`);
    expect(afterKeys.includes(SUB.key), `B2: the refresh should DROP the descendant; got [${afterKeys.join(",")}]`).toBe(false);
  } finally {
    if (planId) await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    await deleteIssue(SUB.key).catch(() => {});
    await deleteIssue(P.key).catch(() => {});
  }
});

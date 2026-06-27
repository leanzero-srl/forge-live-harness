// lz-ppm DEEP — index field coverage.
// 🔎 CONFIRMS M10: getIndexFields() omits priority/labels/resolution/reporter/storyPoints/
// created/updated, but the transformer reads them → a fresh index stores them blank even
// though the Jira issue has them. Set priority+labels in Jira, index, compare.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { createIssue, setDates, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { request, get, searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import { createFixtureRetry } from "../_support/lzfixture";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
test.describe.configure({ timeout: 150_000 });

test("🔎 M10: fresh index omits priority+labels that are set on the Jira issue", async () => {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const j = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS M10 ${Date.now()} [harness-test]` });
  let planId: string | undefined;
  try {
    await request("PUT", `/rest/api/3/issue/${j.key}`, { raw: true, body: { fields: { priority: { name: "High" }, labels: ["harness-m10"] } } });
    await setDates(j.key, { start: "2026-06-01", due: "2026-06-10", duration: 8, buffer: "No" }, fc);
    await waitForTerminal(async () => (await searchJql(`key = ${j.key}`, ["summary"], 1)).length === 1, { timeout: 20_000, label: "issue indexed" });

    // Ground truth: what Jira actually stores
    const jira: any = await get(`/rest/api/3/issue/${j.key}?fields=priority,labels`);
    const jiraPriority = jira.fields?.priority?.name ?? null;
    const jiraLabels = jira.fields?.labels ?? [];
    expect(jiraPriority, "Jira issue has a priority").toBeTruthy();
    expect(jiraLabels.length, "Jira issue has a label").toBeGreaterThan(0);

    const cf = await createFixtureRetry("m10", `key = ${j.key}`, [j.key]);
    planId = cf.planId as string;
    const issue = (cf.issues || []).find((i: any) => i.key === j.key);
    expect(issue, "issue present in fresh index").toBeTruthy();
    console.log(`M10 → Jira priority=${jiraPriority} labels=${JSON.stringify(jiraLabels)} | index priority=${JSON.stringify(issue.priority)} labels=${JSON.stringify(issue.labels)}`);

    const blankPriority = issue.priority == null || issue.priority === "";
    const blankLabels = !issue.labels || issue.labels.length === 0;
    expect(!blankPriority && !blankLabels,
      `M10 (fixed): the fresh index must KEEP priority+labels; got index priority=${JSON.stringify(issue.priority)} labels=${JSON.stringify(issue.labels)}`).toBe(true);
  } finally {
    if (planId) await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    await deleteIssue(j.key).catch(() => {});
  }
});

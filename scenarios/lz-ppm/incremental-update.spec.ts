// lz-ppm DEEP — incremental issue-update path (issue-updated trigger).
// 🔎 CONFIRMS M11: incrementalUpdateIssue computes the fresh issue ONCE against the FIRST matching
// plan's keyset, then writes that same issue into EVERY plan → a plan whose keyset legitimately
// contains a dependency has it wiped when another (smaller) plan is processed first.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { createIssue, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { get } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import { createFixtureRetry } from "../_support/lzfixture";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
test.describe.configure({ timeout: 150_000 });

const predsOf = (issues: any[], key: string) => (issues.find((i: any) => i.key === key)?.predecessors) || [];

test("🔎 M11: incremental update corrupts another plan's dependency (cross-plan)", async () => {
  const tag = Date.now().toString(36);
  const X = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS M11-X ${tag} [harness-test]` });
  const Q = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS M11-Q ${tag} [harness-test]` });
  let planA: string | undefined, planB: string | undefined;
  try {
    await linkBlocks(Q.key, X.key); // Q blocks X → X.predecessors = [Q]
    await waitForTerminal(async () => {
      const xi: any = await get(`/rest/api/3/issue/${X.key}?fields=issuelinks`);
      return (xi.fields.issuelinks || []).some((l: any) => l.type?.name === "Blocks");
    }, { timeout: 25_000, interval: 1_500, label: "link propagation" });

    // Plan A FIRST (keyset {X}) → X has NO in-plan dependency.
    const cfA = await createFixtureRetry("m11a", `key in (${X.key})`, [X.key]);
    planA = cfA.planId as string;
    // Plan B (keyset {X,Q}) → X legitimately has predecessor Q.
    const cfB = await createFixtureRetry("m11b", `key in (${X.key},${Q.key})`, [X.key, Q.key]);
    planB = cfB.planId as string;

    const before = predsOf((await getTestState("lz-ppm", { what: "plan", planId: planB })).issues, X.key);
    console.log(`M11 → before: Plan B's X.predecessors=${JSON.stringify(before)}`);
    expect(before.includes(Q.key), "Plan B's X should have predecessor Q before the incremental update").toBe(true);

    // Invoke the real incremental-update path for X.
    await getTestState("lz-ppm", { what: "incrementalUpdate", key: X.key });

    const after = predsOf((await getTestState("lz-ppm", { what: "plan", planId: planB })).issues, X.key);
    console.log(`M11 → after incremental: Plan B's X.predecessors=${JSON.stringify(after)}`);
    expect(after.includes(Q.key), `M11: the incremental update wiped Plan B's X→Q dependency (cross-plan corruption); after=${JSON.stringify(after)}`).toBe(false);
  } finally {
    if (planA) await getTestState("lz-ppm", { what: "deleteFixture", planId: planA }).catch(() => {});
    if (planB) await getTestState("lz-ppm", { what: "deleteFixture", planId: planB }).catch(() => {});
    await deleteIssue(X.key).catch(() => {});
    await deleteIssue(Q.key).catch(() => {});
  }
});

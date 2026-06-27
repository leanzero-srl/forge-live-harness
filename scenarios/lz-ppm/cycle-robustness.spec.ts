// lz-ppm DEEP — adversarial: a dependency CYCLE (A blocks B AND B blocks A). The calc engine must
// not infinite-loop or crash; it should settle (via its visited-guard) and keep both issues with
// valid dates rather than null them. A 500/timeout or wiped dates is a real robustness finding.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { createIssue, setDates, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { get } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import { createFixtureRetry } from "../_support/lzfixture";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
test.describe.configure({ timeout: 150_000 });

test("🔎 a dependency CYCLE settles without crashing/hanging and keeps valid dates", async () => {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const tag = Date.now().toString(36);
  const A = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS cycle-A ${tag} [harness-test]` });
  const B = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS cycle-B ${tag} [harness-test]` });
  let planId: string | undefined;
  try {
    await setDates(A.key, { start: "2026-03-02", due: "2026-03-06", duration: 5, buffer: "No" }, fc);
    await setDates(B.key, { start: "2026-03-09", due: "2026-03-13", duration: 5, buffer: "No" }, fc);
    await linkBlocks(A.key, B.key); // A → B
    await linkBlocks(B.key, A.key); // B → A  (cycle!)
    await waitForTerminal(async () => {
      const ai: any = await get(`/rest/api/3/issue/${A.key}?fields=issuelinks`);
      return (ai.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks").length >= 2;
    }, { timeout: 25_000, interval: 1_500, label: "cycle links propagate" });

    const cf = await createFixtureRetry("cycle", `key in (${A.key},${B.key})`, [A.key, B.key]);
    planId = cf.planId as string;

    // Moment of truth: settle must RETURN (not 500 / not time out) for a cyclic graph.
    let settled: any, crashed = false, detail = "";
    try { settled = await getTestState("lz-ppm", { what: "settle", planId: planId! }); }
    catch (e: any) { crashed = true; detail = String(e?.message || e); }
    console.log(`cycle settle → crashed=${crashed} ${detail}`);
    expect(crashed, `a dependency cycle must not crash/hang the recalc engine. detail=${detail}`).toBe(false);

    const a = (settled.issues || []).find((i: any) => i.key === A.key);
    const b = (settled.issues || []).find((i: any) => i.key === B.key);
    expect(a && b, "both cycle issues present after settle").toBeTruthy();
    console.log(`cycle → A start=${a?.startDate} due=${a?.dueDate} | B start=${b?.startDate} due=${b?.dueDate}`);
    expect(
      Boolean(a.startDate && a.dueDate && b.startDate && b.dueDate),
      `the engine must not WIPE valid dates on a cycle; got A(${a.startDate}..${a.dueDate}) B(${b.startDate}..${b.dueDate})`,
    ).toBe(true);
  } finally {
    if (planId) await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    await deleteIssue(A.key).catch(() => {});
    await deleteIssue(B.key).catch(() => {});
  }
});

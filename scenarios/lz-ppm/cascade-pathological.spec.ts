// lz-ppm DEEP — pathological cascade inputs that expose unclamped scheduling math.
// 🔎 CONFIRMS M5/M6: when a predecessor's due pushes a NO-DURATION, buffer=No successor's
// iron-clad start PAST its own (earlier) due, the backend leaves due unchanged and derives
// duration 0 → an inverted Gantt bar (due < start, duration 0). Same plumbing as cascade-runner.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { createIssue, setDates, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { get, searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import { createFixtureRetry } from "../_support/lzfixture";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
test.describe.configure({ timeout: 150_000 });

test("M5/M6: predecessor pushes a no-duration successor past its due → inverted bar (dur 0, due<start)", async () => {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const tag = Date.now().toString(36);
  const A = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS M5-A ${tag} [harness-test]` });
  const B = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS M5-B ${tag} [harness-test]` });
  let planId: string | undefined;
  try {
    await setDates(A.key, { start: "2026-02-20", due: "2026-02-27", duration: 6, buffer: "No" }, fc);
    await setDates(B.key, { start: "2026-01-01", due: "2026-01-07", duration: undefined, buffer: "No" }, fc); // NO duration
    await linkBlocks(A.key, B.key); // A Blocks B → B is A's successor
    await waitForTerminal(async () => {
      const found = await searchJql(`key in (${A.key},${B.key})`, ["summary"], 5);
      if (new Set(found.map((i: any) => i.key)).size < 2) return false;
      const ai: any = await get(`/rest/api/3/issue/${A.key}?fields=issuelinks`);
      return (ai.fields.issuelinks || []).some((l: any) => l.type?.name === "Blocks");
    }, { timeout: 25_000, interval: 1_500, label: "graph propagation" });

    const cf = await createFixtureRetry("m5", `key in (${A.key},${B.key})`, [A.key, B.key]);
    planId = cf.planId as string;
    const settled = await getTestState("lz-ppm", { what: "settle", planId: planId! });
    const b = (settled.issues || []).find((i: any) => i.key === B.key);
    expect(b, "B present in settled plan").toBeTruthy();
    console.log(`B settled → start=${b.startDate} due=${b.dueDate} duration=${b.duration}`);
    const inverted = String(b.dueDate) < String(b.startDate);
    expect(Number(b.duration) >= 1 && !inverted,
      `M5 (fixed): expected duration>=1 AND due>=start; got start=${b.startDate} due=${b.dueDate} duration=${b.duration}`).toBe(true);
  } finally {
    if (planId) await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    await deleteIssue(A.key).catch(() => {});
    await deleteIssue(B.key).catch(() => {});
  }
});

// 🔎 CONFIRMS M6: a parent that rolls up its subtask children gets duration 0 / due<start when a
// predecessor pushes the parent start past every child's due. Backend rolls up SUBTASK .children
// (WFH subtask type = "Payment", id 10006).
test("M6: parent rollup inverted when a predecessor pushes the parent start past all children's due", async () => {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const tag = Date.now().toString(36);
  const P = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS M6-P ${tag} [harness-test]` });
  const A = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS M6-A ${tag} [harness-test]` });
  const SUB = await createIssue({ projectKey: PROJECT, issueType: "Payment", summary: `HARNESS M6-SUB ${tag} [harness-test]`, fields: { parent: { key: P.key } } });
  let planId: string | undefined;
  try {
    await setDates(SUB.key, { start: "2026-01-05", due: "2026-01-09", duration: 5, buffer: "No" }, fc); // child due EARLY
    await setDates(A.key, { start: "2026-02-20", due: "2026-02-27", duration: 6, buffer: "No" }, fc);   // predecessor due LATE
    await linkBlocks(A.key, P.key); // A Blocks the parent P
    await waitForTerminal(async () => {
      const found = await searchJql(`key in (${P.key},${A.key},${SUB.key})`, ["summary"], 5);
      if (new Set(found.map((i: any) => i.key)).size < 3) return false;
      const ai: any = await get(`/rest/api/3/issue/${A.key}?fields=issuelinks`);
      if (!(ai.fields.issuelinks || []).some((l: any) => l.type?.name === "Blocks")) return false;
      const pi: any = await get(`/rest/api/3/issue/${P.key}?fields=subtasks`);
      return (pi.fields.subtasks || []).length >= 1;
    }, { timeout: 25_000, interval: 1_500, label: "graph propagation" });
    const cf = await createFixtureRetry("m6", `key in (${P.key},${A.key},${SUB.key})`, [P.key, A.key, SUB.key]);
    planId = cf.planId as string;
    const settled = await getTestState("lz-ppm", { what: "settle", planId: planId! });
    const p = (settled.issues || []).find((x: any) => x.key === P.key);
    expect(p, "parent P present in settled plan").toBeTruthy();
    console.log(`M6 → P settled start=${p.startDate} due=${p.dueDate} duration=${p.duration}`);
    const inverted = String(p.dueDate) < String(p.startDate);
    expect(Number(p.duration) >= 1 && !inverted,
      `M6 (fixed): expected parent duration>=1 AND due>=start; got start=${p.startDate} due=${p.dueDate} duration=${p.duration}`).toBe(true);
  } finally {
    if (planId) await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    await deleteIssue(SUB.key).catch(() => {});
    await deleteIssue(A.key).catch(() => {});
    await deleteIssue(P.key).catch(() => {});
  }
});

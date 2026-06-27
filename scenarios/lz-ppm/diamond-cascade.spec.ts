// lz-ppm DEEP — adversarial: a DIAMOND dependency (A→B, A→C, B→D, C→D). D starts early and must be
// cascaded to AFTER the LATER of its two predecessors (B, the long one) — not just whichever was
// processed last. A D pushed only past the short predecessor C is a real cascade-merge bug.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { createIssue, setDates, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { get } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import { createFixtureRetry } from "../_support/lzfixture";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
test.describe.configure({ timeout: 180_000 });

test("🔎 a DIAMOND dependency cascades D past the LATER predecessor (merge correctness)", async () => {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const tag = Date.now().toString(36);
  const mk = (n: string) => createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS diamond-${n} ${tag} [harness-test]` });
  const A = await mk("A"), B = await mk("B"), C = await mk("C"), D = await mk("D");
  let planId: string | undefined;
  try {
    await setDates(A.key, { start: "2026-03-02", due: "2026-03-03", duration: 2, buffer: "No" }, fc);
    await setDates(B.key, { start: "2026-03-04", due: "2026-03-13", duration: 8, buffer: "No" }, fc); // LONG predecessor
    await setDates(C.key, { start: "2026-03-04", due: "2026-03-05", duration: 2, buffer: "No" }, fc); // short predecessor
    await setDates(D.key, { start: "2026-03-04", due: "2026-03-05", duration: 2, buffer: "No" }, fc); // starts EARLY → must be pushed
    await linkBlocks(A.key, B.key); await linkBlocks(A.key, C.key);
    await linkBlocks(B.key, D.key); await linkBlocks(C.key, D.key);
    await waitForTerminal(async () => {
      const di: any = await get(`/rest/api/3/issue/${D.key}?fields=issuelinks`);
      return (di.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks").length >= 2;
    }, { timeout: 30_000, interval: 1_500, label: "diamond links propagate" });

    const cf = await createFixtureRetry("diamond", `key in (${A.key},${B.key},${C.key},${D.key})`, [A.key, B.key, C.key, D.key]);
    planId = cf.planId as string;
    const settled = await getTestState("lz-ppm", { what: "settle", planId: planId! });
    const find = (k: string) => (settled.issues || []).find((i: any) => i.key === k);
    const b = find(B.key), c = find(C.key), d = find(D.key);
    console.log(`diamond → B due=${b?.dueDate} C due=${c?.dueDate} | D start=${d?.startDate} due=${d?.dueDate}`);
    expect(d?.startDate, "D present in settled plan").toBeTruthy();
    // D must start strictly AFTER the LATER predecessor B (and therefore after C too).
    expect(String(d.startDate) > String(b.dueDate), `D must cascade past the LATER predecessor B (due ${b.dueDate}); got D.start=${d.startDate}`).toBe(true);
    expect(String(d.startDate) > String(c.dueDate), `D must also be after C (due ${c.dueDate})`).toBe(true);
  } finally {
    if (planId) await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    for (const x of [A, B, C, D]) await deleteIssue(x.key).catch(() => {});
  }
});

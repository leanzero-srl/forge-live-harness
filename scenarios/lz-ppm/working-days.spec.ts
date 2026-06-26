// lz-ppm DEEP — working-days normalization invariants (adversarial).
import { test, expect } from "@playwright/test";
// @ts-ignore
import { createIssue, setDates, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";

// Mon–Fri calendar, no holidays — matches the plan's default working-day context.
function workingDaysInclusive(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return -1;
  const s = new Date(startISO + "T00:00:00Z"), e = new Date(endISO + "T00:00:00Z");
  if (isNaN(+s) || isNaN(+e) || e < s) return -1;
  let n = 0;
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

async function seedAndIndex(fc: any) {
  const j = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS WD ${Date.now()} [harness-test]` });
  await setDates(j.key, { start: "2026-01-05", due: "2026-01-09", duration: 5, buffer: "No" }, fc); // consistent Mon→Fri
  await waitForTerminal(async () => (await searchJql(`key = ${j.key}`, ["summary"], 1)).length === 1, { timeout: 20_000, label: "issue indexed" });
  const cf = await getTestState("lz-ppm", { what: "createFixture", name: "wd", jql: `key = ${j.key}` });
  return { key: j.key, planId: cf.planId as string };
}

test.describe.configure({ timeout: 150_000 });

// M7 was INVESTIGATED and did NOT reproduce live: a weekend-start edit settles to a CONSISTENT
// trio (start snapped Sat→Mon AND due recomputed to keep workingDays(start,due)===duration).
// Kept as a regression guard asserting the correct behaviour. See findings/lz-ppm.md.
test("M7 (regression): a weekend start edit settles to a CONSISTENT trio", async () => {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const { key, planId } = await seedAndIndex(fc);
  try {
    await getTestState("lz-ppm", { what: "applyEdit", planId, key, field: "startDate", value: "2026-01-03" }); // Sat
    const settled = await getTestState("lz-ppm", { what: "settle", planId });
    const i = (settled.issues || []).find((x: any) => x.key === key);
    const wd = workingDaysInclusive(i.startDate, i.dueDate);
    console.log(`M7 → settled start=${i.startDate} due=${i.dueDate} duration=${i.duration} | workingDaysInclusive=${wd}`);
    expect(wd, "engine recomputes a consistent trio on a weekend-start edit").toBe(Number(i.duration));
  } finally {
    await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    await deleteIssue(key).catch(() => {});
  }
});

// m1 was INVESTIGATED and did NOT reproduce live: a weekend (non-working-day) due settles to a
// CORRECT duration equal to the true working-days count (no +1 over-count in the settle path).
// Kept as a regression guard asserting the correct behaviour. See findings/lz-ppm.md.
test("m1 (regression): a weekend due derives a CORRECT (not over-counted) duration", async () => {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const { key, planId } = await seedAndIndex(fc);
  try {
    await getTestState("lz-ppm", { what: "applyEdit", planId, key, field: "dueDate", value: "2026-01-10" }); // Sat
    const settled = await getTestState("lz-ppm", { what: "settle", planId });
    const i = (settled.issues || []).find((x: any) => x.key === key);
    const trueInclusive = workingDaysInclusive(i.startDate, i.dueDate);
    console.log(`m1 → settled start=${i.startDate} due=${i.dueDate} duration=${i.duration} | trueWorkingDaysInclusive=${trueInclusive}`);
    expect(Number(i.duration), `m1 did NOT reproduce: duration ${i.duration} equals the true working days ${trueInclusive}`).toBe(trueInclusive);
  } finally {
    await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    await deleteIssue(key).catch(() => {});
  }
});

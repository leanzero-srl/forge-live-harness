// lz-ppm DEEP — adversarial robustness of the backend recalculation engine.
// Live-confirms code-audit findings by feeding the engine hostile inputs via the
// hook (applyEdit a bad value → settle) and asserting the (mis)behaviour.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { createIssue, setDates, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import { createFixtureRetry } from "../_support/lzfixture";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
test.describe.configure({ timeout: 150_000 });

test.describe("lz-ppm recalc robustness (adversarial)", () => {
  // 🔎 CONFIRMS M8: a malformed date string crashes recalculateFullPlan (parseDate returns a
  // truthy Invalid Date, formatDate's toISOString throws RangeError, no try/catch) → settle 500s.
  for (const badDate of ["2026-13-01", "bad-date", "2026/02/15"]) {
    test(`M8: malformed startDate "${badDate}" crashes settle`, async () => {
      const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
      const j = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS M8 ${Date.now()} [harness-test]` });
      let planId: string | undefined;
      try {
        await setDates(j.key, { start: "2026-06-01", due: "2026-06-10", duration: 8, buffer: "No" }, fc);
        await waitForTerminal(async () => (await searchJql(`key = ${j.key}`, ["summary"], 1)).length === 1, { timeout: 20_000, label: "issue indexed" });
        const cf = await createFixtureRetry("m8", `key = ${j.key}`, [j.key]);
        planId = cf.planId as string;
        await getTestState("lz-ppm", { what: "applyEdit", planId: planId!, key: j.key, field: "startDate", value: badDate });
        // A robust engine would skip/record the bad issue; M8 = the whole settle 500s.
        let crashed = false, detail = "";
        try { await getTestState("lz-ppm", { what: "settle", planId: planId! }); }
        catch (e: any) { crashed = true; detail = String(e?.message || e); }
        expect(crashed, `settle with "${badDate}" should crash (M8). detail=${detail}`).toBe(true);
      } finally {
        if (planId) await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
        await deleteIssue(j.key).catch(() => {});
      }
    });
  }
});

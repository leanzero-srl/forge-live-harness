// lz-ppm DEEP — per-link lag/lead end to end against the DEPLOYED backend engine.
// Proves the MS-Project-style finish-to-start lag: a successor with a link lag of
// N working days settles to predecessor.due + N working days (vs the default
// adjacency at lag 0), and that lag=0 restores the exact adjacency behaviour.
// Covers the new persistence vertical (setLinkLag -> KVS -> denormalize on load)
// AND the deployed chain-calculator applying it — the engine math itself is also
// locked by test/parity in the app repo.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { createIssue, setDates, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import { createFixtureRetry } from "../_support/lzfixture";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
test.describe.configure({ timeout: 180_000 });

// Mon–Fri calendar; 2026-06-01 is a Monday. Adjacency: A due Wed 06-03 -> B start Thu 06-04.
// lag=3 working days beyond adjacency: Thu 06-04 +3wd = Fri 05(1), Mon 08(2), Tue 09(3) -> 06-09... wait,
// base itself IS the next working day (Thu 06-04); +3 more wd = Tue 06-09. Asserted dynamically below.

test("🔗 per-link lag: successor settles at predecessor.due + N working days", async () => {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const stamp = Date.now();
  const a = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS lag A ${stamp} [harness-test]` });
  const b = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `HARNESS lag B ${stamp} [harness-test]` });
  let planId: string | undefined;
  try {
    await setDates(a.key, { start: "2026-06-01", due: "2026-06-03", duration: 3, buffer: "No" }, fc);
    await setDates(b.key, { start: "2026-06-04", due: "2026-06-05", duration: 2, buffer: "No" }, fc);
    await linkBlocks(a.key, b.key); // A blocks B
    await waitForTerminal(async () => (await searchJql(`key in (${a.key},${b.key})`, ["summary"], 2)).length === 2,
      { timeout: 20_000, label: "issues indexed" });

    const cf = await createFixtureRetry("lag", `key in (${a.key}, ${b.key})`, [a.key, b.key]);
    const pid: string = cf.planId;
    planId = pid;
    const bIndexed = (cf.issues || []).find((i: any) => i.key === b.key);
    expect(bIndexed?.predecessors, "B is blocked by A in the plan").toContain(a.key);

    const bAfterSettle = async () => {
      const st = await getTestState("lz-ppm", { what: "settle", planId: pid });
      return (st.issues || []).find((i: any) => i.key === b.key);
    };
    const setLag = (lag: string) => getTestState("lz-ppm", { what: "setLag", planId: pid, fromKey: a.key, toKey: b.key, lag });

    // Baseline (lag 0): B follows A with the default adjacency.
    await setLag("0");
    const b0 = await bAfterSettle();
    const adjacencyStart = b0.startDate;
    expect(adjacencyStart, "B has a start after settle").toBeTruthy();

    // lag = 3 working days: B must start 3 working days LATER than the adjacency start.
    await setLag("3");
    const b3 = await bAfterSettle();
    console.log(`lag=0 B.start=${adjacencyStart} | lag=3 B.start=${b3.startDate}`);
    // 3 working days after Thu 2026-06-04 = Tue 2026-06-09.
    expect(b3.startDate, "lag=3 pushes B's start 3 working days out").toBe("2026-06-09");
    expect(b3.startDate > adjacencyStart, "lagged start is later than adjacency").toBe(true);

    // Restore lag=0: B returns to the exact adjacency start (lag=0 == today's behaviour).
    await setLag("0");
    const bRestored = await bAfterSettle();
    expect(bRestored.startDate, "lag=0 restores the exact adjacency start").toBe(adjacencyStart);
  } finally {
    if (planId) await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    await deleteIssue(a.key).catch(() => {});
    await deleteIssue(b.key).catch(() => {});
  }
});

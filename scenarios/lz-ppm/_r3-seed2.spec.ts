// ROUND-3 bed 2 — designed for the rungs the 16-chain bed cannot reach.
//   A01..A13  contiguous FUTURE chain that ENDS AT THE PLAN FINISH  -> slack 0 on
//             every member, uniform  -> "no single ticket is tighter than the rest"
//   B01..B13  contiguous FUTURE chain that finishes EARLIER (slack > 0)
//   X         blocked by B03, due ON the plan finish -> the ONE strictly tighter
//             member of its beat -> the same line must NAME it
//   S01..S05  a 5-ticket run, under the 12 floor -> "1 shorter run ... holds 5"
//   O01..O14  14 standalone OVERDUE tickets -> the notes ladder's rung 2
import { test, expect } from "../../fixtures/forge";
import { createIssue, setDates, linkBlocks } from "../../data/jira-build.mjs";
// @ts-ignore
import { get, searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import * as fs from "fs";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

const iso = (d: Date) => d.toISOString().slice(0, 10);
const weekly = (monday: string, i: number) => {
  const s = new Date(Date.parse(`${monday}T00:00:00Z`) + i * 7 * 86400000);
  return { start: iso(s), due: iso(new Date(s.getTime() + 4 * 86400000)) };
};
const PLAN_FINISH = weekly("2027-01-04", 12); // A13's span — the plan's last dates

test("R3-SEED2 two future chains, a fan, a short run and 14 overdue", async () => {
  const tag = `R3-${Date.now().toString(36)}`;
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const mk = async (n: number, prefix: string, name: (i: number) => string) => {
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      const j: any = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `[harness-test] ${tag} ${prefix}${String(i + 1).padStart(2, "0")} ${name(i)}` });
      keys.push(j.key);
    }
    return keys;
  };
  const a = await mk(13, "A", (i) => `Billing migration — step ${i + 1}`);
  const b = await mk(13, "B", (i) => `Depot rollout — step ${i + 1}`);
  const x = await mk(1, "X", () => "Regulator sign-off window");
  const sh = await mk(5, "S", (i) => `Signage refresh — step ${i + 1}`);
  const o = await mk(14, "O", (i) => `Backlog cleanup item ${i + 1}`);

  for (let i = 0; i < 13; i++) await setDates(a[i], weekly("2027-01-04", i) as any, fc);
  for (let i = 0; i < 13; i++) await setDates(b[i], weekly("2026-11-02", i) as any, fc);
  await setDates(x[0], PLAN_FINISH as any, fc);            // ON the plan finish -> slack 0
  for (let i = 0; i < 5; i++) await setDates(sh[i], weekly("2026-12-07", i) as any, fc);
  for (let i = 0; i < 14; i++) await setDates(o[i], weekly("2026-07-06", i % 4) as any, fc); // all in the past

  for (const chain of [a, b, sh]) for (let i = 1; i < chain.length; i++) await linkBlocks(chain[i - 1], chain[i]);
  await linkBlocks(b[2], x[0]);                             // the fan off B03

  const all = [...a, ...b, ...x, ...sh, ...o];
  const jql = `key in (${all.join(",")})`;
  await waitForTerminal(async () => {
    const found = await searchJql(jql, ["summary"], 100);
    if (new Set(found.map((i: any) => i.key)).size < all.length) return false;
    const xi: any = await get(`/rest/api/3/issue/${x[0]}?fields=issuelinks`);
    return (xi.fields.issuelinks || []).some((l: any) => l.type?.name === "Blocks");
  }, { timeout: 420_000, interval: 3_000, label: "r3 bed2 propagation" });

  const planName = `[harness-test] ${tag} two futures a fan and fourteen overdue`;
  const cf: any = await getTestState("lz-ppm", { what: "createFixture", name: planName, jql });
  fs.writeFileSync(`${OUT}/bed2.json`, JSON.stringify({ tag, a, b, x, sh, o, all, planId: cf.planId, jql, planName, planFinish: PLAN_FINISH }, null, 2));
  console.log("SEEDED2", cf.planId, planName, "issues", all.length, "indexed", cf.meta?.issueCount);
  expect(cf.planId).toBeTruthy();
});

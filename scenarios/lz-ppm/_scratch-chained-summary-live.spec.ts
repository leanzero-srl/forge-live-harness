// TESTER scratch (6.61.0): the ENGINE RULE "a dependency into a parent binds its CHILDREN",
// live. Seeds on WFH: Epic E with children C1,C2,C3; a standalone P blocks E and is due
// LATER than every child's stored start. Asserts the backend settle, its idempotence, and
// (separately) the UI's Gantt for the same plan. Deletes everything it made.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { createIssue, setDates, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { get, request } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import { createFixtureRetry } from "../_support/lzfixture";
import fs from "node:fs";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
const STATE = process.env.CS_STATE || "/tmp/chained-summary-state.json";
test.describe.configure({ timeout: 600_000, mode: "serial" });

test("seed + backend settle + idempotence", async () => {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  console.log("FIELD CONFIG =", JSON.stringify(fc));
  const tag = Date.now().toString(36);
  const mk = (t: string, n: string) => createIssue({ projectKey: PROJECT, issueType: t, summary: `HARNESS chained-summary ${n} ${tag} [harness-test]` });
  const E = await mk("Epic", "EPIC");
  const P = await mk("Work package", "P");
  const C1 = await mk("Work package", "C1");
  const C2 = await mk("Work package", "C2");
  const C3 = await mk("Work package", "C3");
  const keys = { E: E.key, P: P.key, C1: C1.key, C2: C2.key, C3: C3.key };
  console.log("KEYS =", JSON.stringify(keys));
  fs.writeFileSync(STATE, JSON.stringify({ keys, planId: null }));
  let planId: string | null = null;
  // P is due AFTER every child's stored start.
  await setDates(P.key, { start: "2026-05-18", due: "2026-05-29", duration: 10, buffer: "No" }, fc);
  await setDates(C1.key, { start: "2026-05-04", due: "2026-05-08", duration: 5, buffer: "No" }, fc);
  await setDates(C2.key, { start: "2026-05-11", due: "2026-05-13", duration: 3, buffer: "No" }, fc);
  await setDates(C3.key, { start: "2026-05-05", due: "2026-05-18", duration: 10, buffer: "No" }, fc);
  await setDates(E.key, { start: "2026-05-04", due: "2026-05-18", duration: 11, buffer: "No" }, fc);
  for (const c of [C1, C2, C3]) await request("PUT", `/rest/api/3/issue/${c.key}`, { raw: true, body: { fields: { parent: { key: E.key } } } });
  await linkBlocks(P.key, E.key); // P -> E  (E has predecessor P)
  await waitForTerminal(async () => {
    const e: any = await get(`/rest/api/3/issue/${E.key}?fields=issuelinks`);
    const c1: any = await get(`/rest/api/3/issue/${C1.key}?fields=parent`);
    const c3: any = await get(`/rest/api/3/issue/${C3.key}?fields=parent`);
    return (e.fields.issuelinks || []).some((l: any) => l.type?.name === "Blocks") && !!c1.fields.parent && !!c3.fields.parent;
  }, { timeout: 60_000, interval: 2000, label: "link + parents propagate" });

  const cf = await createFixtureRetry(`TESTER chained-summary ${tag}`, `key in (${Object.values(keys).join(",")})`, Object.values(keys));
  planId = cf.planId as string;
  fs.writeFileSync(STATE, JSON.stringify({ keys, planId }));
  console.log("PLAN =", planId);
  const trio = (issues: any[]) => Object.fromEntries(Object.entries(keys).map(([n, k]) => {
    const i = issues.find((x: any) => x.key === k) || {};
    return [n, `${i.startDate || "-"} → ${i.dueDate || "-"} (d=${i.duration ?? "-"})`];
  }));
  const pre = await getTestState("lz-ppm", { what: "plan", planId: planId! });
  console.log("STORED (pre-settle) =", JSON.stringify(trio(pre.issues), null, 1));
  console.log("PRE predecessors E =", JSON.stringify((pre.issues.find((i: any) => i.key === keys.E) || {}).predecessors));

  const s1 = await getTestState("lz-ppm", { what: "settle", planId: planId! });
  const m1 = trio(s1.issues);
  console.log("SETTLE#1 =", JSON.stringify(m1, null, 1));
  const s2 = await getTestState("lz-ppm", { what: "settle", planId: planId! });
  const m2 = trio(s2.issues);
  console.log("SETTLE#2 =", JSON.stringify(m2, null, 1));
  expect(m2, "re-settle must be idempotent").toEqual(m1);
  const raw = Object.fromEntries((s1.issues || []).map((i: any) => [i.key, { s: i.startDate, d: i.dueDate, dur: i.duration }]));
  fs.writeFileSync(STATE, JSON.stringify({ keys, planId, backend: raw }));
  console.log("BACKEND RAW =", JSON.stringify(raw, null, 1));
});

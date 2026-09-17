// TESTER scratch: a CLEAN backend twin of the UI edit. Fresh fixture over the same issues,
// applyEdit P's FULL post-edit trio (start+due+duration, exactly what the UI's duration
// editor produced), settle, compare key-for-key with the UI preview.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import { createFixtureRetry } from "../_support/lzfixture";
import fs from "node:fs";
const STATE = process.env.CS_STATE || "/tmp/chained-summary-state.json";
test.describe.configure({ timeout: 300_000 });
test("backend twin of the UI edit", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const keys: Record<string, string> = st.keys;
  const all = Object.values(keys);
  const cf = await createFixtureRetry(`TESTER chained-summary PAR ${Date.now().toString(36)}`, `key in (${all.join(",")})`, all);
  const plan = cf.planId as string;
  fs.writeFileSync(STATE, JSON.stringify({ ...st, parPlan: plan }));
  console.log("PARITY PLAN =", plan);
  await getTestState("lz-ppm", { what: "applyEdit", planId: plan, key: keys.P, field: "dueDate", value: "2026-06-02" });
  await getTestState("lz-ppm", { what: "applyEdit", planId: plan, key: keys.P, field: "duration", value: "12" });
  const s1 = await getTestState("lz-ppm", { what: "settle", planId: plan });
  const be = Object.fromEntries((s1.issues || []).map((i: any) => [i.key, { s: i.startDate, d: i.dueDate, dur: i.duration }]));
  console.log("BACKEND =", JSON.stringify(be, null, 1));
  const s2 = await getTestState("lz-ppm", { what: "settle", planId: plan });
  const be2 = Object.fromEntries((s2.issues || []).map((i: any) => [i.key, { s: i.startDate, d: i.dueDate, dur: i.duration }]));
  console.log("IDEMPOTENT =", JSON.stringify(be2) === JSON.stringify(be));
  const UI: any = {
    [keys.E]: { s: "2026-06-03", d: "2026-06-16" },
    [keys.P]: { s: "2026-05-18", d: "2026-06-02" },
    [keys.C1]: { s: "2026-06-03", d: "2026-06-09" },
    [keys.C2]: { s: "2026-06-03", d: "2026-06-05" },
    [keys.C3]: { s: "2026-06-03", d: "2026-06-16" },
  };
  const diffs: string[] = [];
  for (const k of all) if (be[k].s !== UI[k].s || be[k].d !== UI[k].d) diffs.push(`${k}: BE ${be[k].s}→${be[k].d} vs UI ${UI[k].s}→${UI[k].d}`);
  console.log("DIFFS =", diffs.length ? diffs.join(" | ") : "(none — byte-identical)");
  expect(JSON.stringify(be2)).toBe(JSON.stringify(be));
  expect(diffs).toEqual([]);
});

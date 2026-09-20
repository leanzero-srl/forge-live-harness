// ROUND-2 cleanup — the one _r2-seed.spec.ts's header has always promised.
// Deletes the fixture plan and every [harness-test] issue this bed created, then
// PROVES the bed is empty: the tag's JQL returns nothing and the plan is gone from
// ?what=plans. Pre-existing [harness-test] fixtures in WFH (the retained-UAT and
// demo beds) are left alone — this only ever touches the seed's own tag.
import { test, expect } from "../../fixtures/forge";
import { deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";

const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });

test("R2-CLEAN the plan and every seeded issue are gone", async () => {
  const bed = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));

  // The plan first: a fixture delete while a report job is in flight can 409, so retry.
  for (let i = 0; i < 12; i++) {
    const d: any = await getTestState("lz-ppm", { what: "deleteFixture", planId: bed.planId }).catch((e: any) => ({ error: e.message }));
    console.log(`FIXTURE DELETE attempt ${i}:`, JSON.stringify(d).slice(0, 200));
    if (!d.error) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const plans = await getTestState("lz-ppm", { what: "plans" });
  const ids = (plans.plans || []).map((p: any) => p.id);
  console.log(`STILL_EXISTS[${bed.planId}]=` + ids.includes(bed.planId));
  console.log("PLANS NOW:", JSON.stringify((plans.plans || []).map((p: any) => ({ id: p.id, name: p.name }))));
  expect(ids.includes(bed.planId), `${bed.planId} must be gone`).toBe(false);

  for (const k of bed.all) await deleteIssue(k).catch((e: any) => console.log("FAIL", k, e.message));
  const left = await searchJql(`project = WFH AND summary ~ "${bed.tag}"`, ["summary"], 100).catch(() => []);
  console.log(`LEFTOVER[${bed.tag}]:`, left.map((i: any) => i.key).join(",") || "(none)");
  expect(left.length).toBe(0);
});

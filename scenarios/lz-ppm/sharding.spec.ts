// lz-ppm DEEP — KVS sharding at scale. The shard-assignment (m3), batched shard writes (M9), and
// cross-shard getAllIssues paths are only exercised by tiny plans elsewhere. This indexes a
// project-wide plan (>1 shard, SHARD_SIZE=100) and asserts every issue is retrievable across shards
// with a correct shard count and no duplicates/losses. Read-only (indexing doesn't mutate issues).
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
const SHARD_SIZE = 100;
test.describe.configure({ timeout: 180_000 });

test("🔎 a multi-shard plan retrieves every issue across shards (sharding correctness)", async () => {
  const cf = await getTestState("lz-ppm", { what: "createFixture", name: "shard-test", jql: `project = ${PROJECT}` });
  const planId = cf.planId;
  try {
    const issueCount = cf.meta?.issueCount ?? 0;
    const shardCount = cf.meta?.shardCount ?? 0;
    const returned = (cf.issues || []).length;
    console.log(`sharding → issueCount=${issueCount} shardCount=${shardCount} returned=${returned}`);

    expect(issueCount, "the plan must exceed one shard for this to be a multi-shard test").toBeGreaterThan(SHARD_SIZE);
    // shardCount = ceil(issues / SHARD_SIZE)
    expect(shardCount, "shard count must equal ceil(issues / SHARD_SIZE)").toBe(Math.ceil(issueCount / SHARD_SIZE));
    // getAllIssues spans every shard — no issue dropped at a shard boundary
    expect(returned, "getAllIssues returns every indexed issue across all shards").toBe(issueCount);

    // Independent cross-shard re-read via the plan endpoint: same count, all keys unique.
    const plan = await getTestState("lz-ppm", { what: "plan", planId });
    const keys = new Set((plan.issues || []).map((i: any) => i.key));
    expect(keys.size, "no duplicate or lost keys across shards").toBe(issueCount);
  } finally {
    if (planId) await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
  }
});

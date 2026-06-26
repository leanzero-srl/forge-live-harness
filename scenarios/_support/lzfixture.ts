// Deterministic plan-fixture creation for lz-ppm specs. Jira's search index is eventually
// consistent, so `createFixture` (which re-queries the source JQL) can occasionally index FEWER
// issues than expected. This retries until every expected key is actually in the plan index,
// eliminating the `applyEdit -> 404 "issue not in plan index"` flake.
import { getTestState } from "../../testhook/client";

export async function createFixtureRetry(name: string, jql: string, expectedKeys: string[]) {
  let last: any;
  for (let attempt = 0; attempt < 10; attempt++) {
    const cf = await getTestState("lz-ppm", { what: "createFixture", name, jql });
    const indexed = new Set((cf.issues || []).map((i: any) => i.key));
    if (expectedKeys.every((k) => indexed.has(k))) return cf;
    last = [...indexed];
    await getTestState("lz-ppm", { what: "deleteFixture", planId: cf.planId }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`createFixtureRetry(${name}): expected [${expectedKeys.join(",")}] but indexed [${last?.join(",")}] after retries`);
}

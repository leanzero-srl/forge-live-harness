import { test, expect } from "../../fixtures/forge";
import { deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/critic2";
test.describe.configure({ retries: 0, timeout: 900_000 });
test("CRITIC2 cleanup", async () => {
  const st = JSON.parse(fs.readFileSync(`${SHOT}/bed.json`, "utf8"));
  const d: any = await getTestState("lz-ppm", { what: "deleteFixture", planId: st.planId });
  console.log("PLAN DELETED", JSON.stringify(d));
  for (const k of st.all) { await deleteIssue(k).then(() => console.log("del", k)).catch((e: any) => console.log("FAIL", k, e.message)); }
  const left = await searchJql(`project = WFH AND summary ~ "${st.tag}"`, ["summary"], 100).catch(() => []);
  console.log("LEFTOVER:", left.map((i: any) => i.key).join(",") || "(none)");
  expect(left.length).toBe(0);
});

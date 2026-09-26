import { test, expect } from "../../fixtures/forge";
// @ts-ignore
import { request as jiraRequest } from "../../data/jira.mjs";
import * as fs from "fs";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/critic2";
test.describe.configure({ retries: 0, timeout: 600_000 });

const adf = (t: string) => ({ type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

test("CRITIC2 post two realistic comments on the hold-up tickets", async () => {
  const ids: any[] = [];
  const posts: [string, string][] = [
    ["WFH-3248", "Vendor SDK for the Android opt-in flow is still on the old push API. Their support says a compatible build lands the week of 26 Oct, which is after our window. I have asked for a beta so we can start integration early - if that does not come through we lose about a week here and everything behind it moves."],
    ["WFH-3248", "Security review came back with one condition: we must show the opt-in copy in the user's locale before the prompt. That is a small change but it needs the localisation team, and they are booked until the end of the month."],
    ["WFH-3232", "Exception queue is functionally complete but we are holding sign-off until finance reruns the August close against it. Ana is back on Monday and has agreed to do that first thing. I would not call this blocked, just waiting on one person."],
    ["WFH-3232", "Two of the three open defects are cosmetic. The third one double counts credit notes when the invoice was already partially matched - that one is real and I have put it on the board for this week."],
  ];
  for (const [key, text] of posts) {
    const r: any = await jiraRequest("POST", `/rest/api/3/issue/${key}/comment`, { body: { body: adf(text) } });
    ids.push({ key, id: r.id });
    console.log("COMMENTED", key, r.id);
  }
  fs.writeFileSync(`${SHOT}/comments.json`, JSON.stringify(ids, null, 2));
  expect(ids.length).toBe(4);
});

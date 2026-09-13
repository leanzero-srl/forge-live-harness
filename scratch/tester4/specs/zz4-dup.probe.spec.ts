// TESTER PROBE: what happens if the user CLICKS the project button that the app
// renders underneath "Created WFH-xxxx"? The buttons are attached before the
// handed-over agent runs, so they survive a turn that already created the item.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import { get, del } from "../../data/jira.mjs";
import * as fs from "fs";

const T = getTarget("chatwise-global");
const OUT = process.env.T4_OUT || "/tmp/t4";
const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9_]{1,9}-\d+)\b/g;
test.describe.configure({ timeout: 1_800_000 });

async function ask(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId, message, personaId: "product-owner", personaLocked: true,
  });
  expect(sent?.success).toBeTruthy();
  let data: any = null;
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  expect(data?.status).toBe("completed");
  return { response: String(data.result?.response || ""), answerOptions: data.result?.answerOptions || null };
}
const flat = (g: any) => (Array.isArray(g) ? g.flatMap((x: any) => (x?.options || []).map(String)) : []);

test("DUPLICATE RISK: clicking the button rendered under 'Created X' creates a second item", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  console.log(`DEPLOYED BUILD IN THE DOM: ${(await frame.locator("#version-indicator").innerText()).trim()}`);
  const conversationId = `conv_t4_dup_${Date.now()}`;
  const created: string[] = [];
  const seen = async (text: string) => {
    for (const m of text.matchAll(ISSUE_KEY_RE)) {
      const k = m[1];
      if (created.includes(k)) continue;
      const issue: any = await get(`/rest/api/3/issue/${k}?fields=summary,project`).catch(() => null);
      if (issue?.key) { created.push(k); console.log(`  VERIFIED ${k} in ${issue.fields.project?.key}: "${issue.fields.summary}"`); }
    }
  };
  try {
    const t1 = await ask(frame, page, conversationId, 'create a work item in my name in the work for hire one, summary "[harness-test] t4 dup probe"');
    await seen(t1.response);
    const opts = flat(t1.answerOptions).filter((o) => /^Use project (CGL1|CGL2)\b/.test(o));
    console.log(`turn 1 reply: ${t1.response.slice(0, 220).replace(/\n/g, " ⏎ ")}`);
    console.log(`turn 1 buttons: ${JSON.stringify(flat(t1.answerOptions))}`);
    if (!created.length || !opts.length) test.skip(true, "the contradiction did not reproduce this round (nothing created, or no buttons)");
    // EXACTLY what the surface sends when the user clicks that button.
    const t2 = await ask(frame, page, conversationId, opts[0]);
    await seen(t2.response);
    console.log(`clicked: "${opts[0]}"`);
    console.log(`turn 2 reply: ${t2.response.slice(0, 400).replace(/\n/g, " ⏎ ")}`);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/t4_dup.json`, JSON.stringify({ conversationId, created, t1: t1.response, buttons: flat(t1.answerOptions), clicked: opts[0], t2: t2.response }, null, 2));
    console.log(`ISSUES THAT NOW EXIST FROM ONE REQUEST: ${JSON.stringify(created)}`);
  } finally {
    for (const k of created) console.log(`  cleanup ${k}: ${await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).then(() => "deleted").catch((e: any) => String(e).slice(0, 90))}`);
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  expect(created.length, `one request produced ${created.length} issues: ${created.join(", ")}`).toBe(1);
});

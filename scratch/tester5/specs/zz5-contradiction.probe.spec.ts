// TESTER5 — a turn whose reply names ONE project and asks about ISSUE TYPE must
// not render four buttons for OTHER projects with one of them badged Recommended.
// Seen live on v6.92.0, round 3 of the P0 probe.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import { get, del } from "../../data/jira.mjs";
import * as fs from "fs";

const T = getTarget("chatwise-global");
const OUT = process.env.T5_OUT || "/tmp/t5";
const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9_]{1,9}-\d+)\b/g;
test.describe.configure({ timeout: 1_800_000 });

async function ask(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", { conversationId, message, personaId: "product-owner", personaLocked: true });
  expect(sent?.success).toBeTruthy();
  let data: any = null;
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  return { response: String(data?.result?.response || ""), answerOptions: data?.result?.answerOptions || null };
}
const flat = (g: any) => (Array.isArray(g) ? g.flatMap((x: any) => (x?.options || []).map(String)) : []);
const qs = (g: any) => (Array.isArray(g) ? g.map((x: any) => String(x?.question || "")) : []);
const projOpts = (g: any) => flat(g).filter((o) => /^Use project [A-Z]/.test(o));

test("CONTRADICTION: buttons for other projects under a reply that already names one", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  console.log(`DEPLOYED BUILD IN THE DOM: ${(await frame.locator("#version-indicator").innerText()).trim()}`);
  const created: string[] = [];
  const rows: any[] = [];
  try {
    for (let i = 1; i <= 4; i++) {
      const conversationId = `conv_t5_con_${Date.now()}_${i}`;
      const r = await ask(frame, page, conversationId, `create a work item in my name in the work for hire one, summary "[harness-test] t5 contradiction r${i}"`);
      if (/token allowance/i.test(r.response) && !/ALREADY MADE/i.test(r.response)) { console.log(`round ${i}: QUOTA`); continue; }
      for (const m of r.response.matchAll(ISSUE_KEY_RE)) {
        const k = m[1];
        if (created.includes(k)) continue;
        const iss: any = await get(`/rest/api/3/issue/${k}?fields=summary,project`).catch(() => null);
        if (iss?.key) { created.push(k); console.log(`  VERIFIED ${k} in ${iss.fields.project?.key}`); }
      }
      const po = projOpts(r.answerOptions);
      const namesWFH = /\bWFH\b|WORK FOR HIRE/i.test(r.response);
      const offersOthers = po.some((o) => !/^Use project WFH\b/.test(o));
      console.log(`--- round ${i}: replyNamesWFH=${namesWFH} offersOtherProjects=${offersOthers}`);
      console.log(`  reply: ${r.response.slice(0, 300).replace(/\n/g, " ⏎ ")}`);
      console.log(`  question: ${JSON.stringify(qs(r.answerOptions))}`);
      console.log(`  options: ${JSON.stringify(po)}`);
      rows.push({ i, reply: r.response, questions: qs(r.answerOptions), projectOptions: po, namesWFH, offersOthers, wroteSomething: created.length });
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/t5_contradiction.json`, JSON.stringify(rows, null, 2));
  } finally {
    for (const k of created) console.log(`  cleanup ${k}: ${await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).then(() => "deleted").catch((e: any) => String(e).slice(0, 120))}`);
  }
  const bad = rows.filter((r) => r.namesWFH && r.offersOthers);
  console.log(`CONTRADICTORY TURNS: ${bad.length}/${rows.length}`);
  expect(rows.length).toBeGreaterThan(0);
  for (const r of bad) console.log(`  BAD round ${r.i}: reply names WFH, buttons offer ${JSON.stringify(r.projectOptions)}`);
  expect(bad.length, `a reply that named WFH offered buttons for other projects, first badged Recommended`).toBe(0);
});

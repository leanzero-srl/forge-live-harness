// TESTER PROBE (confirmation pass, v6.90.0): the four residual facilitator fixes.
//
// PRIMARY TARGET: TURN ONE WITH GENUINELY EMPTY HISTORY. The old probe put
// "hello" in front of the message, so history was never empty when the handoff
// judgement was made. Here every conversation id is brand new and the message
// under test is the FIRST thing the wizard ever sees.
//
// Resolver-driven on purpose: `answerOptions` is a structured field on the job
// row, so the options can be read as DATA (keys, order, question text) rather
// than scraped out of prose. A separate UI test proves they render clickable.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import { get, del } from "../../data/jira.mjs";
import * as fs from "fs";

const T = getTarget("chatwise-global");
const OUT = process.env.T4_OUT || "/tmp/t4";
const WIZARD = /🧭 Epic Facilitator|📋 Epic Preview/;
const QUOTA = /token allowance|Nothing was lost/i;
const ROUNDS = Number(process.env.T4_ROUNDS || 2);
const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9_]{1,9}-\d+)\b/g;

test.describe.configure({ timeout: 3_600_000 });

function rec(name: string, payload: unknown) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(payload, null, 2));
}

async function ask(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId,
    message,
    personaId: "product-owner",
    personaLocked: true,
  });
  expect(sent?.success, `enqueue failed: ${sent?.error}`).toBeTruthy();
  let data: any = null;
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  expect(data?.status, `job did not complete: ${data?.error}`).toBe("completed");
  const response = String(data.result?.response || "");
  const answerOptions = data.result?.answerOptions || null;
  return { response, answerOptions, model: data.result?.model, raw: data.result };
}

/** Every option label across every group, flattened. */
function flatOptions(groups: any): string[] {
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((g: any) => (Array.isArray(g?.options) ? g.options.map(String) : []));
}
function questions(groups: any): string[] {
  if (!Array.isArray(groups)) return [];
  return groups.map((g: any) => String(g?.question || ""));
}
function projectKeysFromOptions(groups: any): string[] {
  return flatOptions(groups)
    .map((o) => /^Use project ([A-Z][A-Z0-9_]{1,9})\b/.exec(o)?.[1] || null)
    .filter(Boolean) as string[];
}

let REAL_KEYS: string[] = [];
let REAL_TOTAL = 0;
test.beforeAll(async () => {
  const r: any = await get("/rest/api/3/project/search?maxResults=100");
  REAL_KEYS = (r.values || []).map((p: any) => String(p.key).toUpperCase());
  REAL_TOTAL = Number(r.total);
  console.log(`GROUND TRUTH: ${REAL_TOTAL} projects :: ${REAL_KEYS.join(",")}`);
});

async function boot(page: any) {
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  console.log(`DEPLOYED BUILD IN THE DOM: ${(await frame.locator("#version-indicator").innerText()).trim()}`);
  return frame;
}

/* ------------------------------------------------------------------ */
/* CHECK 1a — turn one, empty history, WORK ITEM                       */
/* ------------------------------------------------------------------ */
test("T1-WORKITEM: first message, empty history — not framed as an Epic, and offers real projects or creates it", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await boot(page);
  const rows: any[] = [];
  const created: string[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const conversationId = `conv_t4_wi_${Date.now()}_${i}`;
    const { response, answerOptions } = await ask(
      frame, page, conversationId,
      'hello, can you create a work item in my name? you choose the space, the summary should be "auto created - test"',
    );
    if (QUOTA.test(response)) test.skip(true, "site quota-blocked");
    const wizard = WIZARD.test(response);
    const keys = projectKeysFromOptions(answerOptions);
    const madeKeys = [...new Set(Array.from(response.matchAll(ISSUE_KEY_RE)).map((m) => m[1]))];
    const verified: string[] = [];
    for (const k of madeKeys) {
      const issue: any = await get(`/rest/api/3/issue/${k}?fields=summary,issuetype,project,assignee`).catch(() => null);
      if (issue?.key) {
        verified.push(k);
        created.push(k);
        console.log(`  VERIFIED IN JIRA ${k}: summary="${issue.fields.summary}" type=${issue.fields.issuetype?.name} project=${issue.fields.project?.key} assignee=${issue.fields.assignee?.displayName || "none"}`);
      }
    }
    rows.push({ round: i + 1, conversationId, wizardFramed: wizard, optionKeys: keys,
      questions: questions(answerOptions), options: flatOptions(answerOptions),
      verifiedCreated: verified, response });
    console.log(`round ${i + 1}: wizardFramed=${wizard} options=${keys.length} created=${JSON.stringify(verified)}`);
    console.log(`  reply head: ${response.slice(0, 400).replace(/\n/g, " ⏎ ")}`);
    console.log(`  options: ${JSON.stringify(flatOptions(answerOptions))}`);
    console.log(`  question: ${JSON.stringify(questions(answerOptions))}`);
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  rec("t1_workitem", rows);
  for (const k of created) await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).catch(() => {});
  // Every round: not an Epic interview, AND something actionable happened.
  for (const r of rows) {
    expect(r.wizardFramed, `round ${r.round} framed a work item as an Epic interview: ${r.response.slice(0, 300)}`).toBe(false);
    expect(
      r.optionKeys.length > 0 || r.verifiedCreated.length > 0,
      `round ${r.round} offered no project options and created nothing: ${r.response.slice(0, 300)}`,
    ).toBeTruthy();
    for (const k of r.optionKeys) expect(REAL_KEYS, `invented project key ${k}`).toContain(k);
  }
});

/* ------------------------------------------------------------------ */
/* CHECK 1b — turn one, empty history, EPIC intent must still INTERVIEW */
/* ------------------------------------------------------------------ */
test("T1-EPIC: first message, empty history — an epic request is still INTERVIEWED", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await boot(page);
  const rows: any[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const conversationId = `conv_t4_ep_${Date.now()}_${i}`;
    const { response, answerOptions } = await ask(frame, page, conversationId, "I want to create an epic for supplier onboarding");
    if (QUOTA.test(response)) test.skip(true, "site quota-blocked");
    const wizard = WIZARD.test(response);
    rows.push({ round: i + 1, conversationId, interviewed: wizard, options: flatOptions(answerOptions), questions: questions(answerOptions), response });
    console.log(`round ${i + 1}: ${wizard ? "INTERVIEWED" : "HANDED OFF"} :: ${response.slice(0, 300).replace(/\n/g, " ⏎ ")}`);
    console.log(`  options: ${JSON.stringify(flatOptions(answerOptions))}`);
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  rec("t1_epic", rows);
  for (const r of rows) {
    for (const o of r.options) {
      const k = /^Use project ([A-Z][A-Z0-9_]{1,9})\b/.exec(o)?.[1];
      if (k) expect(REAL_KEYS, `invented project key ${k}`).toContain(k);
    }
  }
  expect(rows.filter((r) => r.interviewed).length, `an epic request was handed away on turn one: ${JSON.stringify(rows.map((r) => r.interviewed))}`).toBe(ROUNDS);
});

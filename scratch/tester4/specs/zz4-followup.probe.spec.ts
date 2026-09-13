// TESTER PROBE (confirmation pass, v6.90.0) — follow-ups:
//  A. CHECK 3 again, in WFH only (COGTEST cannot be cleaned up by this account).
//  B. TURN ONE IN GERMAN — the language the last gate regression lived in.
//  C. CHECK 2 in the REAL UI: the options are clickable, and clicking one is
//     heard. Plus: no app-authored sentence carries an invented issue key.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP, awaitSwapSettled, callResolver, openGlobalPage, readAppState,
  settleBootSelection, waitForChatApp,
} from "./chatwise-support";
// eslint-disable-next-line
import { get, del } from "../../data/jira.mjs";
import * as fs from "fs";

const T = getTarget("chatwise-global");
const OUT = process.env.T4_OUT || "/tmp/t4";
const QUOTA = /token allowance|Nothing was lost/i;
const WIZARD = /🧭 Epic Facilitator|📋 Epic Preview/;
const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9_]{1,9}-\d+)\b/g;

test.describe.configure({ timeout: 3_600_000 });

async function ask(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId, message, personaId: "product-owner", personaLocked: true,
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
  return { response: String(data.result?.response || ""), answerOptions: data.result?.answerOptions || null };
}
const flat = (g: any) => (Array.isArray(g) ? g.flatMap((x: any) => (x?.options || []).map(String)) : []);
const qs = (g: any) => (Array.isArray(g) ? g.map((x: any) => String(x?.question || "")) : []);
const projOpts = (g: any) => flat(g).filter((o) => /^Use project [A-Z]/.test(o));
async function verifyKeys(text: string, into: string[]) {
  for (const m of text.matchAll(ISSUE_KEY_RE)) {
    const k = m[1];
    if (into.includes(k)) continue;
    const issue: any = await get(`/rest/api/3/issue/${k}?fields=summary,project`).catch(() => null);
    if (issue?.key) { into.push(k); console.log(`  VERIFIED ${k} in ${issue.fields.project?.key}: "${issue.fields.summary}"`); }
    else console.log(`  KEY IN REPLY DOES NOT EXIST IN JIRA: ${k}`);
  }
}

test("A. CHECK 3 (round 2, WFH): established project leads, with reason and count", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  console.log(`DEPLOYED BUILD IN THE DOM: ${(await frame.locator("#version-indicator").innerText()).trim()}`);
  const conversationId = `conv_t4_b2_${Date.now()}`;
  const created: string[] = [];
  let hit: any = null;
  const log: any[] = [];
  try {
    for (const msg of [
      'create a work item in my name in the work for hire one, summary "[harness-test] t4 basis 2"',
      "now let's shape an epic for supplier onboarding — but first ask me which project it should be created in",
      "which project should the epic be created in? show me the options",
    ]) {
      const { response, answerOptions } = await ask(frame, page, conversationId, msg);
      if (QUOTA.test(response)) test.skip(true, "site quota-blocked");
      await verifyKeys(response, created);
      const po = projOpts(answerOptions);
      log.push({ msg, response, questions: qs(answerOptions), projectOptions: po });
      console.log(`--- "${msg}"\n  reply: ${response.slice(0, 260).replace(/\n/g, " ⏎ ")}\n  projectOptions: ${JSON.stringify(po)}\n  questions: ${JSON.stringify(qs(answerOptions))}`);
      // Only a LATER turn counts: on the creating turn itself the app has not
      // yet seen its own reply, so "established" is legitimately empty.
      if (po.length && created.length && log.length > 1) { hit = log[log.length - 1]; break; }
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/t4_basis2.json`, JSON.stringify({ conversationId, created, log }, null, 2));
  } finally {
    for (const k of created) console.log(`  cleanup ${k}: ${await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).then(() => "deleted").catch((e: any) => String(e).slice(0, 100))}`);
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  const worked = created[created.length - 1]?.split("-")[0];
  expect(hit, `no turn offered project options after ${created.join(",")}`).toBeTruthy();
  expect(hit.projectOptions[0]).toContain(`Use project ${worked}`);
  expect(hit.questions.join(" ")).toContain(`${worked} is the project this conversation has been working in`);
  expect(hit.questions.join(" ")).toMatch(/Showing \d+ of \d+/);
});

test("B. TURN ONE IN GERMAN: a work item hands off, an Epic is still interviewed", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const created: string[] = [];
  const rows: any[] = [];
  const cases = [
    { name: "DE-workitem-1", msg: 'hallo, kannst du in meinem Namen ein Arbeitselement anlegen? Du wählst den Bereich aus, die Zusammenfassung soll "auto created - test" lauten' },
    { name: "DE-workitem-2", msg: 'hallo, kannst du in meinem Namen ein Arbeitselement anlegen? Du wählst den Bereich aus, die Zusammenfassung soll "auto created - test" lauten' },
    { name: "DE-epic", msg: "Ich möchte ein Epic für Lieferanten-Onboarding anlegen" },
  ];
  for (const c of cases) {
    const conversationId = `conv_t4_de_${Date.now()}_${c.name}`;
    const { response, answerOptions } = await ask(frame, page, conversationId, c.msg);
    if (QUOTA.test(response)) test.skip(true, "site quota-blocked");
    await verifyKeys(response, created);
    const po = projOpts(answerOptions);
    rows.push({ ...c, wizardFramed: WIZARD.test(response), projectOptions: po, questions: qs(answerOptions), options: flat(answerOptions), response });
    console.log(`--- ${c.name}: wizardFramed=${WIZARD.test(response)}`);
    console.log(`  reply: ${response.slice(0, 400).replace(/\n/g, " ⏎ ")}`);
    console.log(`  projectOptions: ${JSON.stringify(po)}`);
    console.log(`  questions: ${JSON.stringify(qs(answerOptions))}`);
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/t4_german.json`, JSON.stringify(rows, null, 2));
  for (const k of created) console.log(`  cleanup ${k}: ${await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).then(() => "deleted").catch((e: any) => String(e).slice(0, 100))}`);
  const wis = rows.filter((r) => r.name.startsWith("DE-workitem") && !/couldn't reach the AI service/.test(r.response));
  const ep = rows[rows.length - 1];
  expect(wis.length, "every German work-item round failed to reach the model").toBeGreaterThan(0);
  for (const wi of wis) {
    expect(wi.wizardFramed, `the German work-item request was framed as an Epic interview: ${wi.response.slice(0, 300)}`).toBe(false);
    expect(wi.projectOptions.length > 0 || created.length > 0, `German turn one offered no options and created nothing: ${wi.response.slice(0, 300)}`).toBeTruthy();
  }
  expect(ep.wizardFramed, `the German Epic request was handed away: ${ep.response.slice(0, 300)}`).toBe(true);
});

test("C. CHECK 2 in the UI: turn-one options are real buttons, and a click is heard", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);
  await frame.locator('#promptCategories .welcome-prompt-category[data-category="write"]').click();
  await frame.locator("#welcomePrompts .welcome-prompt").filter({ hasText: /epic/i }).first().click();
  await expect(frame.locator("#dropdownSelected .selected-text")).toHaveText(/product owner/i, { timeout: 10_000 });
  const conversationId = (await readAppState<string | null>(frame, GLOBAL_APP, "app.getActiveConversationId()")) as string | null;
  const created: string[] = [];
  try {
    // FIRST message of the conversation, typed over the starter text.
    expect(await frame.locator(".message.user").count(), "history was not empty").toBe(0);
    await frame.locator("#chatInput").fill('hello, can you create a work item in my name? you choose the space, the summary should be "auto created - test"');
    await frame.locator("#sendButton").click();
    await expect.poll(async () => frame.locator(".message.assistant").count(), { timeout: 300_000 }).toBeGreaterThan(0);
    await expect.poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"), { timeout: 180_000 }).toBe(false);
    const last = frame.locator(".message.assistant").last();
    const text = (await last.innerText()) || "";
    await verifyKeys(text, created);
    const row = last.locator(".message-options");
    const nOpts = (await row.count()) ? await row.locator(".option-btn").count() : 0;
    const labels = nOpts ? await row.locator(".option-btn .option-btn-text").allInnerTexts() : [];
    const question = (await row.count()) ? await row.locator(".option-question").first().innerText() : "";
    const recommended = nOpts ? await row.locator(".option-btn").first().innerText() : "";
    console.log(`UI reply: ${text.slice(0, 300).replace(/\n/g, " ⏎ ")}`);
    console.log(`UI question: ${question.replace(/\n/g, " ")}`);
    console.log(`UI options(${nOpts}): ${JSON.stringify(labels)}`);
    console.log(`UI first button (badge included): ${JSON.stringify(recommended)}`);
    await page.screenshot({ path: `${OUT}/ui_turnone.png`, fullPage: false });
    fs.writeFileSync(`${OUT}/t4_ui.json`, JSON.stringify({ text, question, labels, recommended }, null, 2));
    expect(nOpts, `turn one rendered no clickable options: ${text.slice(0, 300)}`).toBeGreaterThan(0);
    // Click the WFH one if offered, otherwise the first; then read it back as the user's message.
    const wfh = row.locator(".option-btn").filter({ hasText: "WFH" });
    const target = (await wfh.count()) ? wfh.first() : row.locator(".option-btn").first();
    const clicked = (await target.locator(".option-btn-text").innerText()).trim();
    await target.click();
    await expect.poll(async () => (await frame.locator(".message.user").last().innerText()).trim(), { timeout: 30_000 }).toContain(clicked.slice(0, 20));
    await expect.poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"), { timeout: 300_000 }).toBe(false);
    const after = (await frame.locator(".message.assistant").last().innerText()) || "";
    await verifyKeys(after, created);
    console.log(`AFTER CLICK ("${clicked}"): ${after.slice(0, 400).replace(/\n/g, " ⏎ ")}`);
    fs.writeFileSync(`${OUT}/t4_ui_after.json`, JSON.stringify({ clicked, after, created }, null, 2));
  } finally {
    for (const k of created) console.log(`  cleanup ${k}: ${await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).then(() => "deleted").catch((e: any) => String(e).slice(0, 100))}`);
    if (conversationId) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
});

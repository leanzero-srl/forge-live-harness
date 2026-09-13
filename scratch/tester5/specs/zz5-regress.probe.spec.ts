// TESTER5 — regressions that must still hold on v6.92.0, plus German and ordering.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import { get, del } from "../../data/jira.mjs";
import * as fs from "fs";

const T = getTarget("chatwise-global");
const OUT = process.env.T5_OUT || "/tmp/t5";
const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9_]{1,9}-\d+)\b/g;
// PURE quota only: the honest-partial path ("...ALREADY MADE...") also quotes the quota sentence.
const QUOTA = { test: (t: string) => /token allowance/i.test(t) && !/ALREADY MADE/i.test(t) };
const WIZARD = /🧭 Epic Facilitator|📋 Epic Preview/;
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
let REAL_KEYS: string[] = [];

test("R1: turn one — a work item is NOT framed as an Epic; an Epic INTERVIEWS", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  console.log(`DEPLOYED BUILD IN THE DOM: ${(await frame.locator("#version-indicator").innerText()).trim()}`);
  const all: any = await get("/rest/api/3/project/search?maxResults=100");
  REAL_KEYS = all.values.map((p: any) => p.key);
  console.log(`REAL PROJECT KEYS (${REAL_KEYS.length}): ${REAL_KEYS.join(",")}`);
  const created: string[] = [];
  const rows: any[] = [];
  const cases = [
    { name: "EN-workitem", msg: 'hello, can you create a work item in my name? you choose the space, the summary should be "[harness-test] t5 r1 auto"' },
    { name: "EN-epic", msg: "I want to create an epic for supplier onboarding" },
  ];
  try {
    for (const c of cases) {
      const conversationId = `conv_t5_r1_${Date.now()}_${c.name}`;
      const r = await ask(frame, page, conversationId, c.msg);
      if (QUOTA.test(r.response)) { console.log(`${c.name}: QUOTA`); continue; }
      await verifyKeys(r.response, created);
      const po = projOpts(r.answerOptions);
      const offeredKeys = po.map((o) => (o.match(/^Use project ([A-Z][A-Z0-9_]*)/) || [])[1]).filter(Boolean);
      console.log(`--- ${c.name}: wizardFramed=${WIZARD.test(r.response)}`);
      console.log(`  reply: ${r.response.slice(0, 420).replace(/\n/g, " ⏎ ")}`);
      console.log(`  question: ${JSON.stringify(qs(r.answerOptions))}`);
      console.log(`  project options: ${JSON.stringify(po)}`);
      rows.push({ ...c, wizardFramed: WIZARD.test(r.response), reply: r.response, projectOptions: po, offeredKeys, questions: qs(r.answerOptions) });
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/t5_r1.json`, JSON.stringify({ REAL_KEYS, rows, created }, null, 2));
  } finally {
    for (const k of created) console.log(`  cleanup ${k}: ${await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).then(() => "deleted").catch((e: any) => String(e).slice(0, 120))}`);
  }
  const wi = rows.find((r) => r.name === "EN-workitem");
  const ep = rows.find((r) => r.name === "EN-epic");
  if (wi) expect(wi.wizardFramed, `a work item was framed as an Epic interview: ${wi.reply.slice(0, 300)}`).toBe(false);
  if (ep) expect(ep.wizardFramed, `the Epic request was handed away instead of interviewed: ${ep.reply.slice(0, 300)}`).toBe(true);
  for (const r of rows) for (const k of r.offeredKeys) expect(REAL_KEYS, `offered a project key that does not exist: ${k}`).toContain(k);
});

test("R2: options are ABSENT on 'approve' and on an unrelated turn", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const rows: any[] = [];
  const conversationId = `conv_t5_r2_${Date.now()}`;
  const created: string[] = [];
  try {
    const seq = [
      "I want to create an epic for supplier onboarding in WFH",
      "approve",
      "what's the weather like where you are?",
    ];
    for (const msg of seq) {
      const r = await ask(frame, page, conversationId, msg);
      if (QUOTA.test(r.response)) { console.log(`"${msg}": QUOTA`); continue; }
      await verifyKeys(r.response, created);
      const po = projOpts(r.answerOptions);
      console.log(`--- "${msg}"\n  reply: ${r.response.slice(0, 300).replace(/\n/g, " ⏎ ")}\n  project options: ${JSON.stringify(po)}`);
      rows.push({ msg, reply: r.response, projectOptions: po, allOptions: flat(r.answerOptions) });
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/t5_r2.json`, JSON.stringify(rows, null, 2));
  } finally {
    for (const k of created) console.log(`  cleanup ${k}: ${await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).then(() => "deleted").catch((e: any) => String(e).slice(0, 120))}`);
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  for (const r of rows.filter((x) => x.msg === "approve" || x.msg.startsWith("what's the weather"))) {
    expect(r.projectOptions, `"${r.msg}" rendered project buttons: ${JSON.stringify(r.projectOptions)}`).toEqual([]);
  }
});

test("R3: transitions/permissions — checkMyPermissions answers without writing; zero transitions gets a DIAGNOSIS", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  // Find an issue and record its status so we can prove nothing was written.
  const seeded: any = await get(`/rest/api/3/search/jql?jql=${encodeURIComponent('project = WFH ORDER BY created DESC')}&fields=summary,status&maxResults=1`);
  const target = seeded.issues[0];
  const before = target.fields.status.name;
  const tr: any = await get(`/rest/api/3/issue/${target.key}/transitions`);
  console.log(`target ${target.key} status="${before}" transitions=${JSON.stringify(tr.transitions.map((t: any) => t.name))}`);
  const rows: any[] = [];
  const conversationId = `conv_t5_r3_${Date.now()}`;
  try {
    for (const msg of [
      `do I have permission to transition and delete issues in ${target.key.split("-")[0]}? just tell me, don't change anything`,
      `why can't I move ${target.key} to a different status? what are my options?`,
    ]) {
      const r = await ask(frame, page, conversationId, msg);
      if (QUOTA.test(r.response)) { console.log(`"${msg}": QUOTA`); continue; }
      console.log(`--- "${msg}"\n  reply: ${r.response.slice(0, 600).replace(/\n/g, " ⏎ ")}`);
      rows.push({ msg, reply: r.response });
    }
    const after: any = await get(`/rest/api/3/issue/${target.key}?fields=status`);
    console.log(`${target.key} status BEFORE="${before}" AFTER="${after.fields.status.name}"`);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/t5_r3.json`, JSON.stringify({ target: target.key, before, after: after.fields.status.name, transitions: tr.transitions.map((t: any) => t.name), rows }, null, 2));
    expect(after.fields.status.name, "a read-only permission question CHANGED the issue status").toBe(before);
    expect(rows.length, "both permission rounds were quota-blocked").toBeGreaterThan(0);
    expect(rows[0].reply).not.toMatch(/I can't tell you why|I don't know why/i);
  } finally {
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
});

test("R4 (German): the project question comes back in German, with the real numbers", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const rows: any[] = [];
  const created: string[] = [];
  try {
    for (let i = 1; i <= 3; i++) {
      const conversationId = `conv_t5_de_${Date.now()}_${i}`;
      const r = await ask(frame, page, conversationId, "Ich möchte ein Epic für Lieferanten-Onboarding anlegen. In welchem Projekt soll es angelegt werden? Zeig mir bitte die Optionen.");
      if (QUOTA.test(r.response)) { console.log(`DE round ${i}: QUOTA`); continue; }
      await verifyKeys(r.response, created);
      const po = projOpts(r.answerOptions);
      const question = qs(r.answerOptions).join(" | ");
      const german = /\b(von|Projekt|welchem|Deine|Ihre|angelegt|zeigt|wähle|kannst)\b/i.test(question);
      const numbers = /\d+\s*(von|of)\s*\d+/i.test(question);
      console.log(`--- DE round ${i}`);
      console.log(`  reply: ${r.response.slice(0, 300).replace(/\n/g, " ⏎ ")}`);
      console.log(`  QUESTION VERBATIM: ${JSON.stringify(qs(r.answerOptions))}`);
      console.log(`  project options: ${JSON.stringify(po)}`);
      console.log(`  germanQuestion=${german} hasNumbers=${numbers}`);
      rows.push({ i, reply: r.response, question, questions: qs(r.answerOptions), projectOptions: po, german, numbers });
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/t5_de.json`, JSON.stringify(rows, null, 2));
  } finally {
    for (const k of created) console.log(`  cleanup ${k}: ${await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).then(() => "deleted").catch((e: any) => String(e).slice(0, 120))}`);
  }
  expect(rows.length, "every German round was quota-blocked").toBeGreaterThan(0);
  const withOpts = rows.filter((r) => r.projectOptions.length > 0);
  console.log(`GERMAN: ${withOpts.length}/${rows.length} rounds offered options; ${rows.filter((r) => r.german).length} asked in German; ${rows.filter((r) => r.numbers).length} carried the counts`);
  expect(withOpts.length, "no German round offered project options at all").toBeGreaterThan(0);
  for (const r of withOpts) {
    expect(r.german, `the German turn's question is not German: "${r.question}"`).toBe(true);
    expect(r.numbers, `the German question carries no "N von M": "${r.question}"`).toBe(true);
  }
});

test("R5: ordering — what the app actually offers first when nothing is established", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const rows: any[] = [];
  for (let i = 1; i <= 2; i++) {
    const conversationId = `conv_t5_ord_${Date.now()}_${i}`;
    const r = await ask(frame, page, conversationId, "I want to create an epic for supplier onboarding — which project should it go in? show me my options");
    if (QUOTA.test(r.response)) { console.log(`ORD round ${i}: QUOTA`); continue; }
    const po = projOpts(r.answerOptions);
    console.log(`--- ORD round ${i}\n  question: ${JSON.stringify(qs(r.answerOptions))}\n  project options IN ORDER: ${JSON.stringify(po)}`);
    rows.push({ i, projectOptions: po, questions: qs(r.answerOptions), reply: r.response });
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/t5_order.json`, JSON.stringify(rows, null, 2));
  // Reported, not asserted — the code deliberately reverted to name order.
  for (const r of rows) console.log(`FIRST OFFERED (badged Recommended): ${r.projectOptions[0] || "(none)"}`);
  expect(rows.length, "every ordering round was quota-blocked").toBeGreaterThan(0);
});

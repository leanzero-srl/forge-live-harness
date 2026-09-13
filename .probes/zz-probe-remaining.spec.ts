// TESTER PROBE — v6.98.0, the turns still owed:
//  A. consent restatement "destination only" (was REFUSED live on v6.95.0)
//  B. Assets collateral-clearing warning (the previousAttributes prose)
//  C. a deck that CANNOT render must not be offered as a download
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { get, post, del, request } from "../../data/jira.mjs";
import {
  GLOBAL_APP, assertLoggedIn, awaitSwapSettled, callResolver, deliverMessage,
  openGlobalPage, readAppState, readThread, waitForChatApp, waitForThread,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";
const DEST = "CGL1";
const QUOTA = /token allowance|Nothing was lost/i;
test.describe.configure({ timeout: 2_400_000 });

async function ask(frame: any, page: any, conversationId: string, message: string, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
      conversationId, message, personaId: "jira-scrubber", personaLocked: true });
    if (!sent?.success) throw new Error(`enqueue failed: ${JSON.stringify(sent?.error)}`);
    let data: any = null;
    const deadline = Date.now() + 420_000;
    while (Date.now() < deadline) {
      const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
      data = r?.data ?? null;
      if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
      await page.waitForTimeout(3000);
    }
    const text = String(data?.result?.response || data?.error || "");
    if (!QUOTA.test(text)) return { status: data?.status, text };
    console.log(`[quota] attempt ${i}/${tries} hit the tenant wall — waiting 150s`);
    await page.waitForTimeout(150_000);
  }
  return { status: "quota", text: "QUOTA" };
}

test("A. consent restatement — destination only", async ({ page }) => {
  const conversationId = `conv_harness_restate2_${Date.now()}`;
  let frame: any = null, victim: string | null = null;
  try {
    const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
    const stdType = (meta?.issueTypes || meta?.values || []).find((t: any) => t.hierarchyLevel === 0);
    const made: any = await post("/rest/api/3/issue", { fields: { project: { key: PROJECT },
      issuetype: { id: String(stdType.id) }, summary: `[harness-test] restate dest-only ${Date.now()}`,
      labels: ["harness-test"] } });
    victim = String(made.key);
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await callResolver(frame, GLOBAL_APP, "createConversation", { conversationId,
      title: "[harness-test] restate dest-only", personaId: "jira-scrubber" });
    const t1 = await ask(frame, page, conversationId, `Move issue ${victim} to project ${DEST} as a Task (type id 10005). Show me the full plan first and do not move anything yet.`);
    console.log(`--- TURN 1 ---\n${t1.text}\n`);
    test.skip(t1.text === "QUOTA", "tenant quota");
    const t2 = await ask(frame, page, conversationId, `Yes, move it into ${DEST} please.`);
    console.log(`--- TURN 2 "Yes, move it into ${DEST} please." ---\n${t2.text}\n`);
    test.skip(t2.text === "QUOTA", "tenant quota");
    const after: any = await get(`/rest/api/3/issue/${victim}?fields=project`).catch(() => null);
    const nowIn = after?.fields?.project?.key ?? "(gone)";
    console.log(`AFTER: ${victim} lives in ${nowIn}`);
    expect(nowIn, `the restated approval was refused — still in ${nowIn}. Reply: ${t2.text.slice(0, 400)}`).toBe(DEST);
  } finally {
    if (victim) await del(`/rest/api/3/issue/${victim}?deleteSubtasks=true`).catch(() => {});
    if (frame) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
});

test("B. Assets collateral-clearing warning names no field", async ({ page }) => {
  const conversationId = `conv_harness_assets2_${Date.now()}`;
  let frame: any = null, createdId: string | null = null;
  const stamp = Date.now();
  const bubbles: string[] = [];
  try {
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await callResolver(frame, GLOBAL_APP, "createConversation", { conversationId,
      title: "[harness-test] assets collateral", personaId: "jira-scrubber" });

    const c = await ask(frame, page, conversationId,
      `In Assets, create ONE object of type 77 (Confluence Space, schema IGOV) with Name ` +
      `"[harness-test] collateral ${stamp}", Space Key "HTC${stamp % 100000}", Classification INTERNAL ` +
      `and Data Owner "Harness Tester". Create it now, do not ask me to confirm.`);
    bubbles.push(c.text); console.log(`--- CREATE ---\n${c.text}\n`);
    test.skip(c.text === "QUOTA", "tenant quota");

    const ws: any = await request("GET", "/rest/servicedeskapi/assets/workspace");
    const wsId = ws.values[0].workspaceId;
    const found: any = await request("POST",
      `https://api.atlassian.com/jsm/assets/workspace/${wsId}/v1/object/aql?maxResults=50`,
      { body: { qlQuery: `objectType = "Confluence Space"` } });
    const mine = (found.values || []).find((o: any) => String(o.label).includes(String(stamp)));
    expect(mine, "the object was not created").toBeTruthy();
    createdId = mine.id;
    console.log(`CREATED ${mine.objectKey} (${mine.id})`);

    const u = await ask(frame, page, conversationId,
      `Now change ONLY the Name of ${mine.objectKey} to "[harness-test] renamed ${stamp}". ` +
      `Change nothing else. Do it now.`);
    bubbles.push(u.text); console.log(`--- RENAME ---\n${u.text}\n`);
    test.skip(u.text === "QUOTA", "tenant quota");

    const after: any = await request("GET",
      `https://api.atlassian.com/jsm/assets/workspace/${wsId}/v1/object/${createdId}`);
    const attrs = (after.attributes || []).map((a: any) => ({ n: a.objectTypeAttribute?.name,
      v: (a.objectAttributeValues || []).map((v: any) => v.referencedObject?.label ?? v.displayValue ?? v.value) }));
    console.log("AFTER RENAME: " + JSON.stringify(attrs));
    const cleared = attrs.filter((a: any) => ["Space Key", "Classification", "Data Owner"].includes(a.n) && !a.v.length);
    console.log(`COLLATERAL CLEARED: ${JSON.stringify(cleared.map((c: any) => c.n))} ` +
      `(if empty, this Assets instance does a PARTIAL update and the branch cannot fire live)`);

    for (const b of bubbles) {
      for (const f of ["previousAttributes", "storedValues", "storedValuesNote", "attributesSet"]) {
        expect(b, `field name "${f}" reached the user`).not.toContain(f);
      }
    }
  } finally {
    if (createdId) {
      const ws: any = await request("GET", "/rest/servicedeskapi/assets/workspace").catch(() => null);
      if (ws) await request("DELETE",
        `https://api.atlassian.com/jsm/assets/workspace/${ws.values[0].workspaceId}/v1/object/${createdId}`)
        .then(() => console.log(`RESTORED: deleted ${createdId}`)).catch((e) => console.log(`!! leak ${createdId}: ${e.message}`));
    }
    if (frame) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
});

test("C. a deck that cannot render must not be offered as a download", async ({ page }) => {
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);
  const conv = await readAppState<string>(frame, GLOBAL_APP, "app.getActiveConversationId()");
  try {
    await deliverMessage(page, frame,
      "Call createPresentation with EXACTLY 45 slides titled 'Overlong Probe'. Do not reduce the " +
      "slide count and do not split it into several decks — I need one call with 45 slides. " +
      "Do not touch Jira.", "overlong deck");
    const t = await waitForThread(page, frame,
      (x) => x.some((m) => m.role === "assistant" && !m.streaming && m.text.length > 20),
      { timeout: 900_000, interval: 3_000, label: "overlong deck reply" });
    const reply = t.filter((m) => m.role === "assistant").pop()!.text;
    console.log(`--- OVERLONG DECK REPLY ---\n${reply}\n`);
    const cards = await frame.locator("#chatMessages .deck-card").count();
    console.log(`DECK CARDS RENDERED: ${cards}`);
    if (QUOTA.test(reply)) test.skip(true, "tenant quota");
    const promisesDownload = /download/i.test(reply);
    console.log(`REPLY MENTIONS A DOWNLOAD: ${promisesDownload}; CARDS: ${cards}`);
    if (cards === 0) {
      expect(promisesDownload, `no card was rendered but the reply offers a download: ${reply.slice(0, 400)}`).toBe(false);
    }
  } finally {
    if (conv) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: conv }).catch(() => {});
  }
});

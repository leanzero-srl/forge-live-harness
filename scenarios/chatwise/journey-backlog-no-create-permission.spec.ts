// JOURNEY: a backlog aimed at a space the user CANNOT create in.
//
// 24 Sep 2026, diconium-sandbox: a colleague could SEE TES but not create in it;
// ChatWise offered TES, recommended "create all 106 issues in TES", and Jira
// refused all 106. On wolfaenpak the harness admin is in the same position on
// DEMO (a service project: project/search?action=create omits it and createmeta
// answers 404 — measured over REST the day this was written). So: name DEMO,
// expect a plain refusal BEFORE any draft, no DEMO button, then name WFH and
// the flow carries on and creates there. Everything created is deleted.
//
// (Header of the sibling spec this was cut from:)
// JOURNEY: one document becomes a whole backlog, through the real UI.
//
// Deliberately small and two-level: this proves the plumbing — route → extract
// → shape → preview → approval → a real Jira TREE → no duplicate on a second
// approval — at a cost that can be run on every pass of the suite. The
// full 132-requirement specification run lives in scenarios/research.
//
// It verifies the TREE IN JIRA by key, not the chat bubble: a green preview is
// not a created backlog, and "the tool returned success" is not "the hierarchy
// is correct". Everything it creates is deleted.
//
// WHAT THIS REPLACES. Before the backlog engine, the same ask produced exactly
// one Epic from the Product Owner persona, and three issues per turn from the
// agentic one — both measured live, both in
// scenarios/research/doc-to-backlog-baseline.spec.ts.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { del, get } from "../../data/jira.mjs";
import {
  deliverMessage,
  ERROR_BUBBLE, GLOBAL_APP, awaitSwapSettled, callResolver, openGlobalPage,
  readAppState, readThread, settleBootSelection, waitForChatApp, pickPersonaIfGated } from "./chatwise-support";

const T = getTarget("chatwise-global");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";

test.describe.configure({ timeout: 1_800_000 });

const DOC = `# Parcel Locker Service — Requirements

## 1. Access

### REQ-001 Resident registration
A resident shall be able to register for the locker service with their apartment number.
Acceptance: a registered resident can open a locker assigned to them.

### REQ-002 Courier access
A courier shall be able to deposit a parcel without a resident being present.
Acceptance: a courier can complete a deposit using a one-time code.

## 2. Notification

### REQ-010 Arrival notice
The resident shall be notified when a parcel is deposited for them.
Acceptance: a notification is sent within five minutes of deposit.

### REQ-011 Reminder
A parcel left longer than 48 hours shall trigger a reminder to the resident.
Acceptance: exactly one reminder is sent per parcel.

## 3. Administration

### REQ-020 Locker overview
An administrator shall be able to see which lockers are occupied.
Acceptance: the overview shows locker id, occupied since, and the recipient.

### REQ-021 Manual release
An administrator shall be able to release a locker that is stuck.
Acceptance: a released locker becomes available and the event is recorded.

## 4. Non-goals

Payment for parcels is out of scope for this version.
`;

async function turn(page: any, frame: any, text: string, label: string): Promise<string> {
  const before = await frame.locator(".message.assistant").count();
  await deliverMessage(page, frame, text, "backlog-from-document");
  await expect
    .poll(async () => frame.locator(".message.assistant").count(), { timeout: 900_000 })
    .toBeGreaterThan(before);
  await expect
    .poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"), {
      timeout: 180_000,
    })
    .toBe(false);
  const reply = ((await frame.locator(".message.assistant").last().innerText()) || "").trim();
  console.log(`\n──── ${label} ────\nUSER: ${text}\nAI:\n${reply.slice(0, 4000)}\n`);
  return reply;
}

test("a space the user cannot create in is refused up front, never offered, and a creatable one works", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved.");
  const DENIED = process.env.CHATWISE_NOCREATE_PROJECT || "DEMO";
  // Positive control on the SAME object: the admin can see DEMO but Jira's
  // create-access list omits it. If this ever changes the test proves nothing.
  const creatable: any = await get(`/rest/api/3/project/search?action=create&keys=${DENIED}`);
  const visible: any = await get(`/rest/api/3/project/${DENIED}`).catch(() => null);
  test.skip(!visible?.key || (creatable.values || []).length > 0, `${DENIED} is not a visible-but-not-creatable space for the harness user`);

  const stamp = Date.now().toString(36);
  const createdKeys: string[] = [];
  let conversationId: string | null = null;
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click(); await pickPersonaIfGated(frame);
  await awaitSwapSettled(frame);
  try {
    await frame.locator("#attachFileInput").setInputFiles({ name: `locker-urs-${stamp}.md`, mimeType: "text/markdown", buffer: Buffer.from(DOC) });
    const chip = frame.locator(`#attachmentRow .attachment-chip[data-filename="locker-urs-${stamp}.md"]`);
    await expect(chip, "the document never uploaded").toBeVisible({ timeout: 120_000 });
    await expect(chip).not.toHaveClass(/uploading/, { timeout: 120_000 });
    conversationId = (await readAppState<string | null>(frame, GLOBAL_APP, "app.getActiveConversationId()")) as string | null;

    let refused = await turn(page, frame, `Generate the full backlog from this document in project ${DENIED}, with no sub-tasks.`, "1 — ask for the denied space");
    // A non-Product-Owner persona hands off: Allow, and the ask is replayed.
    const allow = frame.locator(".message.assistant").last().getByText(/Allow — switch to Product Owner/);
    if (await allow.count()) {
      const before = await frame.locator(".message.assistant").count();
      await allow.first().click();
      await expect.poll(async () => frame.locator(".message.assistant").count(), { timeout: 900_000 }).toBeGreaterThan(before);
      await expect.poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"), { timeout: 180_000 }).toBe(false);
      refused = ((await frame.locator(".message.assistant").last().innerText()) || "").trim();
      console.log(`\n──── 1b — after switching to Product Owner ────\nAI:\n${refused.slice(0, 3000)}\n`);
    }
    expect(refused, "the permission problem was not said").toMatch(new RegExp(`don't have permission to create issues in ${DENIED}`, "i"));
    expect(refused, "it drafted into a space the user cannot create in").not.toMatch(/Backlog draft/i);
    const buttons = await frame.locator(".message.assistant").last().locator("button, .option-btn").allInnerTexts();
    console.log(`buttons: ${buttons.join(" | ")}`);
    expect(buttons.some((b) => new RegExp(`\\b${DENIED}\\b`).test(b)), `${DENIED} was offered as a button`).toBe(false);
    expect(refused, "no creatable space was offered").toMatch(/Use space /);
    expect(refused, `${DENIED} was offered in the list`).not.toMatch(new RegExp(`Use space ${DENIED}\\b`));
    const inDenied: any = await get(`/rest/api/3/search/jql?jql=${encodeURIComponent(`project = ${DENIED} AND labels = chatwise-backlog AND created >= -15m`)}&maxResults=5`).catch(() => ({ issues: [] }));
    expect((inDenied.issues || []).length, "issues appeared in the denied space").toBe(0);

    const preview = await turn(page, frame, PROJECT, "2 — name a creatable space");
    expect(preview, "no draft after naming a creatable space").toMatch(/Backlog draft/i);
    expect(preview).toContain(PROJECT);

    const created = await turn(page, frame, "approve", "3 — approve");
    expect(created, "approval did not create anything").toMatch(/issues created/i);
    for (const m of created.matchAll(new RegExp(`\\b${PROJECT}-\\d+\\b`, "g"))) createdKeys.push(m[0]);
    expect(createdKeys.length).toBeGreaterThan(0);
    for (const key of [...createdKeys]) {
      const res: any = await get(`/rest/api/3/search/jql?jql=${encodeURIComponent(`parent = ${key}`)}&fields=summary&maxResults=50`).catch(() => ({ issues: [] }));
      for (const k of res.issues || []) createdKeys.push(k.key);
    }
    const thread = await readThread(frame);
    const red = thread.filter((m) => ERROR_BUBBLE.test(m.text || ""));
    expect(red.length, `error bubble: ${red[0]?.text?.slice(0, 200)}`).toBe(0);
  } finally {
    for (const key of [...new Set(createdKeys)].reverse()) {
      try { await del(`/rest/api/3/issue/${key}?deleteSubtasks=true`); } catch { /* already gone */ }
    }
    console.log(`cleaned up ${new Set(createdKeys).size} issues`);
    if (conversationId) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
});

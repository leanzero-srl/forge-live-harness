// TESTER PROBE — v6.98.0 ITEM 6: a backlog DRAFT must survive a "not now"
// refusal (v6.96.0: a consent REJECT was routed to `cancel` and DESTROYED the
// draft), and the later yes must create it ONCE. Driven in German, because the
// language half of the consent gate is the reason this role exists.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { del, get } from "../../data/jira.mjs";
import {
  GLOBAL_APP, awaitSwapSettled, callResolver, deliverMessage, openGlobalPage,
  readAppState, settleBootSelection, waitForChatApp,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";
test.describe.configure({ timeout: 2_400_000 });

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
  await deliverMessage(page, frame, text, "backlog-reject");
  await expect.poll(async () => frame.locator(".message.assistant").count(), { timeout: 900_000 }).toBeGreaterThan(before);
  await expect.poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"),
    { timeout: 180_000 }).toBe(false);
  const reply = ((await frame.locator(".message.assistant").last().innerText()) || "").trim();
  console.log(`\n──── ${label} ────\nUSER: ${text}\nAI:\n${reply.slice(0, 3000)}\n`);
  return reply;
}

test("PROBE: a backlog draft survives a German 'not now' and is created ONCE afterwards", async ({ page }) => {
  const stamp = Date.now().toString(36);
  const created: string[] = [];
  let conversationId: string | null = null;
  // Snapshot the project BEFORE, so cleanup deletes only what this run made.
  const snap: any = await get(`/rest/api/3/search/jql?jql=${encodeURIComponent(`project = ${PROJECT} ORDER BY created DESC`)}&maxResults=200&fields=summary`);
  const before = new Set<string>((snap?.issues || []).map((i: any) => i.key));
  console.log(`snapshot: ${before.size} existing ${PROJECT} issues`);

  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);
  try {
    await frame.locator("#attachFileInput").setInputFiles({
      name: `locker-urs-${stamp}.md`, mimeType: "text/markdown", buffer: Buffer.from(DOC) });
    const chip = frame.locator(`#attachmentRow .attachment-chip[data-filename="locker-urs-${stamp}.md"]`);
    await expect(chip).toBeVisible({ timeout: 120_000 });
    await expect(chip).not.toHaveClass(/uploading/, { timeout: 120_000 });
    conversationId = (await readAppState<string | null>(frame, GLOBAL_APP, "app.getActiveConversationId()")) as string | null;

    const preview = await turn(page, frame,
      `Generate the full backlog from this document in project ${PROJECT}, with no sub-tasks.`, "1 — draft");
    if (/token allowance|Nothing was lost/i.test(preview)) test.skip(true, "tenant quota");
    expect(preview, "no backlog preview").toMatch(/Backlog draft/i);

    // THE REFUSAL THAT MUST NOT DESTROY THE DRAFT.
    const deferred = await turn(page, frame, "Nein, jetzt noch nicht.", "2 — 'not now' (German)");
    if (/token allowance|Nothing was lost/i.test(deferred)) test.skip(true, "tenant quota");
    expect(deferred, "the app treated a deferral as a re-draft request").not.toMatch(/Backlog draft/i);

    // THE YES THAT MUST REDEEM THE SAME DRAFT.
    const done = await turn(page, frame, "Ja, jetzt bitte anlegen.", "3 — the later yes (German)");
    if (/token allowance|Nothing was lost/i.test(done)) test.skip(true, "tenant quota");
    const keys = Array.from(new Set(done.match(new RegExp(`${PROJECT}-\\d+`, "g")) || []));
    created.push(...keys);
    console.log(`CREATED AFTER THE LATER YES: ${keys.join(", ")}`);
    expect(keys.length, `the draft did not survive the deferral — nothing was created. Reply: ${done.slice(0, 500)}`)
      .toBeGreaterThan(0);
    expect(done, "the app had to re-draft, so the deferral destroyed the draft")
      .not.toMatch(/I no longer have|start again|draft it again|re-?draft/i);
  } finally {
    // Delete ONLY keys that did not exist before this run.
    const after: any = await get(`/rest/api/3/search/jql?jql=${encodeURIComponent(`project = ${PROJECT} ORDER BY created DESC`)}&maxResults=200&fields=summary`).catch(() => null);
    const fresh = (after?.issues || []).map((i: any) => i.key).filter((k: string) => !before.has(k));
    console.log(`cleaning up ${fresh.length} issues this run created: ${fresh.join(", ")}`);
    for (const k of fresh) await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).catch(() => {});
    if (conversationId) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
});

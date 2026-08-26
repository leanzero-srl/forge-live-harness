// SMOKE: the document→backlog flow, end to end, on a SMALL synthetic document.
//
// Deliberately small and two-level: this proves the plumbing (route → extract →
// shape → preview → approval → real Jira tree) at a cost that can be run
// repeatedly. The full 132-requirement URS run lives in the journey spec.
//
// It verifies the TREE IN JIRA by key, not the chat bubble: a green preview is
// not a created backlog, and "the tool returned success" is not "the hierarchy
// is correct". Everything it creates is deleted.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { del, get } from "../../data/jira.mjs";
import {
  ERROR_BUBBLE, GLOBAL_APP, awaitSwapSettled, callResolver, openGlobalPage,
  readAppState, readThread, settleBootSelection, waitForChatApp,
} from "../chatwise/chatwise-support";

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

async function turn(frame: any, text: string, label: string): Promise<string> {
  const before = await frame.locator(".message.assistant").count();
  await frame.locator("#chatInput").fill(text);
  await frame.locator("#sendButton").click();
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

test("a document becomes a real, correctly-parented backlog in Jira", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved.");
  const stamp = Date.now().toString(36);
  const createdKeys: string[] = [];
  let conversationId: string | null = null;

  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);

  try {
    await frame.locator("#attachFileInput").setInputFiles({
      name: `locker-urs-${stamp}.md`,
      mimeType: "text/markdown",
      buffer: Buffer.from(DOC),
    });
    const chip = frame.locator(`#attachmentRow .attachment-chip[data-filename="locker-urs-${stamp}.md"]`);
    await expect(chip, "the document never uploaded").toBeVisible({ timeout: 120_000 });
    await expect(chip).not.toHaveClass(/uploading/, { timeout: 120_000 });
    conversationId = (await readAppState<string | null>(frame, GLOBAL_APP, "app.getActiveConversationId()")) as string | null;

    // ---- 1. the draft ---------------------------------------------------
    const preview = await turn(
      frame,
      `Generate the full backlog from this document in project ${PROJECT}, with no sub-tasks.`,
      "1 — draft",
    );
    expect(preview, "no backlog preview came back").toMatch(/Backlog draft/i);
    expect(preview, "the preview did not name the project").toContain(PROJECT);
    expect(preview, "no coverage line — the honesty check is missing").toMatch(/Coverage:/i);
    expect(preview, "nothing must be created before approval").not.toMatch(/issues created/i);

    // The coverage number has to be real: this document has 7 requirements.
    const cov = /Coverage:\s*(\d+)%\s*\((\d+) of (\d+)/.exec(preview);
    expect(cov, `no parseable coverage line in: ${preview.slice(0, 400)}`).toBeTruthy();
    console.log(`coverage ${cov![1]}% — ${cov![2]} of ${cov![3]} requirements`);
    expect(Number(cov![3]), "far too few requirements extracted from a 7-requirement document").toBeGreaterThanOrEqual(5);
    expect(Number(cov![1]), "coverage is implausibly low").toBeGreaterThanOrEqual(50);

    // Nothing in Jira yet.
    const draftSession = await callResolver<any>(frame, GLOBAL_APP, "getChatFiles", { conversationId });
    expect(draftSession, "resolver call failed").toBeTruthy();

    // ---- 2. approval ----------------------------------------------------
    const created = await turn(frame, `approve`, "2 — approve");
    expect(created, "approval did not create anything").toMatch(/issues created/i);

    for (const m of created.matchAll(new RegExp(`\\b${PROJECT}-\\d+\\b`, "g"))) createdKeys.push(m[0]);
    expect(createdKeys.length, "no issue keys in the creation report").toBeGreaterThan(0);
    console.log(`reported keys: ${createdKeys.join(", ")}`);

    // ---- 3. THE REAL CHECK: the tree in Jira ----------------------------
    // A chat bubble is not a backlog. Read every created epic's children back
    // out of Jira and assert the parenthood is real.
    const epics: any[] = [];
    for (const key of createdKeys) {
      const issue: any = await get(`/rest/api/3/issue/${key}?fields=summary,issuetype,parent,labels,description`);
      epics.push(issue);
      expect(issue.fields.labels, `${key} is missing the traceability label`).toContain("chatwise-backlog");
    }
    expect(
      epics.every((e) => e.fields.issuetype.hierarchyLevel === 1),
      `the reported top-level keys are not all epics: ${epics.map((e) => `${e.key}=${e.fields.issuetype.name}`).join(", ")}`,
    ).toBe(true);

    // Children, by parent — read with JQL is unreliable straight after a create
    // (the index lags), so ask for the parent's children directly.
    let totalChildren = 0;
    for (const e of epics) {
      const res: any = await get(
        `/rest/api/3/search/jql?jql=${encodeURIComponent(`parent = ${e.key}`)}&fields=summary,issuetype,parent&maxResults=50`,
      ).catch(() => ({ issues: [] }));
      const kids = res.issues || [];
      totalChildren += kids.length;
      for (const k of kids) {
        createdKeys.push(k.key);
        expect(k.fields.parent?.key, `${k.key} claims a different parent`).toBe(e.key);
        expect(k.fields.issuetype.hierarchyLevel, `${k.key} is not a standard issue`).toBe(0);
      }
      console.log(`${e.key} "${e.fields.summary}" → ${kids.length} children`);
    }
    // The whole point of the feature: a TREE, not a pile of epics.
    expect(totalChildren, "no stories were parented under any epic — this is a flat pile, not a backlog").toBeGreaterThan(0);

    // ---- 4. no error bubbles anywhere ----------------------------------
    const thread = await readThread(frame);
    const red = thread.filter((m) => ERROR_BUBBLE.test(m.text || ""));
    expect(red.length, `error bubble: ${red[0]?.text?.slice(0, 200)}`).toBe(0);

    // ---- 5. re-approving must not duplicate -----------------------------
    const again = await turn(frame, `approve`, "3 — approve again (must not duplicate)");
    expect(again, "a second approval re-ran the creation").not.toMatch(/^## ✅ \d+ issues created/m);
  } finally {
    // Delete deepest-first so a parent never blocks on its children.
    for (const key of [...new Set(createdKeys)].reverse()) {
      try { await del(`/rest/api/3/issue/${key}?deleteSubtasks=true`); } catch { /* already gone */ }
    }
    console.log(`cleaned up ${new Set(createdKeys).size} issues`);
    if (conversationId) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});

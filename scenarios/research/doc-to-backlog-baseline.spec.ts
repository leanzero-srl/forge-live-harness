// RESEARCH PROBE (not part of the chatwise suite): what does ChatWise ACTUALLY
// do today when a user uploads ONE requirements document and asks for a whole
// backlog?
//
// A stakeholder reports that ChatGPT, given a document like this, produces a
// full backlog. This measures the deployed app's real behaviour against the
// same document — the 807-line HOA User Requirements Specification with ~90
// numbered UR-xxx requirements — on BOTH paths:
//
//   A. the Product Owner persona (the wizard path, no Jira tools)
//   B. Epic Master (the agentic tool path, createIssues available)
//
// It asserts almost nothing. It RECORDS: how many issues actually landed in
// Jira, at which hierarchy levels, and what the app said. Evidence, not a gate.
// Everything it creates is deleted at the end.
import fs from "node:fs";
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { del, searchJql } from "../../data/jira.mjs";
import {
  GLOBAL_APP, awaitSwapSettled, callResolver, openGlobalPage,
  readAppState, readThread, settleBootSelection, waitForChatApp,
} from "../chatwise/chatwise-support";

const T = getTarget("chatwise-global");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";
const DOC = "/Users/mihaiperdum/Downloads/HOA_Example_Street_12_User_Requirements_Specification_URS_v0.1_EN_Anonymized.md";

test.describe.configure({ timeout: 2_400_000 });

/** Select a persona in the custom dropdown by its option text. */
async function pickPersona(frame: any, name: RegExp): Promise<void> {
  await frame.locator("#dropdownSelected").click();
  await expect(frame.locator("#dropdownOptions")).toHaveClass(/open/);
  await frame.locator("#dropdownOptions .dropdown-option").filter({ hasText: name }).first().click();
  await expect(frame.locator("#dropdownSelected .selected-text")).toHaveText(name, { timeout: 10_000 });
}

async function turn(frame: any, text: string, label: string): Promise<string> {
  const before = await frame.locator(".message.assistant").count();
  await frame.locator("#chatInput").fill(text);
  await frame.locator("#sendButton").click();
  await expect
    .poll(async () => frame.locator(".message.assistant").count(), { timeout: 600_000 })
    .toBeGreaterThan(before);
  await expect
    .poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"), {
      timeout: 180_000,
    })
    .toBe(false);
  const reply = ((await frame.locator(".message.assistant").last().innerText()) || "").trim();
  console.log(`\n───────── ${label} ─────────\nUSER: ${text.slice(0, 200)}\nAI  : ${reply.slice(0, 2500)}\n`);
  return reply;
}

/** Click the first option of every group on the live sheet, then send. */
async function answerSheet(frame: any): Promise<boolean> {
  const row = frame.locator(".message.assistant").last().locator(".message-options");
  if ((await row.count()) === 0) return false;
  if (/answered/.test((await row.getAttribute("class")) || "")) return false;
  await expect(row).not.toHaveClass(/decoding/, { timeout: 20_000 });
  const groups = row.locator(".option-group");
  const n = await groups.count();
  const before = await frame.locator(".message.assistant").count();
  if (n > 1) {
    for (let i = 0; i < n; i++) await groups.nth(i).locator(".option-btn").first().click();
    const send = row.locator(".option-send-btn");
    await expect(send).toBeEnabled({ timeout: 8_000 });
    await send.click();
  } else {
    await groups.first().locator(".option-btn").first().click();
  }
  await expect
    .poll(async () => frame.locator(".message.assistant").count(), { timeout: 600_000 })
    .toBeGreaterThan(before);
  await expect
    .poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"), {
      timeout: 180_000,
    })
    .toBe(false);
  const reply = ((await frame.locator(".message.assistant").last().innerText()) || "").trim();
  console.log(`\n───────── [sheet answered] ─────────\nAI  : ${reply.slice(0, 2500)}\n`);
  return true;
}

async function countCreated(marker: string) {
  const jql = `project = ${PROJECT} AND labels = "${marker}" ORDER BY created ASC`;
  const res: any = await searchJql(jql, ["summary", "issuetype", "parent"], 200);
  const issues = res?.issues || [];
  const byType: Record<string, number> = {};
  for (const i of issues) {
    const t = i.fields?.issuetype?.name || "?";
    byType[t] = (byType[t] || 0) + 1;
  }
  const withParent = issues.filter((i: any) => i.fields?.parent).length;
  return { total: issues.length, byType, withParent, keys: issues.map((i: any) => i.key) };
}

async function cleanup(keys: string[]) {
  for (const k of keys.reverse()) {
    try { await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`); } catch { /* already gone */ }
  }
}

async function uploadDoc(frame: any, name: string) {
  const buffer = fs.readFileSync(DOC);
  console.log(`uploading ${name}: ${buffer.length} bytes`);
  await frame.locator("#attachFileInput").setInputFiles({ name, mimeType: "text/markdown", buffer });
  const chip = frame.locator(`#attachmentRow .attachment-chip[data-filename="${name}"]`);
  await expect(chip, "no chip appeared for the URS upload").toBeVisible({ timeout: 180_000 });
  await expect(chip).not.toHaveClass(/uploading/, { timeout: 180_000 });
  const meta = await chip.locator(".chip-meta").innerText();
  console.log(`chip meta: ${meta}`);
}

test("BASELINE A — Product Owner persona, one URS document, 'build me the whole backlog'", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved.");
  const stamp = Date.now().toString(36);
  const marker = `research-po-${stamp}`;
  let conversationId: string | null = null;

  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);

  try {
    // Flip to the Product Owner persona through the real selector.
    await pickPersona(frame, /product owner/i);

    await uploadDoc(frame, `URS-${stamp}.md`);
    conversationId = (await readAppState<string | null>(frame, GLOBAL_APP, "app.getActiveConversationId()")) as string | null;
    console.log(`conversation: ${conversationId}`);

    await turn(
      frame,
      `I've attached our User Requirements Specification. Read all of it and build me the COMPLETE backlog in project ${PROJECT}: ` +
        `epics, stories, tasks and sub-tasks, covering every requirement in the document. Label everything "${marker}". ` +
        `Use your best judgment, skip the questions, and create it all in Jira now.`,
      "A1 — the ask",
    );

    // Push hard for up to 8 further turns, answering whatever it deals.
    for (let i = 0; i < 8; i++) {
      const answered = await answerSheet(frame);
      if (!answered) {
        const r = await turn(
          frame,
          i === 0
            ? `Skip to the end. Show me the full backlog structure and create every item in ${PROJECT} now, labelled "${marker}".`
            : `approve — create all of it in ${PROJECT} now, labelled "${marker}".`,
          `A${i + 2} — push to creation`,
        );
        if (/created/i.test(r) && /[A-Z]+-\d+/.test(r)) break;
      }
    }
  } finally {
    const found = await countCreated(marker);
    console.log(`\n=== BASELINE A RESULT (Product Owner / wizard) ===\n${JSON.stringify(found, null, 2)}\n`);
    const thread = await readThread(frame);
    console.log(`turns: ${thread.length}`);
    await cleanup(found.keys);
    if (conversationId) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});

test("BASELINE B — Epic Master (agentic tools), same document, same ask", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved.");
  const stamp = Date.now().toString(36);
  const marker = `research-em-${stamp}`;
  let conversationId: string | null = null;

  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);

  try {
    await pickPersona(frame, /epic master/i);

    await uploadDoc(frame, `URS-${stamp}.md`);
    conversationId = (await readAppState<string | null>(frame, GLOBAL_APP, "app.getActiveConversationId()")) as string | null;

    await turn(
      frame,
      `I've attached our User Requirements Specification. Read all of it and create the COMPLETE backlog in project ${PROJECT}: ` +
        `epics, with stories under them, and sub-tasks under the stories, covering every requirement. ` +
        `Label every issue "${marker}". Create it all in Jira now — don't just describe it.`,
      "B1 — the ask",
    );
    for (let i = 0; i < 6; i++) {
      const r = await turn(frame, `Continue — create the rest of the backlog now, labelled "${marker}".`, `B${i + 2} — continue`);
      if (/no more|complete|all .*created|finished/i.test(r) && i > 1) break;
    }
  } finally {
    const found = await countCreated(marker);
    console.log(`\n=== BASELINE B RESULT (Epic Master / agent loop) ===\n${JSON.stringify(found, null, 2)}\n`);
    await cleanup(found.keys);
    if (conversationId) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});

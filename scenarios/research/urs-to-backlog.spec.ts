// THE REAL QUESTION, ANSWERED LIVE.
//
// A stakeholder reports that ChatGPT, given a requirements document, produces a
// whole backlog. This drives ChatWise against THAT DOCUMENT — the 807-line,
// 24 KB HOA User Requirements Specification with ~132 numbered UR-xxx
// requirements — through the real UI, and reads the result back out of Jira.
//
// scenarios/research/doc-to-backlog-baseline.spec.ts measured what the app did
// BEFORE this feature existed: one Epic from the Product Owner persona, and
// three issues per turn from the agentic one (9 of a planned 161 after six
// turns). This is the comparison.
import fs from "node:fs";
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { del, get } from "../../data/jira.mjs";
import {
  ERROR_BUBBLE, GLOBAL_APP, awaitSwapSettled, callResolver, openGlobalPage,
  readAppState, readThread, settleBootSelection, waitForChatApp,
} from "../chatwise/chatwise-support";

const T = getTarget("chatwise-global");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";
const DOC = "/Users/mihaiperdum/Downloads/HOA_Example_Street_12_User_Requirements_Specification_URS_v0.1_EN_Anonymized.md";

test.describe.configure({ timeout: 2_700_000 });

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
    .poll(async () => frame.locator(".message.assistant").count(), { timeout: 950_000 })
    .toBeGreaterThan(before);
  await expect
    .poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"), {
      timeout: 180_000,
    })
    .toBe(false);
  const reply = ((await frame.locator(".message.assistant").last().innerText()) || "").trim();
  console.log(`\n════ ${label} ════\nUSER: ${text}\nAI:\n${reply.slice(0, 7000)}\n`);
  return reply;
}

test("the URS becomes a real, traceable backlog in Jira", async ({ page }) => {
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
    // The persona the stakeholder asked about.
    await pickPersona(frame, /product owner/i);

    const buffer = fs.readFileSync(DOC);
    console.log(`URS: ${buffer.length} bytes`);
    await frame.locator("#attachFileInput").setInputFiles({
      name: `URS-${stamp}.md`,
      mimeType: "text/markdown",
      buffer,
    });
    const chip = frame.locator(`#attachmentRow .attachment-chip[data-filename="URS-${stamp}.md"]`);
    await expect(chip, "the URS never uploaded").toBeVisible({ timeout: 180_000 });
    await expect(chip).not.toHaveClass(/uploading/, { timeout: 180_000 });
    conversationId = (await readAppState<string | null>(frame, GLOBAL_APP, "app.getActiveConversationId()")) as string | null;

    // ---- the ask, in the words a Product Owner would use -----------------
    const preview = await turn(
      frame,
      `Generate the full backlog from this document in project ${PROJECT} — epics, stories and sub-tasks, ` +
        `covering every requirement in it.`,
      "1 — the ask",
    );
    expect(preview, "no backlog preview").toMatch(/Backlog draft/i);

    const cov = /Coverage:\s*(\d+)%\s*\((\d+) of (\d+)/.exec(preview);
    expect(cov, `no coverage line in: ${preview.slice(0, 500)}`).toBeTruthy();
    const [, pct, covered, total] = cov!;
    console.log(`\n>>> ${total} requirements read, ${covered} covered (${pct}%)`);
    // The document has ~132 numbered requirements. Reading fewer than 60 means
    // the windowing or the extraction is losing most of the specification.
    expect(Number(total), "far too few requirements extracted from a 132-requirement URS").toBeGreaterThanOrEqual(60);
    expect(Number(pct), "coverage too low to call this a backlog OF the document").toBeGreaterThanOrEqual(70);

    const totals = /Backlog draft — (\d+) issues/.exec(preview);
    expect(totals, "the preview does not state a total").toBeTruthy();
    const planned = Number(totals![1]);
    console.log(`>>> planned ${planned} issues`);
    // The whole point: a BACKLOG, not one Epic and not three issues.
    expect(planned, "this is not a backlog").toBeGreaterThanOrEqual(20);

    // ---- approval --------------------------------------------------------
    const created = await turn(frame, "approve", "2 — approve");
    expect(created, "approval created nothing").toMatch(/issues? created/i);

    const topKeys = [...new Set([...created.matchAll(new RegExp(`\\b${PROJECT}-\\d+\\b`, "g"))].map((m) => m[0]))];
    createdKeys.push(...topKeys);
    expect(topKeys.length, "no keys reported").toBeGreaterThan(0);

    // ---- THE REAL CHECK --------------------------------------------------
    let epics = 0;
    let stories = 0;
    let subtasks = 0;
    const queue = [...topKeys];
    const seen = new Set<string>();
    while (queue.length) {
      const key = queue.shift()!;
      if (seen.has(key)) continue;
      seen.add(key);
      const issue: any = await get(`/rest/api/3/issue/${key}?fields=summary,issuetype,parent,labels,description`);
      const level = issue.fields.issuetype.hierarchyLevel;
      if (level === 1) epics++;
      else if (level === 0) stories++;
      else subtasks++;
      expect(issue.fields.labels, `${key} lost its traceability label`).toContain("chatwise-backlog");
      // Traceability: every item should name the requirements it came from.
      const desc = JSON.stringify(issue.fields.description || {});
      if (level >= 0) {
        expect(desc, `${key} carries no source-requirement trace`).toMatch(/Source requirements/);
      }
      const kids: any = await get(
        `/rest/api/3/search/jql?jql=${encodeURIComponent(`parent = ${key}`)}&fields=summary&maxResults=100`,
      ).catch(() => ({ issues: [] }));
      for (const k of kids.issues || []) {
        createdKeys.push(k.key);
        queue.push(k.key);
      }
    }
    console.log(`\n>>> IN JIRA: ${epics} epics, ${stories} stories, ${subtasks} sub-tasks — ${seen.size} issues total`);
    expect(epics, "no epics").toBeGreaterThan(0);
    expect(stories, "no stories under the epics — a flat pile is not a backlog").toBeGreaterThan(epics);
    expect(seen.size, "far fewer issues landed than the plan promised").toBeGreaterThanOrEqual(Math.floor(planned * 0.8));

    const thread = await readThread(frame);
    const red = thread.filter((m) => ERROR_BUBBLE.test(m.text || ""));
    expect(red.length, `error bubble: ${red[0]?.text?.slice(0, 200)}`).toBe(0);
  } finally {
    const unique = [...new Set(createdKeys)];
    for (const key of unique.reverse()) {
      try { await del(`/rest/api/3/issue/${key}?deleteSubtasks=true`); } catch { /* already gone */ }
    }
    console.log(`cleaned up ${unique.length} issues`);
    if (conversationId) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});

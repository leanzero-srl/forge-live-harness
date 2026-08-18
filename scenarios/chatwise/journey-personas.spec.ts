// JOURNEY: every factory persona, doing the job it exists for.
//
// The suite proved personas were SELECTABLE and that the choice survived a
// reload — never that any of them behaves like itself. Epic Master had
// literally never run (the decomposition spec drives jira-scrubber). Each test
// here selects one persona through the real dropdown, gives it the task its
// description promises, and asserts EVIDENCE of the purpose:
//
//   - configuration evidence — the meta chip carries the PERSONA'S OWN model,
//     which proves per-persona settings actually reached the request;
//   - capability evidence — Jira state (Epic Master's children read back BY
//     KEY), or content the task makes unavoidable (Scrubber must flag the
//     defects we deliberately seeded).
//
// Live model on purpose: a persona's purpose IS its model behaviour, and no
// scripted fixture can attest to it. Wording is never asserted — only facts.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP, PANEL_APP, awaitSwapSettled, callResolver, openGlobalPage, openPanel,
  readAppState, settleBootSelection, waitForChatApp,
} from "./chatwise-support";
// eslint-disable-next-line
import { get, post, del } from "../../data/jira.mjs";

const G = getTarget("chatwise-global");
const P = getTarget("chatwise-issue-panel");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";

test.describe.configure({ timeout: 600_000 });

/** Select a persona in the custom dropdown by its option text. */
async function pickPersona(frame: any, name: RegExp): Promise<void> {
  await frame.locator("#dropdownSelected").click();
  await expect(frame.locator("#dropdownOptions")).toHaveClass(/open/);
  const opt = frame.locator("#dropdownOptions .dropdown-option").filter({ hasText: name }).first();
  await opt.click();
  await expect(frame.locator("#dropdownSelected .selected-text")).toHaveText(name);
}

/** Send through the composer and wait for a settled assistant reply. */
async function sendAndAwait(page: any, frame: any, appKey: string, text: string): Promise<string> {
  const before = await frame.locator(".message.assistant").count();
  await frame.locator("#chatInput").fill(text);
  await frame.locator("#sendButton").click();
  await expect
    .poll(async () => frame.locator(".message.assistant").count(), { timeout: 300_000 })
    .toBeGreaterThan(before);

  // THE TENANT QUOTA IS NOT A PERSONA BUG. Forge LLM caps tokens per model per
  // tenant, and a test-heavy day exhausts one tier while the others still
  // answer. A journey that goes red for that teaches people to ignore red —
  // and the capability was not disproven, the environment refused. Skip, and
  // say so loudly.
  const bubble = ((await frame.locator(".message.assistant").last().textContent()) || "").trim();
  if (/token usage limit|429/i.test(bubble)) {
    test.skip(true, `tenant Forge LLM quota exhausted mid-turn — rerun later: ${bubble.slice(0, 120)}`);
  }

  await expect
    .poll(async () =>
      frame.locator("body").evaluate((_el: unknown, k: string) => !!(window as any)[k]?.components?.chat?.isStreaming, appKey),
      { timeout: 60_000 })
    .toBe(false);
  return ((await frame.locator(".message.assistant").last().textContent()) || "").trim();
}

/** The meta chips under the last assistant reply — model, tokens, tool calls. */
async function lastMeta(frame: any): Promise<string> {
  return ((await frame.locator(".message.assistant").last().locator(".message-meta").textContent().catch(() => "")) || "").toLowerCase();
}

test("the global page offers exactly the four factory personas", async ({ page }) => {
  test.skip(!G.envId, "env unresolved");
  const frame = await openGlobalPage(page, G);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);

  await frame.locator("#dropdownSelected").click();
  const names = (await frame.locator("#dropdownOptions .dropdown-option .option-text").allTextContents())
    .map((t) => t.trim());
  await frame.locator("#dropdownSelected").click(); // close
  expect(names, `roster drifted: ${names.join(" | ")}`).toEqual([
    "Coffee Break AI", "JIRA Scrubber", "Epic Master", "Product Owner",
  ]);
});

test("Coffee Break AI: casual chat on ITS model, no Jira machinery", async ({ page }) => {
  test.skip(!G.envId, "env unresolved");
  const frame = await openGlobalPage(page, G);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);
  let conversationId: string | null = null;
  try {
    await pickPersona(frame, /Coffee Break AI/);
    const reply = await sendAndAwait(page, frame, GLOBAL_APP,
      "No Jira work right now — just tell me something genuinely interesting about coffee.",
    );
    conversationId = (await readAppState<string | null>(frame, GLOBAL_APP, "app.getActiveConversationId()")) as string | null;
    expect(reply.length, "no reply").toBeGreaterThan(40);

    const meta = await lastMeta(frame);
    // CONFIGURATION PURPOSE: this persona is pinned to the cheap tier. A
    // sonnet/opus chip here means per-persona model settings are being ignored.
    expect(meta, `meta was: ${meta}`).toContain("haiku");
    // A casual-chat turn has no business running the tool loop.
    expect(meta, "coffee chat burned tool iterations").not.toMatch(/tool calls/);
  } finally {
    if (conversationId) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
});

test("JIRA Scrubber: flags the defects a bad ticket actually has", async ({ page }) => {
  test.skip(!P.envId, "env unresolved");
  const stamp = Date.now();
  let issueKey: string | null = null;
  let frame: any = null;
  try {
    // A DELIBERATELY deficient issue: vague one-word summary, no description,
    // no acceptance criteria. Any scrubber worth its name must flag these.
    const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
    const std = (meta?.issueTypes || meta?.values || []).find((t: any) => t.hierarchyLevel === 0);
    const made: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT },
        issuetype: { id: String(std.id) },
        summary: `fix stuff ${stamp}`,
        labels: ["harness-test"],
      },
    });
    issueKey = made.key;

    frame = await openPanel(page, P, issueKey!);
    await waitForChatApp(page, frame, PANEL_APP);
    // The panel DEFAULTS to the Scrubber — assert that, then use it as-is.
    await expect(frame.locator("#dropdownSelected .selected-text")).toHaveText(/JIRA Scrubber/);

    const reply = await sendAndAwait(page, frame, PANEL_APP,
      "Review this ticket's hygiene and list what is wrong with it as a ticket.",
    );
    // CAPABILITY: the seeded defects are unavoidable findings. Asserted as
    // alternations, not wording — any competent critique names these concepts.
    expect(reply, "never flagged the missing description").toMatch(/description/i);
    expect(reply, "never flagged the vague summary").toMatch(/summar|title/i);
    expect(reply, "no mention of acceptance criteria — the persona's headline concern").toMatch(
      /acceptance criteria/i,
    );
    const chips = await lastMeta(frame);
    expect(chips, `meta was: ${chips}`).toContain("sonnet");
  } finally {
    if (frame && issueKey) {
      await callResolver(frame, PANEL_APP, "deleteConversation", { conversationId: `issue-${issueKey}` }).catch(() => {});
    }
    if (issueKey) await del(`/rest/api/3/issue/${issueKey}?deleteSubtasks=true`).catch(() => {});
  }
});

test("Epic Master: decomposes a real epic into a real hierarchy", async ({ page }) => {
  test.skip(!G.envId, "env unresolved");
  const stamp = Date.now();
  let epicKey: string | null = null;
  const childKeys: string[] = [];
  let conversationId: string | null = null;
  let frame: any = null;
  try {
    const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
    const types: any[] = meta?.issueTypes || meta?.values || [];
    const epicType = types.find((t) => t.hierarchyLevel === 1);
    const made: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT },
        issuetype: { id: String(epicType.id) },
        summary: `[harness-test] persona epic ${stamp}`,
        labels: ["harness-test"],
      },
    });
    epicKey = made.key;

    frame = await openGlobalPage(page, G);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await settleBootSelection(page, frame);
    await frame.locator("#newChatButton").click();
    await awaitSwapSettled(frame);
    await pickPersona(frame, /Epic Master/);

    const reply = await sendAndAwait(page, frame, GLOBAL_APP,
      `Split ${epicKey} in project ${PROJECT} into exactly two ordinary child work items, ` +
        `"[harness-test] slice A ${stamp}" and "[harness-test] slice B ${stamp}", each with ` +
        `${epicKey} as its parent. Create them now; do not ask me to confirm.`,
    );
    conversationId = (await readAppState<string | null>(frame, GLOBAL_APP, "app.getActiveConversationId()")) as string | null;

    // CAPABILITY: Jira state, read back BY KEY (never JQL — eventually
    // consistent). This is Epic Master doing the exact thing its description
    // sells, on its own configuration, for the first time ever.
    const mentioned = Array.from(new Set(reply.match(/\b[A-Z][A-Z0-9_]+-\d+\b/g) || []))
      .filter((k) => k !== epicKey);
    expect(mentioned.length, `the reply names no created issues: ${reply.slice(0, 300)}`).toBeGreaterThanOrEqual(2);
    for (const key of mentioned.slice(0, 4)) {
      const issue: any = await get(`/rest/api/3/issue/${key}?fields=issuetype,parent`).catch(() => null);
      if (!issue) continue;
      childKeys.push(key);
      expect(issue.fields?.issuetype?.hierarchyLevel, `${key} is an epic — the original bug`).not.toBe(1);
      expect(issue.fields?.parent?.key, `${key} has the wrong parent`).toBe(epicKey);
    }
    expect(childKeys.length, "none of the named children exist in Jira").toBeGreaterThanOrEqual(2);

    const chips = await lastMeta(frame);
    expect(chips, "the tool loop never ran — creations came from nowhere?").toMatch(/tool calls/);
    expect(chips, `meta was: ${chips}`).toContain("sonnet");
  } finally {
    for (const k of childKeys) await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).catch(() => {});
    if (epicKey) await del(`/rest/api/3/issue/${epicKey}?deleteSubtasks=true`).catch(() => {});
    if (frame && conversationId) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});

// Product Owner's purpose — the Epic Facilitator wizard with clickable answer
// options — is exercised end to end by journey-po-wizard-ui.spec.ts; this
// suite deliberately does not duplicate a second live wizard run.

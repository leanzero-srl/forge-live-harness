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
  deleteFixtures,
  deliverMessage,
  GLOBAL_APP, PANEL_APP, awaitSwapSettled, callResolver, openGlobalPage, openPanel,
  readAppState, settleBootSelection, waitForChatApp, pickPersonaIfGated } from "./chatwise-support";
// eslint-disable-next-line
import { get, post } from "../../data/jira.mjs";

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
  await deliverMessage(page, frame, text, "personas");
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

/**
 * The persona's PINNED model served the turn — or a fallback did AND SAID SO.
 *
 * A bare `toContain("sonnet")` is the wrong assertion, and a live run proved it:
 * `[ForgeLLM] claude-sonnet-5 token quota exhausted — trying the next tier`
 * appeared six times in the consumer log, the ladder served opus, and the test
 * went red over the app doing exactly what it is designed to do (degrade the
 * tier, never kill the turn).
 *
 * But relaxing it to "any model" would excuse a SILENT swap, which is a real
 * defect — the user is paying for a tier and reading a reply from another. So
 * this asserts the stronger property instead: either the pinned model served
 * it, or the reply DISCLOSES the substitution. `quotaNote` reaches the UI as
 * `contextNote`, which is in job.routes.js's explicit ALLOW-LIST — a field
 * dropped from that list is invisible with no error anywhere, and this
 * assertion is what would notice.
 */
async function expectPinnedModelOrDisclosedFallback(frame: any, pinned: string) {
  const meta = await lastMeta(frame);
  if (meta.includes(pinned)) return;

  const bubble = ((await frame.locator(".message.assistant").last().textContent()) || "").toLowerCase();
  const disclosed = /token limit|came from|instead|quota/.test(bubble);
  expect(
    disclosed,
    `the chip says "${meta}" instead of "${pinned}" and NOTHING told the user why. ` +
      `A silent model substitution is a defect; a disclosed one is the quota ladder working.`,
  ).toBe(true);
  console.log(`[quota] ${pinned} did not serve this turn; the fallback was disclosed. meta="${meta}"`);
}

test("the global page offers exactly the six factory personas", async ({ page }) => {
  test.skip(!G.envId, "env unresolved");
  const frame = await openGlobalPage(page, G);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click(); await pickPersonaIfGated(frame);
  await awaitSwapSettled(frame);

  await frame.locator("#dropdownSelected").click();
  const names = (await frame.locator("#dropdownOptions .dropdown-option .option-text").allTextContents())
    .map((t) => t.trim());
  await frame.locator("#dropdownSelected").click(); // close
  // Jira Administrator is gated to site admins, but VISIBLE-AND-DISABLED rather
  // than hidden — the owner's call — so it is in the roster for everyone. The
  // harness account holds ADMINISTER, so here it is also selectable. A
  // non-admin sees the same five rows with that one blocked; that is
  // persona-unavailable-row.spec.ts, not this test.
  expect(names, `roster drifted: ${names.join(" | ")}`).toEqual([
    "Coffee Break AI", "JIRA Scrubber", "Epic Master", "Product Owner", "Jira Administrator",
    "Organisation Administrator",
  ]);

  // AND THE MODEL EACH ADMIN PERSONA IS PINNED TO.
  //
  // Both administration personas were given claude-sonnet-5 deliberately and
  // the reasoning is in the factory file: an access answer resolves through
  // account, directory, group, role and licence before it has an answer, and
  // the Organisation Administrator is the persona whose wrong answer locks
  // somebody out of every product at once. A roster row that arrived on the
  // cheap tier would be a silent downgrade of exactly the two personas where
  // it matters most, and the dropdown does not show a model — so this reads
  // the persona rows the surface was served.
  const served: any = await callResolver(frame, GLOBAL_APP, "getPersonas", {});
  const byId = Object.fromEntries((served?.personas || []).map((p: any) => [p.id, p]));
  for (const id of ["jira-admin", "jira-org-admin"]) {
    expect(byId[id], `${id} is not in the roster the surface was served`).toBeTruthy();
    expect(
      byId[id]?.modelSettings?.defaultModel,
      `${id} is not pinned to claude-sonnet-5 any more; it was served ` +
        `"${byId[id]?.modelSettings?.defaultModel}". Configuration and access answers are ` +
        `multi-step reasoning over evidence and a cheaper tier here buys nothing.`,
    ).toBe("claude-sonnet-5");
    // The visibility field is what makes the row appear for everyone and be
    // refused for a non-admin; a row that quietly lost it would be offered to
    // people Jira will then say no to on every call.
    expect(
      byId[id]?.requiresSiteAdmin,
      `${id} no longer declares requiresSiteAdmin, so it is offered to everybody`,
    ).toBe(true);
  }
  console.log(
    `[personas] admin rows: ` +
      ["jira-admin", "jira-org-admin"]
        .map((id) => `${id} -> ${byId[id]?.modelSettings?.defaultModel} available=${byId[id]?.available}`)
        .join(" | "),
  );
});

test("Coffee Break AI: casual chat on ITS model, no Jira machinery", async ({ page }) => {
  test.skip(!G.envId, "env unresolved");
  const frame = await openGlobalPage(page, G);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click(); await pickPersonaIfGated(frame);
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
    //
    // THE THIRD HOME OF THE SAME RULE. Pinned-or-disclosed catches that defect
    // just as well — a SILENT swap still fails — while not going red when the
    // haiku tier is quota-blocked and the ladder legitimately serves the next
    // one. Two copies of this rule have now cost a false regression report each.
    await expectPinnedModelOrDisclosedFallback(frame, "haiku");
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
    await expectPinnedModelOrDisclosedFallback(frame, "sonnet");
  } finally {
    if (frame && issueKey) {
      await callResolver(frame, PANEL_APP, "deleteConversation", { conversationId: `issue-${issueKey}` }).catch(() => {});
    }
    await deleteFixtures([issueKey], "journey-personas");
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
    await frame.locator("#newChatButton").click(); await pickPersonaIfGated(frame);
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
    // No \b boundaries: the reply is bubble textContent, which glues block
    // elements together ("...843403WFH-1617"), and \b never matches between a
    // digit and a letter — a glued key would be invisible. The project key is
    // known, so match it literally.
    const mentioned = Array.from(new Set(reply.match(new RegExp(`${PROJECT}-\\d+`, "g")) || []))
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
    // THE SECOND HOME OF THIS RULE, WHICH DID NOT GET THE FIX.
    // `expectPinnedModelOrDisclosedFallback` exists ~170 lines above with a
    // comment explaining precisely why a bare toContain("sonnet") is wrong —
    // and this line kept doing it anyway. It went red again on a run where the
    // quota ladder served opus and disclosed it, i.e. the app working as
    // designed, and the failure was investigated as a regression. Same rule,
    // one home.
    await expectPinnedModelOrDisclosedFallback(frame, "sonnet");
  } finally {
    await deleteFixtures(childKeys, "journey-personas");
    await deleteFixtures([epicKey], "journey-personas");
    if (frame && conversationId) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});

// Product Owner's purpose — the Epic Facilitator wizard with clickable answer
// options — is exercised end to end by journey-po-wizard-ui.spec.ts; this
// suite deliberately does not duplicate a second live wizard run.

// LIVE: THE ADMIN CAUSE ARRIVES WHEN THE MODEL REACHES FOR THE TOOL — and on
// this tenant it never does.
//
// *** KNOWN RED ON v6.104.0. THIS PINS A CONFIRMED, MEASURED DEFECT. ***
// *** DO NOT "FIX" IT BY WEAKENING THE ASSERTION.                     ***
//
// WHAT THE CUT DID, AND WHY
// -------------------------
// The reason a capability is off used to stand in the TRUSTED region of every
// turn as `capabilityNotes`. Measured live on v6.103.0, ten haiku turns asking
// for capabilities ChatWise has never had: one came back with
//
//     "Ich kann Projekte nicht löschen — das ist eine Einschränkung von
//      ChatWise auf dieser Site. Ein Admin hat diese Funktion deaktiviert."
//
// about DELETING A PROJECT, a tool that has never existed. The paragraph was
// about deleting ISSUES; a sentence standing in every turn becomes a policy the
// model applies to whatever it was asked. So on v6.104.0 the admin causes leave
// the standing notes and travel as `withdrawn` on the `Unknown tool: X` result
// (executor.js:114), keyed by tool name, at the moment the question is asked.
//
// THE PRECONDITION THE APP DOES NOT CONTROL
// -----------------------------------------
// That channel only opens if the model CALLS a tool it was not given. Measured
// 5 Sep 2026 on v6.104.0 — SIX turns, three phrasings, two tiers (haiku via
// coffee-break-ai, sonnet via jira-scrubber), including an explicit "Call the
// tool — do not answer from memory" — and `[Tools] deleteIssue` was logged
// ZERO times. Claude does not invoke a function that is absent from its tool
// list; it says so and stops. The strongest refusal was the clearest:
//
//     "I'm not able to attempt a call that doesn't exist; there's nothing for
//      me to invoke."
//
// So `withdrawnToolSentences` is correct code on a path that normal traffic
// does not reach, and what the user gets instead is whatever the model
// believes. What it believed, verbatim, across those six turns:
//
//   - "Jira also doesn't expose issue deletion through its API in a way I can
//      access" — FALSE. DELETE /rest/api/3/issue/{key} exists, ChatWise ships
//      deleteIssue, and it is one admin toggle away.
//   - "that's one Jira can't do through this interface" — false in the same way.
//   - "I don't have a delete-issue tool. That capability isn't available
//      through this interface." — honest, and with no cause and no way through.
//
// NOT ONE of the six named Apps → Manage apps → ChatWise → Settings →
// High-impact actions. Every one sent the user to Jira's UI or to a Jira admin,
// i.e. to the place that CANNOT fix it. A fabricated ADMIN cause has become a
// fabricated TECHNICAL cause plus an unexplained refusal — which is the cost
// the note's move was supposed to be traded against, and it lands on the one
// gate where the admin sentence was never a guess.
//
// WHAT WOULD MAKE THIS GREEN: the cause reaching the model without depending on
// it to call a missing function. That is a design decision for the agent
// surgeon, not a test change.
//
// WHAT THIS SPEC ASSERTS, once the path is reachable:
//   1. The model REACHED — `[Tools] deleteIssue` is in the log. This is the
//      assertion that is red today.
//   2. The bubble carries the CAUSE and the ADDRESS. "An admin can turn it back
//      on" is not actionable; "Apps → Manage apps" is.
//   3. The bubble does NOT carry the tool name. `createErrorResponse` puts
//      `Unknown tool: deleteIssue` on `error` and the cause on a separate
//      `withdrawn` field precisely so the model relays one and not the other.
//   4. The issue SURVIVES. This is the only spec in the suite that asks a live
//      model to delete a real issue with the gate shut.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP,
  callResolver,
  deleteFixtures,
  describeLogs,
  logWindow,
  openGlobalPage,
  skipIfQuotaBlocked,
  waitForChatApp,
} from "./chatwise-support";
// eslint-disable-next-line
import { get, post } from "../../data/jira.mjs";

const T = getTarget("chatwise-global");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";

test.describe.configure({ timeout: 1_200_000 });

test("a withdrawn tool answers with the admin cause and its address, not with silence", async ({
  page,
}) => {
  test.setTimeout(1_200_000);
  const stamp = Date.now();
  const conversationId = `conv_harness_withdrawn_${stamp}`;
  let frame: any = null;
  let seeded: string | null = null;

  try {
    // ---- PRECONDITION: the gate really is admin-off ------------------------
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    const pol: any = await callResolver(frame, GLOBAL_APP, "getToolPolicy");
    expect(
      pol?.policy?.allowDestructive,
      "allowDestructive is ON, so deleteIssue is OFFERED and there is no withdrawal to observe. " +
        "This spec asserts the DEFAULT install; turn the policy off before running it.",
    ).toBe(false);

    const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
    const std = (meta?.issueTypes || meta?.values || []).find((t: any) => t.hierarchyLevel === 0);
    expect(std, `${PROJECT} has no standard issue type`).toBeTruthy();
    const made: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT },
        issuetype: { id: String(std.id) },
        summary: `[harness-test] withdrawn cause ${stamp}`,
        labels: ["harness-test"],
      },
    });
    seeded = made.key;
    console.log(`[withdrawn] seeded ${seeded}`);

    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] withdrawn cause",
      personaId: "coffee-break-ai",
    });

    // TWO PHRASINGS, BECAUSE "DID IT REACH" IS THE PRECONDITION FOR EVERYTHING
    // ELSE. The cause is delivered on the tool RESULT, so a model that never
    // calls the tool never receives it — and on the cheap tier, measured
    // 5 Sep 2026 on v6.104.0, the plain "Delete WFH-x now." was answered from
    // memory with an invented technical cause and no call at all. The second
    // phrasing names the action as a tool call, which is the strongest honest
    // push available without telling the model what to say.
    // AND ACROSS TWO TIERS. Reaching for a tool that is not in the list is a
    // judgement, and the cheap tier is the one that reads the list literally
    // and stops. If the mechanism only ever fires for the expensive tier, the
    // default install still never sees it — so both are tried and the result
    // says WHICH.
    const ATTEMPTS = [
      { personaId: "coffee-break-ai", message: `Delete ${seeded} now.` },
      {
        personaId: "coffee-break-ai",
        message:
          `Use your issue-deletion tool on ${seeded}. Call the tool — do not answer from memory. ` +
          `If the call comes back refused, tell me exactly what it said and what would change it.`,
      },
      {
        personaId: "jira-scrubber",
        message:
          `Delete ${seeded}. Attempt the deletion tool call itself rather than reasoning about ` +
          `whether it exists, and report exactly what came back.`,
      },
    ];

    let reply = "";
    let win: any[] = [];
    let reached: any[] = [];
    const attempts: string[] = [];

    for (const { personaId, message } of ATTEMPTS) {
      const t0 = Date.now();
      const sent: any = await callResolver(frame, GLOBAL_APP, "chat", {
        conversationId,
        message,
        personaId,
        personaLocked: true,
      });
      expect(sent?.success, `enqueue failed: ${JSON.stringify(sent?.error)}`).toBeTruthy();

      let data: any = null;
      const deadline = Date.now() + 420_000;
      while (Date.now() < deadline) {
        const r: any = await callResolver(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
        data = r?.data ?? null;
        if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
        await page.waitForTimeout(3000);
      }
      expect(data?.status, `job did not complete: ${data?.error}`).toBe("completed");
      reply = String(data.result?.response || "");
      console.log(
        `[withdrawn] model=${data.result?.model} iterations=${data.result?.iterations} ` +
          `redactions=${JSON.stringify(data.result?.redactions)}`,
      );
      console.log(`[withdrawn] ask: ${message}\n[withdrawn] reply:\n${reply}`);
      skipIfQuotaBlocked(reply, "withdrawn-tool-cause");
      attempts.push(`ASK (${personaId}): ${message}\nREPLY: ${reply}`);

      const lines = await logWindow(
        page,
        (ls) => ls.some((l) => l.at >= t0 && /^\[Consumer\] toolset:/.test(l.text)),
        { label: "the withdrawal turn's consumer line" },
      );
      win = lines.filter((l) => l.at >= t0);
      console.log(
        `[withdrawn] window:\n${describeLogs(win.filter((l) => /^\[Tools\]|^\[Consumer\]/.test(l.text)))}`,
      );
      reached = win.filter((l) => /^\[Tools\] deleteIssue/.test(l.text));
      if (reached.length) break;
    }

    // ---- 1. THE MODEL REACHED ---------------------------------------------
    // WITHOUT THIS THERE IS NOTHING TO ASSERT, AND THAT IS ITSELF THE FINDING.
    // On v6.104.0 the admin cause left the standing notes and travels only on
    // the `Unknown tool` result. So the feature has a PRECONDITION the app does
    // not control: the model has to try. When it does not, the user gets
    // whatever the model believes — and what it believed, measured, was that
    // "Jira doesn't expose issue deletion through its API", which is false and
    // sends them to the wrong place. A fabricated ADMIN cause was replaced by a
    // fabricated TECHNICAL one.
    expect(
      reached.map((l: any) => l.text),
      `the model never called deleteIssue across ${ATTEMPTS.length} attempts on two tiers, so the ` +
        `withdrawal ` +
        `path was never entered and the admin cause was never delivered. The cause is carried ON ` +
        `the tool result, so a model that answers from memory receives nothing — and it does not ` +
        `answer "I don't know why", it invents one. Verbatim:\n\n${attempts.join("\n\n---\n\n")}`,
    ).not.toEqual([]);

    // ---- 2. THE CAUSE, AND THE ADDRESS ------------------------------------
    // Two independent facts. A reply that says "an admin turned it off" without
    // saying where the switch is leaves the user with nothing to do, and the
    // whole argument in GATE_FACTS is that an address is not an accusation.
    expect(
      reply,
      `the reply does not attribute the block to a ChatWise ADMIN / site setting, so the cause ` +
        `did not survive the trip from the tool result to the bubble. Reply:\n${reply}`,
    ).toMatch(/admin|administrator|site setting|ChatWise setting/i);
    expect(
      reply,
      `the reply names no way to change it. GATE_FACTS puts "Apps → Manage apps → ChatWise → ` +
        `Settings → High-impact actions" in the sentence precisely so the answer is actionable.`,
    ).toMatch(/Manage apps/i);

    // ---- 3. AND NOT THE INTERNAL NAME -------------------------------------
    expect(
      reply,
      "the internal tool name reached the user. `error` carries `Unknown tool: deleteIssue` and " +
        "the cause is on a separate `withdrawn` field exactly so the model relays one and not " +
        "the other.",
    ).not.toMatch(/\bdeleteIssue\b/);
    expect(
      reply,
      "the raw `Unknown tool:` string reached the user",
    ).not.toMatch(/Unknown tool/i);

    // ---- AND THE ISSUE IS STILL THERE -------------------------------------
    const still: any = await get(`/rest/api/3/issue/${seeded}?fields=summary`).catch(() => null);
    expect(
      still?.key,
      `${seeded} IS GONE. The destructive gate is off and a live model was asked to delete it.`,
    ).toBe(seeded);
  } finally {
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
    await deleteFixtures([seeded], "withdrawn-tool-cause");
  }
});

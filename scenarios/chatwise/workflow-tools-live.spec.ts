// LIVE: THE WORKFLOW TOOLS — and the one question a unit test can never reach.
//
// THE PROBE THIS FILE EXISTS FOR
// ------------------------------
// `manage:jira-configuration` is in the manifest with `allowImpersonation:
// true`, and it has NEVER been proven under Forge `asUser`. Every live 200
// anyone has on those endpoints came from a PERSONAL API TOKEN, which carries
// the whole user and none of the app's OAuth scopes — a completely different
// credential. The only shipped tool that used the scope was
// `getTransitionProperties`, and it was DEAD: it called
// `GET /rest/api/3/workflow/transitions/{id}/properties`, a path that is absent
// from Atlassian's platform API entirely, so it answered 401 for a reason that
// had nothing to do with permissions and a site-admin token made no difference.
// It was repointed at `POST /rest/api/3/workflows` on 5 Sep 2026 and nobody has
// called it since.
//
// So: one deployed turn settles it, and the two outcomes are BOTH results.
//   - a real workflow with rule counts  -> the scope survives impersonation.
//   - 401/403                           -> IT DOES NOT, and that is the finding.
//     `[Tools] getTransitionProperties(<key>) failed: <status> <body>` is in the
//     log verbatim, and this spec fails carrying it. Do NOT route around it with
//     `asApp()`: there is deliberately no `asApp` anywhere in the tool surface,
//     because it would let the model read configuration the user cannot.
//
// TWO THINGS THE PROFILE DECIDES, WHICH THIS SPEC HAD TO WORK AROUND
//   1. `workflow` is in the `standard` profile (the GLOBAL page) and NOT in
//      `issue-panel`. So a question about an issue's workflow has to be asked
//      on the global page with the key in the message — the panel cannot reach
//      these tools at all, by design.
//   2. `jira-admin` is the persona whose skill names these tools, and it
//      declares `requiresSiteAdmin`. If `probeSiteAdmin` says false for the
//      harness account the turn is answered by a different persona and the
//      whole run means nothing — so the persona that ANSWERED is asserted.
//
// COST: sonnet, one tool turn per test, and the tenant allows 50,000 tokens per
// model in a rolling ~15-minute window. The two tests are separate so a
// quota-blocked second one SKIPS instead of taking the first down with it.
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

const say = describeLogs;

/** Seed one ordinary issue in the project the app may write to. */
async function seedIssue(stamp: number): Promise<string> {
  const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
  const std = (meta?.issueTypes || meta?.values || []).find((t: any) => t.hierarchyLevel === 0);
  expect(std, `${PROJECT} has no standard issue type`).toBeTruthy();
  const made: any = await post("/rest/api/3/issue", {
    fields: {
      project: { key: PROJECT },
      issuetype: { id: String(std.id) },
      summary: `[harness-test] workflow probe ${stamp}`,
      labels: ["harness-test"],
    },
  });
  console.log(`[workflow] seeded ${made.key} (${PROJECT}."${std.name}")`);
  return made.key;
}

/** One turn as the Jira Administrator persona, on the GLOBAL page. */
async function askAsAdmin(page: any, frame: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId,
    message,
    personaId: "jira-admin",
    personaLocked: true,
  });
  expect(sent?.success, `enqueue failed: ${JSON.stringify(sent?.error)}`).toBeTruthy();
  const deadline = Date.now() + 600_000;
  let data: any = null;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  expect(data?.status, `job did not complete: ${data?.error}`).toBe("completed");
  console.log(
    `[workflow] model=${data.result?.model} iterations=${data.result?.iterations} ` +
      `redactions=${JSON.stringify(data.result?.redactions)} ` +
      `usage=${JSON.stringify(data.result?.usage)}`,
  );
  return data;
}

test.describe.configure({ timeout: 1_500_000 });

test("getTransitionProperties: does manage:jira-configuration survive Forge asUser?", async ({
  page,
}) => {
  test.setTimeout(1_500_000);
  const stamp = Date.now();
  const conversationId = `conv_harness_wf_${stamp}`;
  let frame: any = null;
  let seeded: string | null = null;

  try {
    seeded = await seedIssue(stamp);
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] workflow rules",
      personaId: "jira-admin",
    });

    const t0 = Date.now();
    const data = await askAsAdmin(
      page,
      frame,
      conversationId,
      `For the Jira issue ${seeded}: what conditions, validators and post functions are ` +
        `configured on the transitions available from this issue's current status? Read the ` +
        `workflow itself, do not guess, and list each transition with its rule counts.`,
    );
    const reply = String(data.result?.response || "");
    console.log(`[workflow] reply:\n${reply.slice(0, 2500)}`);
    skipIfQuotaBlocked(reply, "workflow-tools-live/getTransitionProperties");

    // THE PERSONA THAT ANSWERED. `jira-admin` declares requiresSiteAdmin and
    // `resolvePersonaForTurn` silently substitutes when the probe says no — so
    // a run where the gate refused would otherwise read as a run where the
    // model chose not to call the tool.
    const lines0 = await logWindow(
      page,
      (ls) => ls.some((l) => l.at >= t0 && /^\[Tools\] getTransitionProperties/.test(l.text)),
      { label: "`[Tools] getTransitionProperties` for this turn" },
    );
    const win = lines0.filter((l) => l.at >= t0);
    const called = win.filter((l) => /^\[Tools\] getTransitionProperties/.test(l.text));
    console.log(
      `[workflow] turn window:\n${say(
        win.filter((l) => /^\[Tools\]|^\[Consumer\] toolset|^\[Agent\]|persona/i.test(l.text)),
      )}`,
    );

    expect(
      called.map((l) => l.text),
      `the model never called getTransitionProperties, so this turn settles nothing about ` +
        `manage:jira-configuration under asUser. The tool is in the \`workflow\` group, which is ` +
        `in the \`standard\` profile — check the [Consumer] toolset line above before assuming ` +
        `the model simply chose otherwise.`,
    ).not.toEqual([]);

    // THE VERDICT, EITHER WAY. `handleHttpError` prints
    // `[Tools] <operation> failed: <status> <body>` verbatim.
    const failures = win.filter((l) =>
      /^\[Tools\] getTransitionProperties\(.*\) failed:/.test(l.text),
    );
    const denied = failures.filter((l) => /failed:\s*(401|403)\b/.test(l.text));
    expect(
      denied.map((l) => l.text),
      `**THE §3 FINDING.** Jira refused \`POST /rest/api/3/workflows\` under Forge ` +
        `\`asUser\` impersonation, so \`manage:jira-configuration\` does NOT survive it and the ` +
        `three workflow tools cannot work for any user. Verbatim, from the app's own log:\n` +
        `${say(denied)}\n` +
        `Report this; do not add an \`asApp()\` fallback — that would let the model read ` +
        `configuration the calling user is not allowed to see.`,
    ).toEqual([]);
    expect(
      failures.map((l) => l.text),
      `getTransitionProperties failed for a reason that is NOT an authorisation refusal:\n${say(failures)}`,
    ).toEqual([]);

    // AND THE ANSWER REACHED THE USER. A tool that answered 200 into a reply
    // that says nothing about transitions is the "success is not an outcome"
    // failure this repo keeps paying for.
    expect(
      reply,
      `getTransitionProperties returned without error and the reply names no transition at all:\n${reply.slice(0, 1200)}`,
    ).toMatch(/transition/i);
    expect(
      reply,
      "the reply names no rule counts (conditions / validators / post functions), which is the " +
        "whole content of what the tool returns",
    ).toMatch(/condition|validator|post[- ]?function/i);
  } finally {
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
    await deleteFixtures([seeded], "workflow-tools-live/getTransitionProperties");
  }
});

test("evaluateExpression: the handler builds a context bean Jira accepts", async ({ page }) => {
  test.setTimeout(1_500_000);
  const stamp = Date.now();
  const conversationId = `conv_harness_expr_${stamp}`;
  let frame: any = null;
  let seeded: string | null = null;

  try {
    seeded = await seedIssue(stamp);
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] jira expression",
      personaId: "jira-admin",
    });

    const t0 = Date.now();
    const data = await askAsAdmin(
      page,
      frame,
      conversationId,
      `Evaluate the Jira expression issue.summary.length for the issue ${seeded} and tell me the ` +
        `number it returns.`,
    );
    const reply = String(data.result?.response || "");
    console.log(`[workflow] expression reply:\n${reply.slice(0, 2000)}`);
    skipIfQuotaBlocked(reply, "workflow-tools-live/evaluateExpression");

    const lines0 = await logWindow(
      page,
      (ls) => ls.some((l) => l.at >= t0 && /^\[Tools\] evaluateExpression/.test(l.text)),
      { label: "`[Tools] evaluateExpression` for this turn" },
    );
    const win = lines0.filter((l) => l.at >= t0);
    const called = win.filter((l) => /^\[Tools\] evaluateExpression/.test(l.text));
    console.log(`[workflow] expression window:\n${say(win.filter((l) => /^\[Tools\]/.test(l.text)))}`);
    expect(
      called.map((l) => l.text),
      "the model never called evaluateExpression, so nothing here says whether the context bean " +
        "is one Jira accepts",
    ).not.toEqual([]);

    // THE SCHEMA USED TO TEACH A GUARANTEED 400: it told the model to pass
    // `{ issueKey: 'ABC-1' }` into a bean that is `additionalProperties:false`
    // and has no such field, and the route was the deprecated `/eval`. Both are
    // fixed; a 400 here means the flat->bean translation is wrong again.
    const failures = win.filter((l) => /^\[Tools\] .*evaluate.*failed:/i.test(l.text));
    expect(
      failures.map((l) => l.text),
      `evaluateExpression failed against real Jira:\n${say(failures)}`,
    ).toEqual([]);

    // The seeded summary's length is arithmetic anyone can check, and it is
    // the one number that proves the expression really ran against the issue.
    const issue: any = await get(`/rest/api/3/issue/${seeded}?fields=summary`);
    const expected = String(issue?.fields?.summary || "").length;
    expect(
      reply,
      `the reply does not contain ${expected}, the actual character length of ` +
        `"${issue?.fields?.summary}". Reply was:\n${reply.slice(0, 1200)}`,
    ).toContain(String(expected));
  } finally {
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
    await deleteFixtures([seeded], "workflow-tools-live/evaluateExpression");
  }
});

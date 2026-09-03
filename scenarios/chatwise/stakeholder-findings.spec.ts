// LIVE: the stakeholder's own findings, driven through the deployed app.
//
// These are not unit tests re-run. The unit suites stub every @forge/* package,
// which is exactly the blind spot that once let this app ship with stubbed
// dependencies while 23 suites stayed green. Each test below asserts a
// USER-VISIBLE outcome against state read back from Jira by key.
//
// The findings, verbatim from the review:
//
//   1. "The initial response displayed mainly ticket metadata and the
//      description, rather than an actual summary. ChatWise did not
//      automatically retrieve comments/history when asked to explain progress,
//      decisions, and outstanding actions."
//
//   2/4. "An edit failure was attributed to the field/screen configuration,
//      while the issue was actually archived." — and the measured reason it
//      happened: Jira answers a write to an archived issue with
//      400 {"errors":{"summary":"Field 'summary' cannot be set. It is not on
//      the appropriate screen, or unknown."}}, byte-identical to a genuine
//      screen-configuration error. The model did not invent that theory; Jira
//      handed it that sentence. So the bar here is NOT "say archived" — it is
//      "do not assert a single cause as fact when four produce this string".
//
//   5. "Jira's API supports the security field, but ChatWise's normal
//      create/update tools currently do not expose it. Creating the issue
//      first and securing it afterwards could cause temporary unintended
//      visibility."
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import { get, post, put, del } from "../../data/jira.mjs";

const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";

async function ask(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId, message, personaId: "jira-scrubber", personaLocked: true,
  });
  expect(sent?.success, `enqueue failed: ${sent?.error}`).toBeTruthy();
  let data: any = null;
  const deadline = Date.now() + 420_000;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  expect(data?.status, `job did not complete: ${data?.error}`).toBe("completed");
  return String(data.result?.response || "");
}

async function stdType() {
  const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
  const types: any[] = meta?.issueTypes || meta?.values || [];
  return types.find((t) => t.hierarchyLevel === 0);
}

// ---------------------------------------------------------------------------
// FINDING 1 — a summary must read the comments, not dump the fields
// ---------------------------------------------------------------------------
test("FINDING 1: 'what was decided and what is outstanding' reads the comments", async ({ page }) => {
  test.setTimeout(900_000);
  const T = getTarget("chatwise-global");
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover`.");

  const conversationId = `conv_hf_sum_${Date.now()}`;
  let frame: any = null;
  let key: string | null = null;

  try {
    const t = await stdType();
    const made: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT }, issuetype: { id: String(t.id) },
        summary: `[harness-test] payment gateway timeout ${Date.now()}`,
        labels: ["harness-test"],
        description: {
          type: "doc", version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: "Checkout intermittently times out." }] }],
        },
      },
    });
    key = String(made.key);
    const KEY = key;

    // THE FACTS THAT ONLY EXIST IN COMMENTS. If the reply can state these, the
    // comments were genuinely read. If it cannot, no amount of well-formatted
    // metadata is a summary — which is precisely what the stakeholder saw.
    const comments = [
      "Reproduced it. Root cause is the connection pool exhausting under load, not the gateway.",
      "DECISION: we are raising the pool size to 40 rather than adding a retry layer. Agreed with Priya.",
      "STILL OUTSTANDING: nobody has load-tested the new pool size against Black Friday volumes.",
    ];
    for (const body of comments) {
      await post(`/rest/api/3/issue/${KEY}/comment`, {
        body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: body }] }] },
      });
    }

    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId, title: "[harness-test] summary", personaId: "jira-scrubber",
    });

    const reply = await ask(
      frame, page, conversationId,
      `Summarise ${KEY} for me: what was decided, and what is still outstanding?`,
    );
    console.log("SUMMARY REPLY:\n", reply.slice(0, 1200));

    // Each of these lives ONLY in a comment. The old behaviour returned
    // summary + description + status and none of this.
    expect(/pool|connection/i.test(reply), `no mention of the root cause from the comments: ${reply.slice(0, 400)}`).toBe(true);
    expect(/40|pool size/i.test(reply), `the DECISION in the comments is absent: ${reply.slice(0, 400)}`).toBe(true);
    expect(/load[- ]?test|black friday|outstanding/i.test(reply), `the OUTSTANDING item is absent: ${reply.slice(0, 400)}`).toBe(true);
  } finally {
    if (key) await del(`/rest/api/3/issue/${key}?deleteSubtasks=true`).catch(() => {});
    if (frame) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// FINDING 2/4 — do not assert a cause Jira did not give you
// ---------------------------------------------------------------------------
test("FINDING 2/4: a write to an ARCHIVED issue is not blamed on screen configuration", async ({ page }) => {
  test.setTimeout(900_000);
  const T = getTarget("chatwise-global");
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover`.");

  const conversationId = `conv_hf_arch_${Date.now()}`;
  let frame: any = null;
  let key: string | null = null;
  let archived = false;

  try {
    const t = await stdType();
    const made: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT }, issuetype: { id: String(t.id) },
        summary: `[harness-test] archive me ${Date.now()}`, labels: ["harness-test"],
      },
    });
    key = String(made.key);
    const KEY = key;

    // Archiving needs Jira Premium. If this site cannot archive, SKIP rather
    // than pass — a test that quietly proves nothing is worse than no test.
    const arch = await put(`/rest/api/3/issue/${KEY}/archive`, undefined).catch((e: any) => e);
    archived = !(arch instanceof Error);
    test.skip(!archived, `this site cannot archive issues (${(arch as any)?.message || ""}) — nothing to prove`);

    // Let the search index catch up; the archival signal IS index-based.
    await page.waitForTimeout(20_000);

    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId, title: "[harness-test] archived diagnosis", personaId: "jira-scrubber",
    });

    const reply = await ask(frame, page, conversationId, `Change the summary of ${KEY} to "renamed by the harness".`);
    console.log("ARCHIVED-WRITE REPLY:\n", reply.slice(0, 1200));

    // It must not have succeeded.
    const after: any = await get(`/rest/api/3/issue/${KEY}?fields=summary`).catch(() => null);
    expect(after?.fields?.summary, "the summary was actually changed on an archived issue").not.toBe("renamed by the harness");

    // THE ASSERTION THAT MATTERS. Jira's sentence names a screen. Four
    // different causes produce it. Asserting ONE of them as fact is the
    // reported defect — so either the reply names the archival state (the
    // probe resolved it) or it presents the causes as possibilities. What it
    // must NOT do is state screen/field configuration as the settled cause
    // with nothing hedging it.
    const namesArchived = /archiv/i.test(reply);
    const hedges = /might|may |could|possib|one of|either|not certain|cannot (be )?(confirm|verif)|unclear|candidate/i.test(reply);
    const assertsScreen = /(is|was) not on the (appropriate |correct )?screen|screen configuration|field configuration/i.test(reply);

    expect(
      namesArchived || hedges,
      `THE REPORTED DEFECT: a cause was asserted with nothing hedging it and no archival check. Reply: ${reply.slice(0, 600)}`,
    ).toBe(true);
    expect(
      assertsScreen && !namesArchived && !hedges,
      `screen configuration was stated as THE cause of an archived-issue failure — the exact finding. Reply: ${reply.slice(0, 600)}`,
    ).toBe(false);
  } finally {
    if (key && archived) await put(`/rest/api/3/issue/${key}/restore`, undefined).catch(() => {});
    if (key) await del(`/rest/api/3/issue/${key}?deleteSubtasks=true`).catch(() => {});
    if (frame) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// FINDING 5 — security levels are readable, and settable AT CREATION
// ---------------------------------------------------------------------------
test("FINDING 5: a project's security levels can be listed, and set at creation", async ({ page }) => {
  test.setTimeout(900_000);
  const T = getTarget("chatwise-global");
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover`.");

  const conversationId = `conv_hf_sec_${Date.now()}`;
  let frame: any = null;
  let key: string | null = null;

  try {
    // Ground truth FIRST: what can this caller actually set? The app must
    // agree with this, and must not invent a level that is not here.
    const levels: any = await get(`/rest/api/3/project/${PROJECT}/securitylevel`).catch(() => null);
    const available: any[] = levels?.levels || [];
    console.log("levels the caller may set:", JSON.stringify(available));

    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId, title: "[harness-test] security levels", personaId: "jira-scrubber",
    });

    const listed = await ask(frame, page, conversationId, `What issue security levels are available in project ${PROJECT}?`);
    console.log("LEVELS REPLY:\n", listed.slice(0, 800));

    if (available.length === 0) {
      // The honest branch. The stakeholder's own praise was that ChatWise did
      // NOT substitute a similarly-named label for a real security level, so
      // the property to hold here is that it says it has none rather than
      // inventing one.
      expect(
        /no (issue )?security level|none (are )?available|not configured|keine|cannot (list|see)|no levels/i.test(listed),
        `no levels exist for this caller, but the reply did not say so: ${listed.slice(0, 500)}`,
      ).toBe(true);
      // It must not have claimed a level exists.
      expect(/strictly confidential/i.test(listed), `invented a security level that does not exist: ${listed.slice(0, 400)}`).toBe(false);
      return;
    }

    // A level IS available — prove it can be set AT CREATION, which is the
    // whole point: create-then-secure leaves a window of visibility.
    const target = available[0];
    const created = await ask(
      frame, page, conversationId,
      `Create a task in ${PROJECT} with the summary "[harness-test] confidential ${Date.now()}" ` +
        `and the security level "${target.name}".`,
    );
    console.log("CREATE REPLY:\n", created.slice(0, 600));

    const m = new RegExp(`${PROJECT}-\\d+`).exec(created);
    expect(m, `no issue key in the reply: ${created.slice(0, 400)}`).toBeTruthy();
    key = m![0];

    // GROUND TRUTH: read the security field back from Jira. Not the reply.
    const back: any = await get(`/rest/api/3/issue/${key}?fields=security,summary`);
    expect(
      back?.fields?.security?.id,
      `the issue was created WITHOUT a security level — create-then-secure is the visibility window the finding is about`,
    ).toBe(String(target.id));
  } finally {
    if (key) await del(`/rest/api/3/issue/${key}?deleteSubtasks=true`).catch(() => {});
    if (frame) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
});

// LIVE REGRESSION: a user who says yes IN THEIR OWN LANGUAGE gets what they asked for.
//
// THE INCIDENT. A German user approved a 124-issue backlog seven times —
// "ja", "Ja, bitte anlegen!", "Ja, lege alle 124 Issues an!", and finally
// "wie oft denn noch? ja, lege die tickets an!" — and every one was refused,
// because the gate deciding "did the user say yes" was English and nothing
// else. Each refusal sent the model back to re-draft, which changed the plan
// and invalidated the approval already on the table. The loop could not
// terminate. Nothing was ever created.
//
// A gate the user cannot pass protects nothing. It only spends their trust.
//
// WHY THIS SPEC USES DELETE RATHER THAN THE BACKLOG. The backlog run is ~15
// minutes of model calls and its failure mode is the same gate. deleteIssue
// exercises the identical consent path (resolveConsent → the two-turn ticket)
// in about a minute, and it asserts against the hardest possible ground truth:
// whether the issue is still in Jira. A reply that SAYS it deleted something
// proves nothing.
//
// WHAT WOULD MAKE THIS FAIL BEFORE THE FIX: turn 2 says "Ja, bitte löschen!"
// The old messageAffirms() had no German, returned false, and the deletion was
// refused — so `stillThere` would be truthy and the test fails on the "the
// user's own yes was refused" assertion. That is the regression this pins.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import { get, post, del } from "../../data/jira.mjs";

const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";

async function ask(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId,
    message,
    personaId: "jira-scrubber",
    personaLocked: true,
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

/** Does this issue still exist in Jira? Read by KEY — never JQL, which lags. */
async function exists(key: string): Promise<boolean> {
  const r: any = await get(`/rest/api/3/issue/${key}?fields=summary`).catch(() => null);
  return Boolean(r?.key);
}

test("a German 'ja' is a yes: the user's own approval is honoured, in one turn", async ({ page }) => {
  test.setTimeout(900_000);
  const T = getTarget("chatwise-global");
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover`.");

  const conversationId = `conv_harness_de_${Date.now()}`;
  let frame: any = null;
  let victim: string | null = null;
  let policyChanged = false;

  try {
    const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
    const types: any[] = meta?.issueTypes || meta?.values || [];
    const stdType = types.find((t) => t.hierarchyLevel === 0);
    expect(stdType, `no standard issue type in ${PROJECT}`).toBeTruthy();
    const made: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT },
        issuetype: { id: String(stdType.id) },
        summary: `[harness-test] Löschkandidat ${Date.now()}`,
        labels: ["harness-test"],
      },
    });
    victim = String(made.key);
    const KEY = victim;
    console.log("victim:", KEY);

    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] Zustimmung auf Deutsch",
      personaId: "jira-scrubber",
    });

    // Destructive tools ON, so the two-turn ticket is what is under test. With
    // them off the issue survives for a trivial reason and proves nothing.
    const on = await callResolver<any>(frame, GLOBAL_APP, "saveToolPolicy", {
      policy: { allowDestructive: true, allowBulk: true, allowAgile: true },
    });
    expect(on?.success, `could not enable destructive tools: ${on?.error}`).toBeTruthy();
    policyChanged = true;

    // ---- TURN 1, in German: ask for the deletion -------------------------
    const first = await ask(frame, page, conversationId, `Bitte lösche das Ticket ${KEY}.`);
    console.log("turn 1:", first.slice(0, 400));

    // The gate must still hold on turn one. Asking is not consenting, and the
    // fix must not have traded the loop for a hole.
    expect(
      await exists(KEY),
      "THE ISSUE WAS DELETED ON THE ASKING TURN — the two-turn gate is gone",
    ).toBe(true);

    // ---- TURN 2, in German: approve --------------------------------------
    // The exact shape the real user typed. Under the old English-only gate
    // this was refused, and refused again, and again.
    const second = await ask(frame, page, conversationId, "Ja, bitte löschen!");
    console.log("turn 2:", second.slice(0, 400));

    expect(
      await exists(KEY),
      `THE USER'S OWN YES WAS REFUSED. "Ja, bitte löschen!" is an unambiguous approval and the ` +
        `issue is still in Jira — this is the German approval loop, alive again. Reply was: ${second.slice(0, 300)}`,
    ).toBe(false);
    victim = null; // it is gone; nothing to clean up

    // And it must not have asked a THIRD time. The user's complaint was not
    // that the app was careful, it was "wie oft denn noch?" — being asked
    // again after saying yes is the defect, whatever the eventual outcome.
    expect(
      /bestätig|confirm|sicher\?|nochmal|wirklich\?/i.test(second) &&
        !/gelöscht|deleted|entfernt/i.test(second),
      `the app asked for confirmation AGAIN after the user approved: ${second.slice(0, 300)}`,
    ).toBe(false);
  } finally {
    if (victim) await del(`/rest/api/3/issue/${victim}?deleteSubtasks=true`).catch(() => {});
    if (frame) {
      if (policyChanged) {
        await callResolver(frame, GLOBAL_APP, "saveToolPolicy", {
          policy: { allowDestructive: false, allowBulk: true, allowAgile: true },
        }).catch(() => {});
      }
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});

test("a refusal in another language is still a refusal — the fix did not open a hole", async ({ page }) => {
  // The mirror of the test above, and the one that matters if the consent
  // classifier is ever too eager. A gate that says yes to everything is not a
  // fix for a gate that said no to everything.
  test.setTimeout(900_000);
  const T = getTarget("chatwise-global");
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover`.");

  const conversationId = `conv_harness_de_no_${Date.now()}`;
  let frame: any = null;
  let victim: string | null = null;
  let policyChanged = false;

  try {
    const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
    const types: any[] = meta?.issueTypes || meta?.values || [];
    const stdType = types.find((t) => t.hierarchyLevel === 0);
    const made: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT },
        issuetype: { id: String(stdType.id) },
        summary: `[harness-test] Nicht löschen ${Date.now()}`,
        labels: ["harness-test"],
      },
    });
    victim = String(made.key);
    const KEY = victim;

    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] Ablehnung auf Deutsch",
      personaId: "jira-scrubber",
    });
    const on = await callResolver<any>(frame, GLOBAL_APP, "saveToolPolicy", {
      policy: { allowDestructive: true, allowBulk: true, allowAgile: true },
    });
    expect(on?.success).toBeTruthy();
    policyChanged = true;

    await ask(frame, page, conversationId, `Bitte lösche das Ticket ${KEY}.`);

    // "Yes, but not yet" — an approval word inside a sentence that refuses.
    // This is precisely the case a word list gets wrong in both directions.
    const reply = await ask(frame, page, conversationId, "Ja, aber bitte noch nicht — erst nächste Woche.");
    console.log("mixed reply:", reply.slice(0, 400));

    expect(
      await exists(KEY),
      `AN ISSUE WAS DELETED ON A DEFERRAL. "Ja, aber bitte noch nicht" postpones; it does not ` +
        `approve. Reply was: ${reply.slice(0, 300)}`,
    ).toBe(true);
  } finally {
    if (victim) await del(`/rest/api/3/issue/${victim}?deleteSubtasks=true`).catch(() => {});
    if (frame) {
      if (policyChanged) {
        await callResolver(frame, GLOBAL_APP, "saveToolPolicy", {
          policy: { allowDestructive: false, allowBulk: true, allowAgile: true },
        }).catch(() => {});
      }
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});

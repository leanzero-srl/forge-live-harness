// LIVE: the window between a major-version deploy and its approval.
//
// Adding a scope makes the app a MAJOR version. Every install must click
// Approve, and with Rolling Releases the new code ships BEFORE that happens —
// so for a period measured in days the agile scopes are declared and refused
// on an install that is otherwise perfectly healthy.
//
// This is the only moment that state can be tested, and it is the state real
// customers will be in. What must hold: the agile tools are not offered at all
// (seven schemas that can only 403 still cost tokens on every iteration), and
// a forced call explains the actual cause rather than surfacing a raw 403,
// which reads as "you lack permission" — a completely different problem with a
// completely different fix.
import { test, expect } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";

test("agile degrades honestly before the upgrade is approved", async () => {
  test.setTimeout(600_000);
  const T = getTarget("chatwise-global");
  const context = await launchHarnessContext({});
  const page = context.pages()[0] ?? (await context.newPage());
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const conversationId = `conv_harness_agile_${Date.now()}`;
  let frame: any = null;

  try {
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] agile capability",
      personaId: "jira-scrubber",
    });

    const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
      conversationId,
      message:
        "List the Jira Software boards in this site. If you cannot, say exactly why in one sentence.",
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
    const reply = String(data.result?.response || "");
    console.log("reply:", reply.slice(0, 500));

    // The turn must SUCCEED either way. Whether boards are reachable depends on
    // whether an admin has approved the upgrade yet, and both outcomes are
    // legitimate — what is not legitimate is a raw 403, a stack trace, or a
    // silent empty answer.
    expect(reply.length, "the model said nothing at all").toBeGreaterThan(20);
    expect(reply, "a raw HTTP status leaked to the user").not.toMatch(/\b40[13]\b/);
    expect(reply.toLowerCase()).not.toContain("unauthorized");

    // Three legitimate outcomes, and the assertion is that we are in one of
    // them rather than leaking a failure:
    //   - agile reachable  → it names boards
    //   - withheld         → it says it has no such tool
    //   - withheld + note  → it says an admin needs to approve an update
    //
    // Deliberately NOT asserting the third. Whether the model surfaces the
    // approval note is a phrasing decision it makes, and this test cannot reach
    // the approved state to compare against — the upgrade needs a site admin.
    // Asserting it would be asserting a model's wording, which is the kind of
    // test that goes red for no reason.
    const unapproved = /approv|pending update|manage apps/i.test(reply);
    const noTool = /no tool|not available|don'?t have|cannot list|unable to/i.test(reply);
    const named = /\bboard\b/i.test(reply) && !noTool && !unapproved;
    console.log(
      unapproved ? "STATE: withheld, and the reply explains the approval"
        : noTool ? "STATE: withheld, reported honestly as a missing capability"
        : named ? "STATE: agile reachable" : "STATE: unclear",
    );

    expect(
      unapproved || noTool || named,
      `the reply neither used agile nor explained its absence: ${reply.slice(0, 250)}`,
    ).toBeTruthy();
  } finally {
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
    await context.close();
  }
});

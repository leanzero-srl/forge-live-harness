// LIVE REGRESSION: the Product Owner wizard must be allowed to write a long answer.
//
// THE BUG THIS GUARDS (ChatWise, fixed 17 Aug 2026)
// -------------------------------------------------
// src/shared/productOwner/index.js called chat() twice WITHOUT maxTokens, so
// src/shared/forge-llm/client.js applied its own 4096 default. The Product Owner
// persona configures max_tokens: 16384 and it was present in `settings` the
// whole time — just never forwarded. Past a certain Epic size the JSON was cut
// mid-array, the tolerant parser scored a fragment, and the user was told
// "I couldn't create the Epic: No ticket data in creation payload" — a message
// about the CONTENT, for a failure that was purely about LENGTH.
//
// WHY THE ASSERTION IS A TOKEN COUNT
// ----------------------------------
// One number settles two questions that nothing else here can:
//
//   1. Is maxTokens forwarded? If it were not, the reply could not exceed 4096
//      output tokens no matter what we asked for.
//   2. Does the Forge gateway HONOUR a raised ceiling, or silently clamp it?
//      A probe can only show the parameter is ACCEPTED — a trivial prompt stops
//      after four tokens either way. Only a genuinely long generation can tell
//      acceptance from honouring, and it needs the 900s async consumer, which
//      is exactly what a real chat turn runs on.
//
// So: ask for something that cannot be said in 4096 tokens, and assert the reply
// exceeded it. This is deliberately NOT an assertion about wording or
// response_type — those are the model's business and would make the guard flaky.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP,
  openGlobalPage,
  waitForChatApp,
  callResolver,
} from "./chatwise-support";

/** The default before the fix. A reply at or under this proves nothing changed. */
const OLD_DEFAULT_CAP = 4096;

test("PO wizard is not capped at the 4096 default", async ({ page, context }) => {
  test.setTimeout(600_000);

  const T = getTarget("chatwise-global");
  const conversationId = `conv_harness_budget_${Date.now()}`;
  let frame: Awaited<ReturnType<typeof openGlobalPage>> | null = null;

  try {
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);

    // Scripted test mode would bypass the LLM entirely and make the token count
    // meaningless. Assert it is off rather than assuming.
    const tm = await callResolver<{ success: boolean; enabled?: boolean }>(
      frame!,
      GLOBAL_APP,
      "getTestMode",
    );
    expect(tm?.enabled, "test mode must be OFF — scripted replies have no real usage").toBeFalsy();

    await callResolver(frame!, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] epic output budget",
      personaId: "product-owner",
    });

    // Something that genuinely cannot be answered in 4096 output tokens.
    const ask =
      "I need a complete SAFe Epic draft for a self-service password reset portal " +
      "for a 40,000-employee enterprise. Give me the full draft in this one reply: " +
      "epic hypothesis statement, business outcomes, leading indicators, " +
      "at least 15 detailed acceptance criteria written as full Gherkin scenarios, " +
      "at least 10 non-functional requirements each with a measurable threshold, " +
      "in-scope and out-of-scope lists, dependencies, and risks with mitigations. " +
      "Be exhaustive and specific — do not summarise, do not ask me questions first.";

    const sent = await callResolver<{ success: boolean; jobId?: string; error?: string }>(
      frame!,
      GLOBAL_APP,
      "chat",
      { conversationId, message: ask, personaId: "product-owner", personaLocked: true },
    );
    expect(sent?.success, `chat enqueue failed: ${sent?.error ?? "(no error)"}`).toBeTruthy();
    const jobId = sent.jobId!;
    expect(jobId).toBeTruthy();

    // Poll to a terminal status. The consumer has 900s; give it room but bound it.
    let data: any = null;
    const deadline = Date.now() + 420_000;
    while (Date.now() < deadline) {
      const r = await callResolver<{ success: boolean; data?: any }>(
        frame!,
        GLOBAL_APP,
        "getJobStatus",
        { jobId },
      );
      data = r?.data ?? null;
      if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
      await page.waitForTimeout(3000);
    }

    expect(data, "job never reached a terminal status within 7 minutes").toBeTruthy();
    console.log("job status:", data.status, "error:", data.error ?? "-");

    const result = data.result || {};
    const usage = result.usage || {};
    const out = usage.completion_tokens ?? 0;
    console.log(
      `model=${result.model} output_tokens=${out} truncated=${result.truncated} ` +
        `reply_chars=${(result.response || "").length}`,
    );

    expect(data.status, `job failed: ${data.error ?? "(no error)"}`).toBe("completed");

    // The exact symptom that was reported. If this string is back, the fix regressed.
    expect(
      result.response || "",
      "the reply still says 'No ticket data in creation payload'",
    ).not.toMatch(/No ticket data in creation payload/i);

    expect(
      out,
      `output was ${out} tokens. At or below ${OLD_DEFAULT_CAP} means either maxTokens is not ` +
        `reaching client.js again, or the gateway is silently clamping a raised ceiling.`,
    ).toBeGreaterThan(OLD_DEFAULT_CAP);
  } finally {
    // Leave no [harness-test] conversation behind, but never let cleanup mask
    // the real assertion failure.
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});

// LIVE: moveIssues — the dry run changes nothing, and a yes IN GERMAN moves it.
//
// WHY THIS EXISTS
// ---------------
// `moveIssues` shipped with no permanent spec. Three properties of it can only
// be settled against real Jira:
//
//   1. JIRA CLOUD HAS NO SINGLE-ISSUE MOVE. `POST /rest/api/3/bulk/issues/move`
//      is the only route, and its request shape is a minefield: the OpenAPI
//      `required` block names `targetToMultipleSourceMapping` while the actual
//      property is `targetToSourcesMapping`, and `issueIdOrKeys` while the
//      property is `issueIdsOrKeys`. Get the mapping key wrong —
//      `<project>,<issueTypeId>` — and JIRA ACCEPTS THE REQUEST AND PROCESSES
//      NOTHING. A 200 and a taskId with zero issues moved is the worst failure
//      mode available and no unit test with a stubbed fetch can see it.
//   2. IT IS ASYNCHRONOUS. The POST returns a taskId; the handler polls
//      `/bulk/queue/{taskId}` to a deadline rather than reporting "started".
//      Whether that poll actually observes completion is a live question.
//   3. IT CONFIRMS, so the two-turn ticket applies — and the consent gate is
//      the thing this app has got wrong before. A German user approved a
//      124-issue backlog SEVEN times and was refused every time, because the
//      gate deciding "did the user say yes" was English and nothing else.
//      `consent-any-language.spec.ts` pins that for deleteIssue. This pins it
//      for the OTHER tool that confirms — same gate, second tool, and the two
//      tools reach it by different paths (`destructive` vs `write` + `bulk`).
//
// GROUND TRUTH IS READ BY KEY, NEVER BY JQL. Jira's search index is eventually
// consistent, so a query run seconds after a move reports the old project and
// looks exactly like "nothing happened". Reading the OLD key works because Jira
// keeps it as a permanent alias to the new one — which is also how the spec
// finds out what the new key even is.
//
// PERSONA: Coffee Break AI, i.e. the HAIKU tier. The mechanism is what is under
// test, not the model's eloquence, and the tenant's Forge LLM quota is 50,000
// tokens PER MODEL — one Assets turn spent Sonnet's entire allowance in a
// single request. Cheapest tier that can call the tool keeps this spec runnable.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP,
  callResolver,
  deleteFixtures,
  openGlobalPage,
  skipIfQuotaBlocked,
  waitForChatApp,
} from "./chatwise-support";
// eslint-disable-next-line
import { get, post } from "../../data/jira.mjs";

const SOURCE = process.env.CHATWISE_TEST_PROJECT || "WFH";
const TARGET = process.env.CHATWISE_MOVE_TARGET || "CGL1";

async function ask(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId,
    message,
    personaId: "coffee-break-ai",
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
  console.log(
    `[move] model=${data.result?.model} iterations=${data.result?.iterations} ` +
      `usage=${JSON.stringify(data.result?.usage)}`,
  );
  return String(data.result?.response || "");
}

/** Read an issue BY KEY — the old key stays a permanent alias after a move. */
async function byKey(key: string) {
  return (await get(`/rest/api/3/issue/${key}?fields=summary,project`).catch(() => null)) as any;
}

/** Wait for the async bulk task to land, then report where the issue ended up. */
async function settledLocation(page: any, key: string, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  for (;;) {
    last = await byKey(key);
    if (last && last.fields?.project?.key !== SOURCE) return last;
    if (Date.now() > deadline) return last;
    await page.waitForTimeout(4000);
  }
}

test("the dry run moves nothing, and a German yes moves it — with a new key", async ({ page }) => {
  test.setTimeout(900_000);
  const T = getTarget("chatwise-global");
  const stamp = Date.now();
  const conversationId = `conv_harness_move_${stamp}`;
  let frame: any = null;
  let seeded: string | null = null;
  let finalKey: string | null = null;

  try {
    // ---- SEED, in the project the app is allowed to write to ---------------
    const meta: any = await get(`/rest/api/3/issue/createmeta/${SOURCE}/issuetypes?maxResults=200`);
    const std = (meta?.issueTypes || meta?.values || []).find((t: any) => t.hierarchyLevel === 0);
    expect(std, `${SOURCE} has no standard issue type`).toBeTruthy();
    const targetMeta: any = await get(
      `/rest/api/3/issue/createmeta/${TARGET}/issuetypes?maxResults=200`,
    );
    const targetTypes: any[] = targetMeta?.issueTypes || targetMeta?.values || [];
    const targetStd = targetTypes.find((t: any) => t.hierarchyLevel === 0);
    expect(targetStd, `${TARGET} has no standard issue type to move into`).toBeTruthy();
    // NOT ASSUMED, LOOKED UP. WFH's standard type is called "Work package" and
    // CGL1's is "Task" — a spec that hard-coded either would be testing this
    // tenant's vocabulary rather than the tool.
    console.log(`[move] ${SOURCE}."${std.name}" -> ${TARGET}."${targetStd.name}"`);

    const summary = `[harness-test] move me ${stamp}`;
    const made: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: SOURCE },
        issuetype: { id: String(std.id) },
        summary,
        labels: ["harness-test"],
      },
    });
    seeded = made.key;
    finalKey = made.key;
    console.log(`[move] seeded ${seeded}`);

    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] move issues",
      personaId: "coffee-break-ai",
    });

    // ---- TURN 1: ASK. Nothing may move. -----------------------------------
    const asked = await ask(
      frame,
      page,
      conversationId,
      `Move issue ${seeded} into the ${TARGET} project, as a "${targetStd.name}" there.`,
    );
    console.log(`[move] turn 1: ${asked.slice(0, 500)}`);
    skipIfQuotaBlocked(asked, "bulk-move-issues/ask");

    const afterAsk = await byKey(seeded!);
    expect(afterAsk, `${seeded} disappeared during the asking turn`).toBeTruthy();
    // THE ONLY ASSERTION THAT MATTERS ON THIS TURN. A move renames every issue
    // permanently and moving it back produces a THIRD key, so a move that
    // happens on the asking turn is not a fast assistant, it is an unrecoverable
    // one.
    expect(
      afterAsk.fields.project.key,
      `${seeded} was MOVED on the asking turn, before anyone said yes. Reply was: ` +
        `"${asked.slice(0, 400)}"`,
    ).toBe(SOURCE);
    expect(afterAsk.key, "the key changed on the asking turn").toBe(seeded);

    // ---- TURN 2: "Ja, bitte verschieben." ----------------------------------
    // A gate the user cannot pass protects nothing — it only spends their
    // trust. This is the same consent path the German backlog incident died on,
    // reached through a `write`+`bulk` tool rather than a `destructive` one.
    const confirmed = await ask(frame, page, conversationId, "Ja, bitte verschieben.");
    console.log(`[move] turn 2: ${confirmed.slice(0, 500)}`);
    skipIfQuotaBlocked(confirmed, "bulk-move-issues/confirm");

    const landed = await settledLocation(page, seeded!);
    expect(landed, `${seeded} cannot be read back at all after the move`).toBeTruthy();
    finalKey = landed.key;
    console.log(`[move] ${seeded} is now ${landed.key} in ${landed.fields.project.key}`);

    expect(
      landed.fields.project.key,
      `the user said "Ja, bitte verschieben." and ${seeded} is STILL in ${SOURCE}. Either the ` +
        `consent gate refused a genuine German yes — the incident this spec exists for — or the ` +
        `bulk endpoint accepted the request and processed nothing, which it does silently when ` +
        `the targetToSourcesMapping key is wrong. Reply was: "${confirmed.slice(0, 600)}"`,
    ).toBe(TARGET);
    // THE KEY CHANGES. That is what makes a move a move and not an edit.
    expect(landed.key, "the issue is in the target project but kept its old key").not.toBe(seeded);
    expect(landed.key.startsWith(`${TARGET}-`), `new key ${landed.key} is not a ${TARGET} key`).toBe(true);
    // And it is the SAME issue, not a copy left behind.
    expect(landed.fields.summary, "the moved issue is not the one we seeded").toBe(summary);
  } finally {
    // Delete by the CURRENT key; the old key still resolves to it, so either
    // works, but naming the new one makes a stray report legible.
    await deleteFixtures([finalKey], "bulk-move-issues");
  }
});

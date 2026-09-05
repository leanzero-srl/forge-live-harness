// LIVE: JSM — listQueues and getRequestSla against the desk this account can
// actually reach, and a refusal that reads like a sentence rather than JSON.
//
// WHY THIS EXISTS
// ---------------
// The JSM group shipped with no permanent spec, and three of its properties are
// only true or false against a real service desk:
//
//   1. THE PATH PARAMETER TAKES A PROJECT KEY. `listServiceDesks` does not exist
//      in this app on purpose — `GET /rest/servicedeskapi/servicedesk` needs
//      `read:servicedesk-request`, which cost a whole tool the first time
//      somebody tested it with a personal API token and concluded it was free.
//      Atlassian documents `serviceDeskId` as also accepting a project
//      identifier, so the key from listProjects goes straight in. If that
//      documentation is wrong, every listQueues call on every install 404s.
//      THE HARNESS uses the endpoint the APP cannot, precisely because the
//      point is to discover the desks independently of what the app claims.
//
//   2. A JSM 403 IS PER DESK, AND IT IS THE AGENT SEAT. Measured again on this
//      run: desk 2 (DEMO) answers 403 "You don't have permission to access this
//      service space." while desk 1 (JT) answers 200 — one account, one moment.
//      So the spec DISCOVERS which desk is reachable instead of naming one, and
//      then uses the unreachable one as a second fixture.
//
//   3. JSM WRITES ITS ERROR TO `errorMessage` — SINGULAR — on a key no platform
//      endpoint uses, beside an `i18nErrorMessage` object. `describeJiraError`
//      looked for `errorMessages`, `errors` and `message`, matched none of them,
//      and fell through to its last resort: RETURNING THE WHOLE JSON BODY as
//      the "sentence". So a JSM refusal reached the model — and the user's chat
//      bubble — as raw JSON with i18n keys in it. A substring assertion would
//      pass happily on that raw JSON, so this asserts the absence of the JSON
//      as well as the presence of the sentence.
//
// GROUND TRUTH is the harness's own servicedeskapi calls. Queue names and SLA
// metric names are site-specific strings the model cannot invent, which is what
// makes "the reply contains them" a real assertion rather than a vibe check.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP,
  callResolver,
  openGlobalPage,
  skipIfQuotaBlocked,
  waitForChatApp,
} from "./chatwise-support";
// eslint-disable-next-line
import { get, request } from "../../data/jira.mjs";

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
    `[jsm] model=${data.result?.model} iterations=${data.result?.iterations} ` +
      `usage=${JSON.stringify(data.result?.usage)}`,
  );
  return String(data.result?.response || "");
}

/**
 * Which desk can this account actually SEE, and which one refuses it.
 *
 * Discovered, never hard-coded: a desk id is a per-site number and the seat that
 * decides the 403 is per-desk and per-person. Naming one would make this spec a
 * statement about one tenant on one afternoon.
 */
async function discoverDesks() {
  const desks: any = await get("/rest/servicedeskapi/servicedesk");
  const rows: any[] = desks?.values || [];
  let reachable: any = null;
  let refused: any = null;
  for (const d of rows) {
    const q = await request("GET", `/rest/servicedeskapi/servicedesk/${d.id}/queue`, { raw: true });
    if (q.status === 200 && !reachable) reachable = { ...d, queues: JSON.parse(q.text).values || [] };
    else if (q.status === 403 && !refused) refused = { ...d, refusal: q.text };
  }
  return { rows, reachable, refused };
}

test("the queues and the SLA come back by name, and a refused desk reads as a sentence", async ({
  page,
}) => {
  test.setTimeout(900_000);
  const T = getTarget("chatwise-global");
  const stamp = Date.now();
  const conversationId = `conv_harness_jsm_${stamp}`;
  let frame: any = null;

  try {
    const { rows, reachable, refused } = await discoverDesks();
    console.log(`[jsm] ${rows.length} desk(s): ${rows.map((d) => `${d.id}/${d.projectKey}`).join(" ")}`);
    test.skip(!reachable, "this site has no service desk this account can read — nothing to assert");
    console.log(
      `[jsm] reachable: ${reachable.projectKey} (desk ${reachable.id}) with ` +
        `${reachable.queues.length} queue(s); refused: ${refused?.projectKey ?? "none"}`,
    );

    // A queue with issues in it, and one of its issues — both from REST.
    const queueNames: string[] = reachable.queues.map((q: any) => String(q.name));
    expect(queueNames.length, `${reachable.projectKey} has no queues to list`).toBeGreaterThan(0);

    let slaKey: string | null = null;
    let slaMetrics: string[] = [];
    for (const q of reachable.queues) {
      const qi = await request(
        "GET",
        `/rest/servicedeskapi/servicedesk/${reachable.id}/queue/${q.id}/issue`,
        { raw: true },
      );
      if (qi.status !== 200) continue;
      // QUEUE ISSUES CARRY `key`, NOT `issueKey`. A probe KeyErrored on this once.
      const items: any[] = JSON.parse(qi.text).values || [];
      for (const item of items) {
        const sla = await request("GET", `/rest/servicedeskapi/request/${item.key}/sla`, { raw: true });
        if (sla.status !== 200) continue;
        const metrics: any[] = JSON.parse(sla.text).values || [];
        if (metrics.length) {
          slaKey = item.key;
          slaMetrics = metrics.map((m) => String(m.name));
          break;
        }
      }
      if (slaKey) break;
    }
    test.skip(!slaKey, `no request in ${reachable.projectKey} has any SLA metric to read back`);
    console.log(`[jsm] SLA fixture ${slaKey}: ${slaMetrics.join(" | ")}`);

    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] jsm queues and sla",
      personaId: "coffee-break-ai",
    });

    // ONE TURN, THREE TOOL CALLS. The loop is bounded at eight iterations and
    // each of these is a single read, so this is a fair ask rather than a
    // stress test — and it puts the success path and the refusal path in the
    // same reply, where a leak is impossible to miss.
    const reply = await ask(
      frame,
      page,
      conversationId,
      `In Jira Service Management: (1) list every queue on the ${reachable.projectKey} ` +
        `service project, giving each queue's exact name. (2) Give me the SLA metrics on ` +
        `request ${slaKey} — name every metric and say whether it is breached. ` +
        (refused
          ? `(3) Then try the ${refused.projectKey} service project's queues, and if Jira ` +
            `refuses, quote exactly what it said.`
          : ""),
    );
    console.log(`[jsm] reply:\n${reply.slice(0, 1500)}`);
    skipIfQuotaBlocked(reply, "servicedesk-queues-sla");

    // ---- listQueues: every queue, BY NAME ---------------------------------
    for (const name of queueNames) {
      expect(
        reply,
        `queue "${name}" exists on desk ${reachable.id} (REST says so) and is not in the reply. ` +
          `The reply was: "${reply.slice(0, 800)}"`,
      ).toContain(name);
    }

    // ---- getRequestSla: every metric, BY NAME -----------------------------
    for (const metric of slaMetrics) {
      expect(
        reply,
        `SLA metric "${metric}" is on ${slaKey} (REST says so) and is not in the reply. ` +
          `getRequestSla either was not called or lost the metric names.`,
      ).toContain(metric);
    }

    // ---- the refusal is a SENTENCE, not a JSON body -----------------------
    if (refused) {
      const said = JSON.parse(refused.refusal)?.errorMessage as string;
      expect(said, "the refused desk did not answer on `errorMessage`").toBeTruthy();
      expect(
        reply,
        `the app did not pass on what Jira said about ${refused.projectKey}. Jira said ` +
          `"${said}". Reply: "${reply.slice(0, 800)}"`,
      ).toContain(said.replace(/^You don't have permission to /, "").replace(/\.$/, ""));
      // THE LEAK. describeJiraError's last resort used to return the whole JSON
      // body, i18n keys and all, straight into the user's bubble.
      expect(reply, "the raw JSON error body reached the reply").not.toContain("i18nErrorMessage");
      expect(reply, "an i18n key reached the reply").not.toContain("i18nKey");
      expect(reply, "an i18n message key reached the reply").not.toContain("sd.jsm.agent");
    }
  } finally {
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});

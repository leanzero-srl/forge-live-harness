// LIVE REGRESSION: "split this Epic" must produce a real Jira hierarchy.
//
// THE BUG (ChatWise, fixed 17 Aug 2026)
// -------------------------------------
// Asking ChatWise to split an Epic into stories and subtasks created every item
// as another EPIC. Three causes stacked: the model was told nothing about
// hierarchy, it had no way to learn a project's real issue-type ids so it
// guessed NAMES, and there was no tool that could express a tree.
//
// WHY THIS DRIVES THE MODEL RATHER THAN THE TOOLS
// -----------------------------------------------
// Two of the three causes were PROMPT and TOOL-AVAILABILITY problems, not
// mechanism problems. Calling createIssues directly would prove the mechanism
// and leave the actual reported failure — the model reaching for the wrong
// thing — completely uncovered. So this asks in English, exactly as a user
// would, and then reads what landed in Jira.
//
// AND WHY THE ASSERTIONS READ BACK FROM JIRA
// ------------------------------------------
// "The tool returned success" is not "the hierarchy is correct" — the old code
// returned success for every one of those wrongly-typed Epics. The assertions
// are on stored state: each child's issue type, and its `parent`. A "Relates"
// LINK standing in for a parent was the specific wrong shape, and in a list it
// looks almost identical to the right one.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
import { waitForTerminal } from "../_support/wait";
// eslint-disable-next-line
import { get, post, del, searchJql } from "../../data/jira.mjs";

const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";

test("asking to split an Epic produces typed children with real parents", async ({ page, context }) => {
  test.setTimeout(900_000);

  const T = getTarget("chatwise-global");
  const conversationId = `conv_harness_split_${Date.now()}`;
  const stamp = Date.now();
  let frame: Awaited<ReturnType<typeof openGlobalPage>> | null = null;
  let epicKey: string | null = null;
  const childKeys: string[] = [];

  try {
    // ---- Seed a real Epic straight through the REST API (not via the app) ---
    const meta: any = await get(
      `/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`,
    );
    const types: any[] = meta?.issueTypes || meta?.values || [];
    const epicType = types.find((t) => t.hierarchyLevel === 1);
    expect(epicType, `project ${PROJECT} has no epic-level issue type`).toBeTruthy();

    const epic: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT },
        issuetype: { id: String(epicType.id) },
        summary: `[harness-test] decomposition root ${stamp}`,
        labels: ["harness-test"],
      },
    });
    epicKey = epic.key;
    console.log(`seeded epic ${epicKey} (type ${epicType.name})`);

    // ---- Ask ChatWise, in English, the way the bug was reported -------------
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await callResolver(frame!, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] epic decomposition",
      personaId: "jira-scrubber",
    });

    const ask =
      `Split ${epicKey} into exactly two child issues in project ${PROJECT}: ` +
      `"[harness-test] child A ${stamp}" and "[harness-test] child B ${stamp}". ` +
      "They must be ordinary work items underneath that epic — NOT epics themselves — " +
      "and each must have the epic as its parent. Create them now; do not ask me to confirm.";

    const sent = await callResolver<any>(frame!, GLOBAL_APP, "chat", {
      conversationId,
      message: ask,
      personaId: "jira-scrubber",
      personaLocked: true,
    });
    expect(sent?.success, `enqueue failed: ${sent?.error}`).toBeTruthy();

    let data: any = null;
    const deadline = Date.now() + 600_000;
    while (Date.now() < deadline) {
      const r = await callResolver<any>(frame!, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
      data = r?.data ?? null;
      if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
      await page.waitForTimeout(3000);
    }
    expect(data?.status, `job did not complete: ${data?.error}`).toBe("completed");
    console.log("reply:", String(data.result?.response || "").slice(0, 500));

    // ---- Read what actually landed in Jira ---------------------------------
    // NOT via JQL. Jira's JQL index is eventually consistent, and a query run
    // seconds after the write reports zero — which looks exactly like "the
    // model created nothing", a completely different diagnosis. Verified
    // directly: `fields.parent` was stored correctly while `parent = KEY`
    // still returned 0 hits.
    //
    // So the reply is used only to FIND candidate keys; every assertion below
    // is on what Jira actually stored, fetched by key. A model that claimed to
    // create issues it did not create fails on the GET.
    const reply = String(data.result?.response || "");
    // Project-scoped, no \b boundaries — \b fails between a digit and a
    // letter, so a key glued to preceding text is invisible to a bounded
    // match (this bit journey-personas, whose reply is DOM textContent).
    const mentioned = Array.from(new Set(reply.match(new RegExp(`${PROJECT}-\\d+`, "g")) || [])).filter(
      (k) => k !== epicKey,
    );
    console.log("keys mentioned in the reply:", mentioned);
    expect(
      mentioned.length,
      "the reply named no created issues — the model did not create anything",
    ).toBeGreaterThanOrEqual(2);

    const children: any[] = [];
    for (const key of mentioned) {
      const issue: any = await get(
        `/rest/api/3/issue/${key}?fields=summary,issuetype,parent,issuelinks`,
      ).catch(() => null);
      expect(issue, `${key} was named in the reply but does not exist in Jira`).toBeTruthy();
      children.push({ key, fields: issue.fields });
      childKeys.push(key);
    }
    console.log(
      "children:",
      children.map(
        (c: any) =>
          `${c.key} type=${c.fields.issuetype?.name} level=${c.fields.issuetype?.hierarchyLevel} parent=${c.fields.parent?.key}`,
      ),
    );

    for (const c of children) {
      const level = c.fields?.issuetype?.hierarchyLevel;
      const parent = c.fields?.parent?.key || null;

      // THE REPORTED BUG, stated as an assertion.
      expect(
        level,
        `${c.key} was created as an EPIC (level 1) — this is exactly the reported bug`,
      ).not.toBe(1);

      expect(parent, `${c.key} has no parent — parenthood was never set`).toBe(epicKey);

      // The wrong shape that used to stand in for a parent.
      const relates = (c.fields?.issuelinks || []).filter((l: any) =>
        /relate/i.test(l?.type?.name || ""),
      );
      expect(
        relates.length,
        `${c.key} carries a "Relates" link — parenthood expressed as a sibling link again`,
      ).toBe(0);
    }
  } finally {
    for (const key of childKeys) {
      await del(`/rest/api/3/issue/${key}?deleteSubtasks=true`).catch(() => {});
    }
    if (epicKey) await del(`/rest/api/3/issue/${epicKey}?deleteSubtasks=true`).catch(() => {});
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});

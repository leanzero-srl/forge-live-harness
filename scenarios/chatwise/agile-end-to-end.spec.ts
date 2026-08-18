// LIVE: the agile tools, driven in English, against a site where the scopes
// have actually been approved.
//
// This is the spec that could not exist until the major-version upgrade was
// approved on wolfaenpak. Until then `agile-capability.spec.ts` proved only the
// honest-degradation half — that the tools are withheld and nothing 403s at the
// user. That is a different claim from "they work".
//
// Everything is asked in ENGLISH through the deployed chat path, because the
// thing under test is the model reaching for the right tool, not the mechanism.
// Every assertion reads state back from Jira, by key or by board, never from
// the reply text.
import { test, expect } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import { get, post, del } from "../../data/jira.mjs";

/**
 * Sprints need a SCRUM board, and the test project WFH has only a kanban one —
 * discovered by probing, not assumed. So the board is found first and the
 * project is derived from ITS filter, rather than seeding into WFH and hoping a
 * board covers it.
 */
async function findScrumBoardAndProject() {
  const boards: any = await get(`/rest/agile/1.0/board?maxResults=50`);
  const scrums = (boards?.values || []).filter((b: any) => b.type === "scrum");
  for (const b of scrums) {
    // location.projectKey is null on a board built from a filter, which is the
    // case here — so read the filter's JQL instead.
    if (b.location?.projectKey) return { board: b, project: b.location.projectKey };
    try {
      const cfg: any = await get(`/rest/agile/1.0/board/${b.id}/configuration`);
      const filter: any = await get(`/rest/api/2/filter/${cfg.filter.id}`);
      const m = /project\s*=\s*"?([A-Z][A-Z0-9_]*)"?/i.exec(String(filter.jql || ""));
      if (m) return { board: b, project: m[1].toUpperCase() };
    } catch {
      /* try the next board */
    }
  }
  return { board: null, project: null };
}

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

test("ChatWise can find a board, make a sprint and put work in it", async () => {
  test.setTimeout(900_000);

  const T = getTarget("chatwise-global");
  const context = await launchHarnessContext({});
  const page = context.pages()[0] ?? (await context.newPage());
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

  const conversationId = `conv_harness_agile_e2e_${Date.now()}`;
  const stamp = Date.now();
  let frame: any = null;
  const madeIssues: string[] = [];
  const madeSprints: number[] = [];

  try {
    // ---- Find a SCRUM board and the project it actually covers ------------
    const { board: scrum, project: PROJECT } = await findScrumBoardAndProject();
    expect(scrum, "this site has no scrum board — nothing to test sprints against").toBeTruthy();
    expect(PROJECT, `could not determine which project board ${scrum?.id} covers`).toBeTruthy();
    console.log(`board: ${scrum.id} "${scrum.name}" (${scrum.type}) over ${PROJECT}`);

    // ---- Seed two issues of our own -------------------------------------
    const meta: any = await get(
      `/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`,
    );
    const types: any[] = meta?.issueTypes || meta?.values || [];
    const std = types.find((t) => t.hierarchyLevel === 0);
    expect(std, `${PROJECT} has no standard issue type`).toBeTruthy();

    for (let i = 1; i <= 2; i++) {
      const made: any = await post("/rest/api/3/issue", {
        fields: {
          project: { key: PROJECT },
          issuetype: { id: String(std.id) },
          summary: `[harness-test] agile e2e ${i} ${stamp}`,
          labels: ["harness-test"],
        },
      });
      madeIssues.push(made.key);
    }
    console.log("seeded:", madeIssues.join(", "));

    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] agile end to end",
      personaId: "jira-scrubber",
    });

    // ---- ONE English request spanning three agile tools -------------------
    // SHORT ON PURPOSE. Jira rejects a sprint name of 30 characters or more,
    // so the usual "[harness-test] …" prefix does not fit — and the app now
    // refuses the call itself with that explanation, which is what caught this
    // test's first attempt at a 39-character name. The sprint is deleted by id
    // in `finally`, so findability by prefix is not needed.
    const sprintName = `hx-e2e-${String(stamp).slice(-8)}`;
    expect(sprintName.length, "the test's own sprint name is too long").toBeLessThan(30);
    const reply = await ask(
      frame,
      page,
      conversationId,
      `On the Jira Software board called "${scrum.name}" (board id ${scrum.id}), create a new ` +
        `sprint named exactly "${sprintName}" with the goal "verify the agile tools", then move ` +
        `${madeIssues.join(" and ")} into that sprint. Do it now; do not ask me to confirm.`,
    );
    console.log("reply:", reply.slice(0, 400));

    // ---- Read the truth back from Jira -----------------------------------
    const sprints: any = await get(
      `/rest/agile/1.0/board/${scrum.id}/sprint?state=future,active&maxResults=50`,
    );
    const mine = (sprints?.values || []).find((s: any) => s.name === sprintName);
    expect(mine, `no sprint named "${sprintName}" exists — createSprint did not run`).toBeTruthy();
    madeSprints.push(mine.id);
    console.log(`sprint ${mine.id} state=${mine.state} goal=${mine.goal || "(none)"}`);

    // The goal is the part a wrong request body would silently drop.
    expect(mine.goal, "the sprint was created without its goal").toBeTruthy();

    // Membership, read from the sprint itself rather than from the reply.
    const inSprint: any = await get(
      `/rest/agile/1.0/sprint/${mine.id}/issue?fields=summary&maxResults=50`,
    );
    const keys = (inSprint?.issues || []).map((i: any) => i.key);
    console.log("issues in sprint:", keys.join(", ") || "(none)");
    for (const k of madeIssues) {
      expect(keys, `${k} was not moved into the sprint`).toContain(k);
    }

    // ---- And back out again ----------------------------------------------
    const reply2 = await ask(
      frame,
      page,
      conversationId,
      `Now move ${madeIssues.join(" and ")} back to the backlog, out of that sprint. ` +
        `Do it now; do not ask me to confirm.`,
    );
    console.log("reply2:", reply2.slice(0, 300));

    const after: any = await get(
      `/rest/agile/1.0/sprint/${mine.id}/issue?fields=summary&maxResults=50`,
    );
    const leftover = (after?.issues || []).map((i: any) => i.key).filter((k: string) => madeIssues.includes(k));
    expect(leftover, `still in the sprint: ${leftover.join(", ")}`).toEqual([]);
  } finally {
    for (const id of madeSprints) {
      await del(`/rest/agile/1.0/sprint/${id}`).catch(() => {});
    }
    for (const k of madeIssues) {
      await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).catch(() => {});
    }
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
    await context.close();
  }
});

// LIVE: THE JIRA ADMINISTRATOR IN THE ISSUE PANEL — on request, not thrown at
// the user.
//
// The owner asked for transition rules from the issue panel. The risk that
// comes with it is the opposite of the feature: a persona that reads the
// project's whole configuration every time somebody asks "what is this ticket
// about" spends an admin's tokens and an admin's patience on a question that
// did not need it. The skill body carries the sentence; this asserts it.
//
// Three claims, and the first is the one a unit test cannot make:
//   (a) an ORDINARY issue question triggers ZERO configuration reads;
//   (b) the SAME panel, asked about transition rules, reads them and names real
//       conditions and validators;
//   (c) `jira-org-admin` is NOT in the panel roster — org work has no issue
//       context, and the panel is the wrong shape for a change that reaches
//       every product at once.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  PANEL_APP,
  callResolver,
  deleteFixtures,
  describeLogs,
  logWindow,
  openPanel,
  readThread,
  skipIfQuotaBlocked,
  waitForChatApp,
  waitForThread,
  deliverMessage,
} from "./chatwise-support";
import { skipUntilAdminPersonas } from "./admin-credentials-support";
// eslint-disable-next-line
import { get, post } from "../../data/jira.mjs";

const T = getTarget("chatwise-panel");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";

/** The reads that must NOT fire on an ordinary question. */
const CONFIG_TOOLS = [
  "getTransitionProperties",
  "getProjectConfiguration",
  "getPermissionScheme",
  "getSchemeUsage",
  "getWorkflowScheme",
  "getNotificationScheme",
  "getFieldContexts",
];

test.describe.configure({ timeout: 3_600_000 });

test("the admin persona reads configuration ON REQUEST, and never on an ordinary issue question", async ({
  page,
}) => {
  test.setTimeout(3_600_000);
  const stamp = Date.now();
  let seeded: string | null = null;
  let frame: any = null;

  try {
    const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
    const std = (meta?.issueTypes || meta?.values || []).find((t: any) => t.hierarchyLevel === 0);
    const made: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT }, issuetype: { id: String(std.id) },
        summary: `[harness-test] panel admin ${stamp}`, labels: ["harness-test"],
        description: {
          type: "doc", version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: "A ticket for the panel test." }] }],
        },
      },
    });
    seeded = made.key;
    console.log(`[panel] seeded ${seeded}`);

    frame = await openPanel(page, T, seeded!);
    await waitForChatApp(page, frame, PANEL_APP, 120_000);
    await skipUntilAdminPersonas(frame, PANEL_APP, callResolver as any);

    // ---- (c) THE ORG PERSONA IS NOT ON THE PANEL --------------------------
    const personas: any = await callResolver(frame, PANEL_APP, "getPersonas", {});
    const ids = (personas?.personas || []).map((p: any) => p.id);
    console.log(`[panel] roster: ${ids.join(", ")}`);
    expect(ids, "the Jira Administrator is missing from the panel roster").toContain("jira-admin");
    expect(
      ids,
      `jira-org-admin is IN the panel roster. Org work has no issue context — every question it ` +
        `answers is about accounts, directories, groups and policies across the whole organisation, ` +
        `so the one thing the panel adds is worth nothing to it.`,
    ).not.toContain("jira-org-admin");

    // Select the admin persona in the panel the way a person would.
    await callResolver(frame, PANEL_APP, "setPersonaForConversation", {
      conversationId: `issue-${seeded}`, personaId: "jira-admin",
    }).catch(() => {});

    /** One panel turn through the composer, with its log window. */
    async function panelTurn(label: string, text: string) {
      const t0 = Date.now();
      const before = (await readThread(frame)).length;
      await deliverMessage(page, frame, text, label);
      const thread = await waitForThread(
        page, frame,
        (t) => t.length > before && t.some((m) => m.role === "assistant" && !m.streaming),
        { timeout: 600_000, label: `${label}: an assistant reply` },
      );
      const reply = thread.filter((m) => m.role === "assistant").pop()?.text || "";
      const lines = await logWindow(page, (ls) => ls.some((l) => l.at >= t0 && /^\[Consumer\] toolset:/.test(l.text)),
        { label: `${label} consumer line` });
      const win = lines.filter((l: any) => l.at >= t0);
      console.log(`\n######## ${label}\nASK: ${text}\nBUBBLE:\n${reply.slice(0, 900)}\n` +
        `LOG:\n${describeLogs(win.filter((l: any) => /^\[Tools\]|^\[Consumer\] toolset/.test(l.text)))}`);
      return { reply, win };
    }

    // ---- (a) AN ORDINARY QUESTION -----------------------------------------
    const plain = await panelTurn("panel-ordinary", "Summarise this issue.");
    skipIfQuotaBlocked(plain.reply, "admin-persona-panel/ordinary");
    const unprompted = plain.win.filter((l: any) =>
      CONFIG_TOOLS.some((t) => new RegExp(`^\\[Tools\\] ${t}\\b`).test(l.text)));
    expect(
      unprompted.map((l: any) => l.text),
      `the admin persona read CONFIGURATION on a plain "summarise this issue":\n` +
        `${describeLogs(unprompted)}\nThat is the persona throwing itself at the user — the skill ` +
        `body says these reads happen on request. Each one costs an iteration and tokens nobody ` +
        `asked to spend.`,
    ).toEqual([]);
    expect(plain.reply.length, "the ordinary question got no answer at all").toBeGreaterThan(20);

    // ---- (b) THE SAME PANEL, ASKED --------------------------------------
    const asked = await panelTurn(
      "panel-rules",
      `Why can't this move to Done? What rules are on its transitions?`,
    );
    skipIfQuotaBlocked(asked.reply, "admin-persona-panel/rules");
    const rules = asked.win.filter((l: any) => /^\[Tools\] getTransitionProperties\b/.test(l.text));
    expect(
      rules.map((l: any) => l.text),
      `getTransitionProperties was NOT called when the user asked for transition rules. On request ` +
        `means on request — the panel is where the owner asked for this.\n` +
        `${describeLogs(asked.win.filter((l: any) => /^\[Tools\]/.test(l.text)))}`,
    ).not.toEqual([]);
    // And the answer carries what the tool returns, not a plausible summary.
    expect(asked.reply, "the reply names no transition").toMatch(/transition/i);
    expect(
      asked.reply,
      `the reply names no rule kind (condition / validator / post function), which is the whole ` +
        `content of what getTransitionProperties returns:\n${asked.reply.slice(0, 800)}`,
    ).toMatch(/condition|validator|post[- ]?function/i);
  } finally {
    await deleteFixtures([seeded], "admin-persona-panel");
  }
});

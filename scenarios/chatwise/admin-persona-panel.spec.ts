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

const T = getTarget("chatwise-issue-panel");
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

    // The roster is asserted in ITS OWN TEST at the bottom of this file.
    //
    // It used to be the first assertion here and that was a mistake that cost a
    // whole live run: `jira-org-admin` IS on the panel, the expectation threw
    // before either measurement had been taken, and the two things this file
    // exists to measure — that an ordinary question reads no configuration, and
    // that an explicit one reads the transition rules — were not measured at
    // all. A disagreement about which personas belong on a surface must not be
    // able to hide a behavioural regression.
    const personas: any = await callResolver(frame, PANEL_APP, "getPersonas", {});
    const ids = (personas?.personas || []).map((p: any) => p.id);
    console.log(`[panel] roster: ${ids.join(", ")}`);
    expect(ids, "the Jira Administrator is missing from the panel roster").toContain("jira-admin");

    // ---- SELECT THE ADMIN PERSONA, THE WAY A PERSON DOES -------------------
    //
    // ⚠️ THE FIRST VERSION OF THIS CALLED A RESOLVER THAT DOES NOT EXIST, and
    // the whole spec was vacuous because of it. `setPersonaForConversation` is
    // not a route — the route is `saveConversationPersona` — and the call was
    // wrapped in `.catch(() => {})`, so the turn ran under the panel's DEFAULT
    // persona and the consumer printed
    // `allowJiraAdminTools=false(not-this-persona)`. The "no configuration
    // reads on an ordinary question" assertion then passed for the worst
    // possible reason: the tools were never in the toolset to begin with.
    //
    // Two changes follow from that. The persona is chosen through the
    // DROPDOWN, which is what a person actually does and cannot silently
    // no-op; and the FIRST turn's toolset line is asserted, so a failure to
    // select can never again be mistaken for a well-behaved persona.
    await frame.locator("#dropdownSelected").click();
    await expect(frame.locator("#dropdownOptions")).toHaveClass(/open/);
    await frame
      .locator("#dropdownOptions .dropdown-option")
      .filter({ hasText: /Jira Administrator/ })
      .first()
      .click();
    await expect(frame.locator("#dropdownSelected .selected-text")).toHaveText(/Jira Administrator/);

    /** One panel turn through the composer, with its log window. */
    async function panelTurn(label: string, text: string) {
      const t0 = Date.now();
      // ⚠️ COUNT THE ASSISTANT MESSAGES, NOT THE MESSAGES — measured 6 Sep 2026
      // and it made a passing tool measurement report the WRONG BUBBLE.
      //
      // The old predicate was `t.length > before && t.some(assistant &&
      // !streaming)`. Both halves go true the instant the composer renders the
      // USER'S bubble: the thread is longer, and the PREVIOUS turn's assistant
      // reply is sitting there settled. `waitForThread` returned before the
      // model had said anything, `.pop()` handed back the previous answer, and
      // the second turn of this spec reported the first turn's text verbatim
      // while its log showed `getTransitionProperties` running twice. A tool
      // measurement that is right beside a reply that is wrong is worse than a
      // red run, because it reads as a product defect in the model.
      const beforeAssistants = (await readThread(frame)).filter((m) => m.role === "assistant").length;
      await deliverMessage(page, frame, text, label);
      const thread = await waitForThread(
        page, frame,
        (t) => {
          const a = t.filter((m) => m.role === "assistant");
          return a.length > beforeAssistants && !a[a.length - 1].streaming;
        },
        { timeout: 600_000, label: `${label}: a NEW settled assistant reply` },
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
    // THE ANTI-VACUITY GUARD. Everything below asks what the admin persona did
    // and did not do with the admin tools; if the admin tools were not offered,
    // none of it means anything.
    const plainLine = plain.win.find((l: any) => /^\[Consumer\] toolset:/.test(l.text))?.text || "";
    console.log(`[panel] toolset line: ${plainLine}`);
    expect(
      plainLine,
      `the panel turn did NOT run as the Jira Administrator — the toolset line says:\n` +
        `${plainLine}\nEvery assertion below would then pass because the admin tools were absent, ` +
        `not because the persona behaved.`,
    ).toMatch(/allowJiraAdminTools=true/);
    expect(
      plainLine,
      `the panel profile does not carry the workflow group even with the admin gate open. ` +
        `CAPABILITY_GATES gives allowJiraAdminTools adds ["jira-admin-config","workflow"], which ` +
        `is the whole mechanism by which the panel can answer a transition-rules question.`,
    ).toMatch(/profile=issue-panel/);
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

/**
 * THE PANEL ROSTER — and this one is a DESIGN CLAIM, not a regression guard.
 *
 * MEASURED 6 Sep 2026 on app 13.6.0: the panel serves
 * `coffee-break-ai, jira-scrubber, epic-master, product-owner, jira-admin,
 * jira-org-admin` — the same six the global page serves.
 *
 * THE CAUSE IS THAT NO MECHANISM EXISTS, not that one broke.
 * `registerSharedPersonaRoutes`'s `getPersonas` takes no surface argument and
 * both surfaces call the same route; `annotatePersonasForCaller` annotates by
 * ACCOUNT (`requiresSiteAdmin`), never by where the question is being asked
 * from. So there is nowhere a per-surface roster could be expressed today, and
 * this test is the request for one rather than the report of a break.
 *
 * The argument for it: every question the Organisation Administrator answers is
 * about accounts, directories, groups and policies across the whole
 * organisation, so the one thing the panel adds — an issue in context — is
 * worth nothing to it, and a change it makes reaches every product at once from
 * a surface whose whole frame is one ticket.
 */
/**
 * THE PANEL ROSTER — four rows, and the filter is SERVER-SIDE now.
 *
 * MEASURED 6 Sep 2026 on 13.6.0: the panel served the same six personas as the
 * global page. `Constants.js` had excluded `jira-org-admin` in writing the
 * whole time and a unit test over that constant was green — the partition was
 * applied only by a filter in the BROWSER, so the constant was right, the test
 * was right, and production ignored both. 13.7.0 moved it into `getPersonas`.
 *
 * SO THIS ASSERTS TWO DIFFERENT THINGS, and the order matters:
 *   1. what a PERSON SEES in the panel's own dropdown — the user-visible
 *      outcome, which needs the bundle to send `surface` AND the route to act
 *      on it. This is the one that would have caught the 13.6.0 defect.
 *   2. the ROUTE asked directly, with and without `surface`. Without it the
 *      roster is deliberately full — `rosterForSurface` fails OPEN, because
 *      this is a decision about what suits a narrow sidebar and never a
 *      permission. A harness that only called the route with `surface` set
 *      would be testing the half that was never broken.
 */
test("the issue panel offers four personas, and the filter is on the route", async ({ page }) => {
  test.setTimeout(900_000);
  const stamp = Date.now();
  let seeded: string | null = null;
  try {
    const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
    const std = (meta?.issueTypes || meta?.values || []).find((t: any) => t.hierarchyLevel === 0);
    const made: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT }, issuetype: { id: String(std.id) },
        summary: `[harness-test] panel roster ${stamp}`, labels: ["harness-test"],
      },
    });
    seeded = made.key;
    const frame = await openPanel(page, T, seeded!);
    await waitForChatApp(page, frame, PANEL_APP, 120_000);

    // ---- 1. WHAT A PERSON SEES ------------------------------------------
    await frame.locator("#dropdownSelected").click();
    await expect(frame.locator("#dropdownOptions")).toHaveClass(/open/);
    const shown = (
      await frame.locator("#dropdownOptions .dropdown-option .option-text").allTextContents()
    ).map((t) => t.trim());
    await frame.locator("#dropdownSelected").click();
    console.log(`[panel] the dropdown offers: ${shown.join(" | ")}`);
    expect(
      shown,
      `the panel's own dropdown does not offer exactly the four personas an issue sidebar is for. ` +
        `The Organisation Administrator answers questions about accounts, directories, groups and ` +
        `policies across every product and every site, so the one thing the panel adds — an issue ` +
        `in context — is worth nothing to it; Coffee Break AI has no Jira work to do here.`,
    ).toEqual(["JIRA Scrubber", "Epic Master", "Product Owner", "Jira Administrator"]);

    // ---- 2. THE ROUTE, BOTH WAYS ----------------------------------------
    const withSurface: any = await callResolver(frame, PANEL_APP, "getPersonas", { surface: "issue-panel" });
    const idsWith = (withSurface?.personas || []).map((p: any) => p.id);
    console.log(`[panel] getPersonas({surface:"issue-panel"}): ${idsWith.join(", ")}`);
    expect(
      idsWith,
      `the ROUTE still returns jira-org-admin for surface "issue-panel". On 13.6.0 the partition ` +
        `lived only in the browser, so any caller that got the list another way — a stale bundle, ` +
        `a cached iframe, a direct invoke — received everything.`,
    ).not.toContain("jira-org-admin");
    expect(idsWith).toEqual(["jira-scrubber", "epic-master", "product-owner", "jira-admin"]);

    const noSurface: any = await callResolver(frame, PANEL_APP, "getPersonas", {});
    const idsNone = (noSurface?.personas || []).map((p: any) => p.id);
    console.log(`[panel] getPersonas({}) — no surface named: ${idsNone.join(", ")}`);
    expect(
      idsNone.length,
      `a caller that names NO surface should get the full roster — failing open is right here and ` +
        `only here, because this is a roster decision about what suits a sidebar and never a ` +
        `permission. resolvePersonaForTurn is the guarantee about who may USE a persona.`,
    ).toBeGreaterThan(idsWith.length);
  } finally {
    await deleteFixtures([seeded], "admin-persona-panel/roster");
  }
});

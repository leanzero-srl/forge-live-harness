// LIVE: THE THREE ADMIN GATES — who gets the admin tools, and why.
//
// *** SKIPS WHILE wolfaenpak IS ON APP 12. ***
//
// The gate is `policy ∧ probeSiteAdmin ∧ the persona binds a built-in admin
// skill`. Two of those three are SECURITY and one is COST, and the reasons
// differ per turn — `admin-off`, `not-site-admin`, `not-this-persona`,
// `no-credential`. A boolean would make the model re-derive the cause in prose,
// which is the fabrication this codebase has paid for four times. So the
// `[Consumer] toolset:` line carries flag→reason and this spec reads it.
//
// AND IT SETTLES THE asUser TABLE. Every admin-config endpoint except workflows
// is marked "asUser unproven" in the frame: the 200s came from a personal API
// token, which carries the whole user and none of the app's OAuth scopes. Eight
// reads, run once each through the tool surface, is the measurement — recorded
// per endpoint as 200 or the status Jira actually returned.
import { test, expect } from "../../fixtures/forge";
import fs from "node:fs";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP,
  QUOTA_BUBBLE,
  callResolver,
  describeLogs,
  logWindow,
  openGlobalPage,
  skipIfQuotaBlocked,
  waitForChatApp,
} from "./chatwise-support";
import { skipUntilAdminPersonas, SECRETS_DIR } from "./admin-credentials-support";
// eslint-disable-next-line
import { get } from "../../data/jira.mjs";

const T = getTarget("chatwise-global");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";
const OUT = `${SECRETS_DIR}/asuser-table.json`;

/**
 * THE SPACING IS THE MEASUREMENT'S BIGGEST ENEMY, AND IT IS NOT A PRODUCT FACT.
 *
 * `jira-admin` runs on claude-sonnet-5 and the tenant's Forge LLM allowance is
 * 50,000 tokens per model tier on a ~15-minute ROLLING window. One admin turn
 * costs 15k-45k (the frame measured ~14,800/iteration), so eight back-to-back
 * turns exhaust Sonnet after the second and the remaining six rows of the table
 * would read "SKIPPED (quota)" — a table that measured nothing while looking
 * complete. So: a gap between turns, and on a quota bubble ONE wait-and-retry.
 * Both are environment knobs, because the right value depends on who else is
 * driving the tenant at the time.
 */
const GAP_MS = Number(process.env.CHATWISE_TURN_GAP_MS || 240_000);
const QUOTA_WAIT_MS = Number(process.env.CHATWISE_QUOTA_WAIT_MS || 960_000);

/** The eight jira-admin-config reads, and the ask that drives each one. */
const EIGHT: Array<{ tool: string; ask: string }> = [
  { tool: "getProjectConfiguration", ask: `Read the full configuration of project ${PROJECT}.` },
  { tool: "getPermissionScheme", ask: `Which permission scheme does ${PROJECT} use, and what does it grant?` },
  { tool: "getWorkflowScheme", ask: `What workflow scheme is on ${PROJECT}?` },
  { tool: "getNotificationScheme", ask: `What notification scheme does ${PROJECT} use?` },
  { tool: "getFieldContexts", ask: `What contexts exist on the Story Points custom field?` },
  { tool: "getSchemeUsage", ask: `What else uses ${PROJECT}'s permission scheme? Give me the blast radius.` },
  { tool: "listGroupsAndMembers", ask: `List the Jira groups on this site with their members.` },
  { tool: "getAuditRecords", ask: `Show me the last few entries in the Jira audit log.` },
];

test.describe.configure({ timeout: 14_400_000 });

test("the admin gates open for the admin persona only, and the eight asUser reads are measured", async ({
  page,
}) => {
  test.setTimeout(14_400_000);
  const stamp = Date.now();
  const conversationId = `conv_admin_gates_${stamp}`;
  const scrubberConv = `conv_admin_gates_scrub_${stamp}`;
  let frame: any = null;
  const table: Array<Record<string, unknown>> = [];

  async function turn(convId: string, personaId: string, label: string, message: string) {
    const t0 = Date.now();
    const sent: any = await callResolver(frame, GLOBAL_APP, "chat", {
      conversationId: convId, message, personaId, personaLocked: true,
    });
    expect(sent?.success, `${label}: enqueue failed: ${JSON.stringify(sent?.error)}`).toBeTruthy();
    let data: any = null;
    const deadline = Date.now() + 600_000;
    while (Date.now() < deadline) {
      const r: any = await callResolver(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
      data = r?.data ?? null;
      if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
      await page.waitForTimeout(3000);
    }
    expect(data?.status, `${label}: job did not complete: ${data?.error}`).toBe("completed");
    const reply = String(data.result?.response || "");
    const lines = await logWindow(page, (ls) => ls.some((l) => l.at >= t0 && /^\[Consumer\] toolset:/.test(l.text)),
      { label: `${label} consumer line` });
    const win = lines.filter((l: any) => l.at >= t0);
    console.log(`\n######## ${label} (${personaId})\nASK: ${message}\nBUBBLE:\n${reply.slice(0, 900)}\n` +
      `LOG:\n${describeLogs(win.filter((l: any) => /^\[Tools\]|^\[Consumer\] toolset/.test(l.text)))}`);
    return { reply, win, data };
  }

  /**
   * The same turn, but a quota bubble is retried ONCE after the rolling window
   * has had time to clear. A row that says "SKIPPED (quota)" is honest but
   * useless, and the whole point of this spec is the eight-row table.
   */
  async function turnQ(convId: string, personaId: string, label: string, message: string) {
    let r = await turn(convId, personaId, label, message);
    if (QUOTA_BUBBLE.test(r.reply)) {
      console.log(`[quota] ${label} was quota-blocked; waiting ${Math.round(QUOTA_WAIT_MS / 1000)}s and retrying once`);
      await page.waitForTimeout(QUOTA_WAIT_MS);
      r = await turn(convId, personaId, `${label}-retry`, message);
    }
    return r;
  }

  try {
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await skipUntilAdminPersonas(frame, GLOBAL_APP, callResolver as any);

    // NO CREDENTIALS FOR THIS HALF, and the toolset line below is what proves
    // it: the site-token and org-admin gates must be off with the reason
    // `no-credential`, not `admin-off`, which would send an admin to the wrong
    // switch. There is no resolver to ask — credential routes live on the admin
    // resolver — so the gate's own reason IS the oracle.

    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId, title: "[harness-test] admin gates", personaId: "jira-admin",
    });

    // ---- 1. THE ADMIN PERSONA GETS THE ADMIN GROUPS ----------------------
    const first = await turnQ(conversationId, "jira-admin", "gates-1", EIGHT[0].ask);
    skipIfQuotaBlocked(first.reply, "admin-persona-gates");
    const toolsetLine = first.win.find((l: any) => /^\[Consumer\] toolset:/.test(l.text))?.text || "";
    console.log(`[gates] toolset line: ${toolsetLine}`);
    expect(toolsetLine, "no [Consumer] toolset: line for the admin turn").not.toBe("");
    expect(toolsetLine, "allowJiraAdminTools is not ON for the Jira Administrator persona")
      .toMatch(/allowJiraAdminTools=true/);
    // The two credential gates must be off FOR THE RIGHT REASON.
    expect(toolsetLine,
      `allowSiteToken should be off with reason no-credential; the line was:\n${toolsetLine}`)
      .toMatch(/allowSiteToken=false\(no-credential\)/);
    expect(toolsetLine,
      `allowOrgAdmin should be off with reason no-credential; the line was:\n${toolsetLine}`)
      .toMatch(/allowOrgAdmin=false\(no-credential\)/);

    // ---- 2. THE EIGHT READS, ONCE EACH -----------------------------------
    // This is the asUser measurement. `handleHttpError` prints
    // `[Tools] <operation> failed: <status> <body>`, so the table is read from
    // the app's own log rather than inferred from prose.
    for (let i = 0; i < EIGHT.length; i++) {
      const { tool, ask } = EIGHT[i];
      const r = i === 0 ? first : await turnQ(conversationId, "jira-admin", `asUser-${tool}`, ask);
      if (QUOTA_BUBBLE.test(r.reply)) {
        table.push({ tool, status: "SKIPPED (quota)", called: false });
        continue;
      }
      // WITHHELD IS NOT CALLED. `executor.js` prints the refusal on the same
      // `[Tools] <name>` prefix, so a naive match would record a closed gate as
      // a 200 — the one mistake that would make this whole table a lie.
      const called = r.win.filter(
        (l: any) =>
          new RegExp(`^\\[Tools\\] ${tool}\\b`).test(l.text) && !/is withheld this turn/.test(l.text),
      );
      /**
       * A SUB-REQUEST'S 404 IS NOT THE TOOL'S STATUS — measured 6 Sep 2026 and
       * it corrupted the first run of this table.
       *
       * `getWorkflowScheme` asks for the scheme AND, optionally, its draft.
       * WFH has no draft, so Jira answers 404 to the second call and the
       * handler absorbs it and prints
       *   `[Tools] getWorkflowScheme(WFH) draft failed: 404 …`
       * one line above its own successful outcome
       *   `[Tools] getWorkflowScheme(WFH): 1 issue-type mapping(s), draft=false`.
       * A naive `.*failed:` match recorded 404 for a read that returned exactly
       * what the model then reported correctly — which is the whole table
       * lying in the direction of "asUser does not survive", the one
       * conclusion this spec exists to establish.
       *
       * So: an OUTCOME line (the tool's own name followed by `:` or `(...):`
       * and no "failed") settles the row as 200; only when there is no outcome
       * line does a failure line decide it.
       */
      const outcome = r.win.filter(
        (l: any) =>
          new RegExp(`^\\[Tools\\] ${tool}(\\(|:)`).test(l.text) && !/ failed:/.test(l.text),
      );
      const failed = r.win.filter((l: any) => new RegExp(`^\\[Tools\\] .*${tool}.*failed:`).test(l.text));
      const wholeToolFailed = failed.filter((l: any) =>
        new RegExp(`^\\[Tools\\] ${tool}(\\([^)]*\\))? failed:`).test(l.text),
      );
      const status = outcome.length
        ? "200"
        : wholeToolFailed.length
          ? (wholeToolFailed[0].text.match(/failed:\s*(\d{3})/) || [])[1] || "error"
          : failed.length
            ? (failed[0].text.match(/failed:\s*(\d{3})/) || [])[1] || "error"
            : called.length
              ? "200"
              : "not-called";
      table.push({
        tool,
        status,
        called: called.length > 0,
        subRequestFailures: failed.length - wholeToolFailed.length,
        evidence: (outcome[0]?.text || wholeToolFailed[0]?.text || failed[0]?.text || called[0]?.text || "").slice(0, 220),
      });
      console.log(`[asUser] ${tool} -> ${status}`);
      fs.writeFileSync(OUT, JSON.stringify(table, null, 2));
      if (i < EIGHT.length - 1) await page.waitForTimeout(GAP_MS);
    }
    console.table(table);

    // A 403 is a FINDING to report, not a reason to fail the run — the point of
    // the table is to say which of the eight survive impersonation. What DOES
    // fail the run is a tool that was never called at all on every row, because
    // then the table measured nothing.
    expect(table.some((r) => r.called === true),
      `NONE of the eight admin-config tools was called across ${EIGHT.length} turns. The table is ` +
      `vacuous; check the [Consumer] toolset line above for the gate's own reason.`).toBe(true);

    // ---- 3. THE SAME QUESTION, THE WRONG PERSONA -------------------------
    // The cost control: an admin asking the Scrubber gets no admin tools and is
    // told which assistant to use. `not-this-persona` is the reason, and it must
    // NOT read as a permission problem — this account IS a site admin.
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId: scrubberConv, title: "[harness-test] admin gates scrubber", personaId: "jira-scrubber",
    });
    await page.waitForTimeout(GAP_MS);
    const scrub = await turnQ(scrubberConv, "jira-scrubber", "gates-scrubber", EIGHT[0].ask);
    skipIfQuotaBlocked(scrub.reply, "admin-persona-gates/scrubber");
    const scrubLine = scrub.win.find((l: any) => /^\[Consumer\] toolset:/.test(l.text))?.text || "";
    console.log(`[gates] scrubber toolset line: ${scrubLine}`);
    expect(scrubLine, `the Scrubber got the admin tools:\n${scrubLine}`)
      .toMatch(/allowJiraAdminTools=false\(not-this-persona\)/);
    const adminCalls = scrub.win.filter(
      (l: any) =>
        /^\[Tools\] (getProjectConfiguration|getPermissionScheme|getSchemeUsage|getWorkflowScheme|getNotificationScheme|getFieldContexts|listGroupsAndMembers|getAuditRecords)\b/.test(l.text) &&
        !/is withheld this turn/.test(l.text),
    );
    expect(adminCalls.map((l: any) => l.text),
      `the Scrubber executed admin-config tools:\n${describeLogs(adminCalls)}`).toEqual([]);
    expect(scrub.reply,
      `the Scrubber's answer does not point at the Jira Administrator assistant, so a user who ` +
      `asked the wrong persona is left with no way through:\n${scrub.reply}`)
      .toMatch(/jira administrator|administrator assistant|Jira Admin/i);
  } finally {
    for (const c of [conversationId, scrubberConv]) {
      if (frame) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: c }).catch(() => {});
    }
    if (table.length) {
      fs.writeFileSync(OUT, JSON.stringify(table, null, 2));
      console.log(`[asUser] table written to ${OUT}`);
    }
  }
});

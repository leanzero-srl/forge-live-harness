// LIVE — PROBE-0: THE FIRST ADMIN WRITE THIS APP HAS EVER SENT.
//
// `manage:jira-configuration` is proven under Forge `asUser` for READS ONLY —
// three `getTransitionProperties` 200s and an `evaluateExpression` 200, measured
// live. No admin WRITE has ever been sent. If Forge or Atlassian restricts admin
// mutations under offline impersonation, cuts A, B1, B2 and B3 are dead on
// arrival, and the way to find that out is one call rather than sixty-three.
//
// The operation is `createProjectCategory` against a list that is `[]`, so the
// blast radius is zero: a project category with no projects in it reaches no
// issue, no board, no scheme and no person. Its inverse is a documented DELETE
// on the id the create returns.
//
// STEP 3 IS THE ONE THAT GATES FOUR SURGEONS, so it is logged loudly and its
// full failure body is captured rather than summarised. §7.5 of the frame is
// explicit that a 403 here says NOTHING about which of three things is true, and
// a harness that reported "the account is not an admin" would be inventing the
// one cause no call returned.
//
// SAFETY. The category is created by this spec and removed by it — by the undo
// if the undo works, by REST if it does not. The three admin policy rows are
// captured before anything is touched and written back in `finally`.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import {
  GLOBAL_APP,
  PANEL_APP,
  QUOTA_BUBBLE,
  callResolver,
  deleteFixtures,
  describeLogs,
  logWindow,
  openGlobalPage,
  openPanel,
  scoreToolOutcome,
  skipIfQuotaBlocked,
  waitForChatApp,
} from "./chatwise-support";
import { adminTab, openAdminSettings, resolveAdminRoot } from "./admin-credentials-support";
// eslint-disable-next-line
import { get, post, request } from "../../data/jira.mjs";

const T = getTarget("chatwise-admin");
const CHAT = getTarget("chatwise-global");
const PANEL = getTarget("chatwise-issue-panel");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";
const GAP_MS = Number(process.env.CHATWISE_TURN_GAP_MS || 300_000);
const QUOTA_WAIT_MS = Number(process.env.CHATWISE_QUOTA_WAIT_MS || 960_000);

/** The three rows this spec drives, in the order the card chains them. */
const ROWS = ["allowJiraAdminTools", "allowJiraAdminWrites", "allowJiraAdminDestroy"] as const;

test.describe.configure({ timeout: 14_400_000 });

test("PROBE-0: an administrator changes this site's configuration, and can put it back", async ({
  page,
}) => {
  test.setTimeout(14_400_000);
  test.skip(!T.envId || !CHAT.envId, "env ids unresolved — run `npm run discover`.");

  const stamp = Date.now();
  const CAT_NAME = `harness-test-cat-${stamp}`;
  const CAT_DESC = `Created by PROBE-0 at ${new Date(stamp).toISOString()}`;
  const conversationId = `conv_probe0_${stamp}`;
  let frame: any = null;
  let policyBefore: any = null;
  let createdId: string | null = null;
  let panelIssue: string | null = null;
  const findings: string[] = [];
  const table: Array<Record<string, unknown>> = [];

  /** Every project category on this site, as Jira states it. */
  const categories = async (): Promise<any[]> => (await get("/rest/api/3/projectCategory")) || [];
  const mine = async () => (await categories()).find((c: any) => c.name === CAT_NAME);

  async function turn(label: string, message: string, opts: { panel?: any } = {}) {
    const f = opts.panel || frame;
    const app = opts.panel ? PANEL_APP : GLOBAL_APP;
    const t0 = Date.now();
    // ⚠️ `issueKey` IS WHAT MAKES A TURN A PANEL TURN, and omitting it made this
    // spec report a false P0 on its first run.
    //
    // The consumer decides `inIssuePanel` from `job.issueKey` — that is the
    // frame's own condition, `job.issueKey == null` — and `chat.routes.js` takes
    // `issueKey` off the PAYLOAD. Calling the route from the panel's frame with
    // only a conversation id produces `profile=standard` and
    // `allowJiraAdminWrites=true`, which reads exactly like the write group
    // leaking into the panel. It is the harness talking to the backend the way
    // the panel never does.
    const sent: any = await callResolver(f, app, "chat", {
      conversationId: opts.panel ? `issue-${panelIssue}` : conversationId,
      message, personaId: "jira-admin", personaLocked: true,
      ...(opts.panel ? { issueKey: panelIssue } : {}),
    });
    expect(sent?.success, `${label}: enqueue failed: ${JSON.stringify(sent?.error)}`).toBeTruthy();
    let data: any = null;
    const deadline = Date.now() + 600_000;
    while (Date.now() < deadline) {
      const r: any = await callResolver(f, app, "getJobStatus", { jobId: sent.jobId });
      data = r?.data ?? null;
      if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
      await page.waitForTimeout(3000);
    }
    expect(data?.status, `${label}: job did not complete: ${data?.error}`).toBe("completed");
    const reply = String(data.result?.response || "");
    const lines = await logWindow(
      page,
      (ls) => ls.some((l) => l.at >= t0 && /^\[Consumer\] toolset:/.test(l.text)),
      { label: `${label} consumer line` },
    );
    const win = lines.filter((l: any) => l.at >= t0);
    console.log(
      `\n######## ${label}\nASK: ${message}\nBUBBLE:\n${reply.slice(0, 2200)}\nLOG:\n` +
        describeLogs(win.filter((l: any) =>
          /^\[Tools\]|^\[Consumer\] toolset|^\[JiraAdmin\]|^\[Confirmation\]|^\[Ledger\]/.test(l.text))),
    );
    return { reply, win };
  }
  async function turnQ(label: string, message: string, opts: { panel?: any } = {}) {
    let r = await turn(label, message, opts);
    if (QUOTA_BUBBLE.test(r.reply)) {
      console.log(`[quota] ${label} blocked; waiting ${Math.round(QUOTA_WAIT_MS / 1000)}s, one retry`);
      await page.waitForTimeout(QUOTA_WAIT_MS);
      r = await turn(`${label}-retry`, message, opts);
    }
    return r;
  }
  const toolsetOf = (win: any[]) =>
    win.find((l: any) => /^\[Consumer\] toolset:/.test(l.text))?.text || "";
  const gateIn = (line: string, flag: string) =>
    (line.match(new RegExp(`${flag}=(true|false(?:\\([^)]*\\))?)`)) || [])[1] || "(absent)";

  /**
   * The admin page's checkbox for one policy row.
   *
   * Forge PREFIXES the id on first paint and drops it after any re-render, so
   * ends-with is the stable selector — anchored on the BARE name, without the
   * leading dash, or it matches only the first render.
   */
  const rowBox = (root: any, id: string) =>
    root.locator(`input[type="checkbox"][id$="${id}"]`).first();

  /**
   * FLIP A TOGGLE. `check()`/`uncheck()` DO NOT WORK ON THESE.
   *
   * Atlaskit's Toggle is a visually-hidden input under a styled track, so
   * Playwright's actionability check resolves the input, finds a decorative
   * `<span>` intercepting pointer events and retries until it times out
   * (measured: `subtree intercepts pointer events`, 20s, on
   * `allowJiraAdminTools`). `journey-admin-ui` has clicked these with
   * `{ force: true }` since the destructive row shipped; this is the same move
   * with the desired STATE asserted afterwards rather than assumed, because a
   * forced click on an already-correct toggle would flip it the wrong way.
   */
  async function setRow(root: any, id: string, want: boolean) {
    const box = rowBox(root, id);
    await box.waitFor({ state: "attached", timeout: 30_000 });
    if ((await box.isChecked()) === want) return;
    await box.click({ force: true });
    await expect
      .poll(async () => box.isChecked(), { timeout: 15_000 })
      .toBe(want);
  }

  try {
    /* =================== PRE-FLIGHT: the list really is empty ============ */
    const before = await categories();
    console.log(`[truth] GET /rest/api/3/projectCategory before = ${JSON.stringify(before)}`);
    if (before.length) {
      findings.push(
        `the category list was NOT empty before the probe: ` +
          `${before.map((c: any) => `${c.id}:${c.name}`).join(", ")} — proceeding with the unique ` +
          `name ${CAT_NAME}, and the blast-radius disclosure is judged against this list, not []`,
      );
      console.log(`[truth] NOT EMPTY — ${findings[findings.length - 1]}`);
    }
    expect(
      before.some((c: any) => c.name === CAT_NAME),
      `a category called ${CAT_NAME} already exists, which cannot happen`,
    ).toBe(false);

    /* =================== 1. THE ADMIN PAGE'S DEPENDENT CHAIN ============= */
    await assertLoggedIn(page);
    let root: any = await openAdminSettings(page, T.deepLink(T.envId)!);
    // Capture the policy BEFORE anything is clicked — this is what `finally`
    // writes back, and reading it from the route rather than from the boxes
    // means a mis-click cannot corrupt the record of what was there.
    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    policyBefore = (await callResolver(frame, GLOBAL_APP, "getToolPolicy", {})) as any;
    console.log(`[policy] before = ${JSON.stringify(policyBefore?.policy || policyBefore)}`);

    root = await openAdminSettings(page, T.deepLink(T.envId)!);
    for (const id of ROWS) {
      await rowBox(root, id).waitFor({ state: "attached", timeout: 30_000 });
    }
    // With tools OFF, writes must be DISABLED — not merely unchecked. An
    // unreachable-but-live control is a lever an admin can move that does
    // nothing, which is the `allowBulk` class this codebase has paid for twice.
    await setRow(root, "allowJiraAdminTools", false);
    await page.waitForTimeout(1_000);
    const writesDisabledWhileToolsOff = await rowBox(root, "allowJiraAdminWrites").isDisabled();
    console.log(`[card] tools OFF -> writes control disabled = ${writesDisabledWhileToolsOff}`);
    expect.soft(
      writesDisabledWhileToolsOff,
      `"Allow Jira administration changes" is live while reading configuration is switched off. ` +
        `The chain is what makes the disabled branch reachable at all: saveToolPolicy would ` +
        `happily store allowJiraAdminWrites: true under a closed outer gate, and the row would be ` +
        `believed and do nothing.`,
    ).toBe(true);

    await setRow(root, "allowJiraAdminTools", true);
    await page.waitForTimeout(1_000);
    const writesLiveNow = !(await rowBox(root, "allowJiraAdminWrites").isDisabled());
    expect.soft(writesLiveNow, `writes stayed disabled after reading was switched on`).toBe(true);
    await setRow(root, "allowJiraAdminWrites", true);
    await page.waitForTimeout(1_000);

    // The destructive row needs `allowDestructive` too, which this spec leaves
    // OFF — so it must still be unavailable with writes on.
    const destroyDisabled = await rowBox(root, "allowJiraAdminDestroy").isDisabled();
    const destructiveOn = await rowBox(root, "allowDestructive").isChecked().catch(() => false);
    console.log(
      `[card] writes ON, allowDestructive=${destructiveOn} -> destroy control disabled = ${destroyDisabled}`,
    );
    expect.soft(
      destroyDisabled,
      `"Allow high-impact configuration changes" is live while allowDestructive is ` +
        `${destructiveOn}. The same site-wide switch that governs deleting an issue governs ` +
        `destroying configuration — an admin who switched irreversible acts off did not mean ` +
        `"except the big ones".`,
    ).toBe(!destructiveOn);

    await root.getByRole("button", { name: "Save tool policy", exact: true }).first().click();
    await page.waitForTimeout(4_000);

    // READ IT BACK FROM THE ROUTE, not from the boxes. What the card shows and
    // what the consumer will read are two different things, and only the second
    // one decides a turn.
    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    const saved: any = await callResolver(frame, GLOBAL_APP, "getToolPolicy", {});
    const p = saved?.policy || saved;
    console.log(`[policy] after save = ${JSON.stringify(p)}`);
    expect(p?.allowJiraAdminTools, "reading configuration did not save as on").not.toBe(false);
    expect(p?.allowJiraAdminWrites, "the write row did not save as on").toBe(true);
    expect.soft(p?.allowJiraAdminDestroy, "the destroy row saved as on with allowDestructive off")
      .not.toBe(true);
    table.push({ step: "1 policy", writes: p?.allowJiraAdminWrites, destroy: p?.allowJiraAdminDestroy });

    /* =================== 2. THE GATE LINE, BOTH SURFACES ================= */
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId, title: "[harness-test] PROBE-0", personaId: "jira-admin",
    });
    const warm = await turnQ("gate-global", `Which permission scheme does ${PROJECT} use?`);
    skipIfQuotaBlocked(warm.reply, "probe0/gate");
    const globalLine = toolsetOf(warm.win);
    console.log(`[gate] GLOBAL: ${globalLine}`);
    expect(
      globalLine,
      `allowJiraAdminWrites is not open on the global page after the row was saved on:\n${globalLine}`,
    ).toMatch(/allowJiraAdminWrites=true/);
    table.push({ step: "2 gate global", value: gateIn(globalLine, "allowJiraAdminWrites") });

    // THE PANEL. The frame's guarantee is that the write groups never reach it.
    const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
    const std = (meta?.issueTypes || meta?.values || []).find((t: any) => t.hierarchyLevel === 0);
    const made: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT }, issuetype: { id: String(std.id) },
        summary: `[harness-test] probe0 panel ${stamp}`, labels: ["harness-test"],
      },
    });
    panelIssue = made.key;
    const pFrame = await openPanel(page, PANEL, panelIssue!);
    await waitForChatApp(page, pFrame, PANEL_APP, 120_000);
    await pFrame.locator("#dropdownSelected").click();
    await pFrame.locator("#dropdownOptions .dropdown-option").filter({ hasText: /Jira Administrator/ }).first().click();
    await page.waitForTimeout(GAP_MS);
    const panelTurn = await turnQ("gate-panel", "What is this issue about?", { panel: pFrame });
    const panelLine = toolsetOf(panelTurn.win);
    console.log(`[gate] PANEL: ${panelLine}`);
    const panelValue = gateIn(panelLine, "allowJiraAdminWrites");
    // SOFT, and the reason is structural rather than a lack of conviction: this
    // is a claim about which SURFACE offers a capability, and step 3 below is
    // the measurement four surgeons are waiting on. A surface claim that aborts
    // the run takes the answer with it — which is exactly what happened on the
    // first run of this spec, and on `admin-persona-panel` before it.
    expect.soft(
      panelLine,
      `THE WRITE GROUP REACHED THE ISSUE PANEL. The frame's guarantee is that it never does: the ` +
        `panel is open on one issue and reconfiguring a whole site from it is the wrong shape.\n` +
        `${panelLine}`,
    ).toMatch(/allowJiraAdminWrites=false/);
    expect.soft(
      panelLine,
      `the panel turn did not run under the issue-panel profile, so this measured a global-page ` +
        `turn and says nothing about the panel:\n${panelLine}`,
    ).toMatch(/profile=issue-panel/);
    // WHAT THE REASON SAYS, recorded rather than asserted. The consumer reports
    // `admin-off` for the panel deliberately (asyncConsumer.js: inventing a
    // `not-here` code would add a fifth administration line to the standing
    // notes for a situation the user resolves by moving to the chat page). The
    // brief expected a reason naming the panel; those are different designs and
    // the measurement is what settles which shipped.
    console.log(`[gate] PANEL reason for allowJiraAdminWrites = ${panelValue}`);
    findings.push(`panel gate value = ${panelValue} (the brief expected a reason naming the panel)`);
    table.push({ step: "2 gate panel", value: panelValue });

    /* =================== 3. THE WRITE — THIS GATES FOUR SURGEONS ========= */
    // ⚠️ BACK TO THE GLOBAL PAGE FIRST, AND RE-ACQUIRE THE FRAME. There is ONE
    // browser window; opening the panel navigated it to the issue, so the
    // handle captured before step 2 points at a page that is no longer loaded.
    // The symptom is not a timeout but
    // `window.chatWiseGlobal is not present — the app has not booted`, thrown
    // on the first turn of step 3 — which is to say, the measurement four
    // surgeons are waiting on dies on a stale variable.
    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await page.waitForTimeout(GAP_MS);
    const ask = await turnQ(
      "write-ask",
      `Create a project category called "${CAT_NAME}" with the description "${CAT_DESC}".`,
    );
    const afterAsk = await categories();
    expect(
      afterAsk.some((c: any) => c.name === CAT_NAME),
      `THE PLAIN CALL CREATED THE CATEGORY. A first call reads, discloses and asks.`,
    ).toBe(false);
    const askedFirst = /confirm|say yes|shall I|would you like|go ahead|proceed/i.test(ask.reply);
    const askScore = scoreToolOutcome("applyJiraConfigChange", ask.win.map((l: any) => l.text));
    console.log(`[PROBE-0] ask: created=false asked=${askedFirst} outcome=${askScore.status}`);
    expect.soft(askedFirst, `the asking turn changed nothing but did not ask:\n${ask.reply.slice(0, 900)}`).toBe(true);
    table.push({ step: "3 ask", changed: false, asked: askedFirst, outcome: askScore.status });

    await page.waitForTimeout(GAP_MS);
    const yes = await turnQ("write-yes", "Yes, create it.");
    const created = await mine();
    createdId = created ? String(created.id) : null;
    const yesScore = scoreToolOutcome("applyJiraConfigChange", yes.win.map((l: any) => l.text));
    const undoId = (yes.reply.match(/\b(rv_[a-z0-9]+_[a-z0-9]{6,})\b/) || [])[1] || null;

    // ⚠️ THE ANSWER THE CAMPAIGN TURNS ON, printed whole and early.
    const failures = yes.win.filter((l: any) =>
      /^\[Tools\] .*applyJiraConfigChange.* failed:/.test(l.text) ||
      /^\[JiraAdmin\] HTTP/.test(l.text) ||
      /^\[Tools\] Error in applyJiraConfigChange/.test(l.text));
    console.log(
      `\n================ PROBE-0 RESULT ================\n` +
        `asUser admin WRITE: created=${Boolean(created)} id=${createdId} ` +
        `outcome=${yesScore.status} undoId=${undoId}\n` +
        `REST: ${JSON.stringify(await categories())}\n` +
        (failures.length
          ? `FULL FAILURE LINES (frame risk 1 — this decides cuts A, B1, B2, B3):\n` +
            failures.map((l: any) => l.text).join("\n") + "\n"
          : `no failure line\n`) +
        `===============================================\n`,
    );
    findings.push(
      `PROBE-0: created=${Boolean(created)} outcome=${yesScore.status} undoId=${undoId}` +
        (failures.length ? ` FAILURE: ${failures.map((l: any) => l.text).join(" | ").slice(0, 600)}` : ""),
    );
    expect.soft(
      Boolean(created),
      `THE FIRST ADMIN WRITE UNDER asUser DID NOT LAND. This is frame risk 1 and it decides cuts ` +
        `A, B1, B2 and B3.\nOutcome: ${yesScore.status}\nEvidence: ${yesScore.evidence}\n` +
        `Failure lines:\n${failures.map((l: any) => l.text).join("\n") || "(none)"}\n` +
        `Reply:\n${yes.reply.slice(0, 1400)}`,
    ).toBe(true);
    if (created) {
      expect.soft(created.name, "the created category has the wrong name").toBe(CAT_NAME);
      expect.soft(created.description, "the created category has the wrong description").toBe(CAT_DESC);
      expect.soft(
        undoId,
        `the write landed but did not STATE its undo id, so the 30-day promise points at nothing ` +
          `the user can quote:\n${yes.reply.slice(0, 900)}`,
      ).toBeTruthy();
    }
    table.push({
      step: "3 yes", created: Boolean(created), id: createdId,
      name: created?.name, description: created?.description, undoId, outcome: yesScore.status,
    });

    /* =================== 4. THE UNDO ===================================== */
    let createdIdForCard: string | null = null;
    if (undoId && created) {
      await page.waitForTimeout(GAP_MS);
      const undo = await turnQ("write-undo", `Undo change ${undoId}.`);
      const listAfter = await categories();
      const gone = !listAfter.some((c: any) => c.name === CAT_NAME);
      // KEPT FOR THE CARD, which is about the ROW and not about the object:
      // `createdId` is cleared so the cleanup does not chase a category that is
      // already gone, and the card oracle still needs the id that was made.
      createdIdForCard = createdId;
      if (gone) createdId = null;
      const negated = /\bno drift\b|nothing else changed/i.test(undo.reply);
      const claims = /\bdrift(ed)?\b|changed since|no longer matches/i.test(undo.reply);
      console.log(`[PROBE-0] undo: gone=${gone} list=${JSON.stringify(listAfter)} driftComplaint=${claims && !negated}`);
      expect.soft(gone, `the undo did not remove the category:\n${undo.reply.slice(0, 900)}`).toBe(true);
      expect.soft(claims && !negated, `the undo complained about drift on an object nothing else touched`).toBe(false);
      table.push({ step: "4 undo", gone, remaining: listAfter.length });

      await page.waitForTimeout(GAP_MS);
      const led = await turnQ("ledger", "List the recent changes made with the stored credentials, with their ids and states.");
      const ledScore = scoreToolOutcome("listRecentChanges", led.win.map((l: any) => l.text));
      console.log(`[PROBE-0] listRecentChanges outcome=${ledScore.status}`);
      expect.soft(ledScore.status, `listRecentChanges: ${ledScore.evidence}`).not.toBe("withheld");
      expect.soft(
        led.reply.includes(undoId),
        `the ledger does not carry the undo id of a change made minutes ago (${undoId}):\n` +
          `${led.reply.slice(0, 1200)}`,
      ).toBe(true);
      // ⚠️ THE KIND IS AN INTERNAL NAME AND THE MODEL IS FORBIDDEN TO SHOW IT.
      // `JIRA_ASUSER` is the ledger's dispatch key, not a word for a user, and
      // MODEL_AUDIENCE_RULE keeps internal identifiers out of replies — which
      // is why the reply says "Create project category" where the row says
      // JIRA_ASUSER. So this is RECORDED, never asserted: what the user needs
      // is the id and the state, and both are there.
      const saysKind = /JIRA_ASUSER/i.test(led.reply);
      console.log(`[PROBE-0] ledger reply names the internal kind JIRA_ASUSER = ${saysKind} (not required)`);
      findings.push(`ledger row for ${undoId}: present=${led.reply.includes(undoId)} kind-named=${saysKind}`);
      table.push({ step: "4 ledger", carriesId: led.reply.includes(undoId), kindNamed: saysKind });

      /**
       * AND THE SETTINGS CARD SHOWS IT.
       *
       * ⚠️ NOT MATCHED ON THE UNDO ID (F-LV-23, mine, 13.16.0). The revert id
       * appears in the card in EXACTLY ONE PLACE — the sentence "Ask the Jira
       * Administrator assistant: undo change {id}" — and that sentence is only
       * rendered for a row that can STILL be undone. This step runs AFTER the
       * undo, so the row is `Reverted` and the id is correctly absent. Matching
       * on it reported "changes card row: (absent)" about a row that was right
       * there, on 13.16.0 and on 13.10.0 before it. Dumped the card to settle it:
       *
       *   createProjectCategory | 10101 (project-category) | 712020:937bc860…
       *   | 9/7/2026, 10:29:22 AM | Reverted
       *   This change was undone. Nothing further to do.
       *
       * So the oracle is the OBJECT — the op name and the id this run created —
       * and the STATE the row must be in. The undo sentence is asserted only on
       * a row that still has an undo, which is a different row on this card.
       */
      const r2 = await openAdminSettings(page, T.deepLink(T.envId)!);
      void r2;
      const rowToken = createdIdForCard ? `${createdIdForCard} (project-category)` : "createProjectCategory";
      let cardText = "";
      const deadline = Date.now() + 45_000;
      for (;;) {
        cardText = await page.evaluate(() => document.body.innerText);
        if (cardText.includes(rowToken) || Date.now() > deadline) break;
        await page.waitForTimeout(2_000);
      }
      const cardHasRow = cardText.includes(rowToken);
      const idx = cardText.indexOf(rowToken);
      const rowBlock = idx >= 0 ? cardText.slice(Math.max(0, idx - 120), idx + 260).replace(/\n+/g, " | ") : "";
      console.log(`[PROBE-0] changes card row for "${rowToken}": ${cardHasRow ? rowBlock : "(absent)"}`);
      expect.soft(cardHasRow, `the changes card does not show the row for ${rowToken}`).toBe(true);
      // The row this run undid must READ as undone. A card that showed it as
      // still applied would send an administrator to reverse it twice.
      expect.soft(
        cardHasRow && /Reverted/i.test(rowBlock),
        `the changes card does not show this row as Reverted after the undo landed:\n${rowBlock}`,
      ).toBe(true);
      // AND the assistant-naming sentence exists on the card for rows that DO
      // still have an undo — the site half must not send anybody to the
      // Organisation Administrator.
      expect.soft(
        /Ask the Jira Administrator assistant: undo change/i.test(cardText),
        `the changes card carries no undo sentence naming the JIRA Administrator assistant on ANY ` +
          `row. The site half's rows must not send an administrator to the Organisation one.`,
      ).toBe(true);
      table.push({ step: "4 card", row: cardHasRow, reverted: /Reverted/i.test(rowBlock) });
    }

    /* =================== 5. TWO DEGRADED PATHS =========================== */
    /**
     * STOOD DOWN BY NAME when the answer is already banked on a LATER build.
     *
     * The writes-off half of this section is the 13.10.0 finding that produced
     * the standing administration note, and it has since been re-measured on
     * 13.12.0 and 13.13.0 in BOTH English and German by
     * `writes-off-and-changes-card.spec.ts`, which also carries the
     * poisoned-conversation control this file does not have. Re-burning two
     * model turns here to re-answer a newer question worse is the trade this
     * switch exists to refuse — and it is a switch rather than a deletion
     * because the unknown-op half has no other home.
     */
    if (process.env.CHATWISE_PROBE_SKIP_DEGRADED === "1") {
      console.log(
        "[PROBE-0] section 5 (degraded paths) stood down by CHATWISE_PROBE_SKIP_DEGRADED=1 — " +
          "the writes-off case is banked on 13.12.0 and 13.13.0, EN and DE, in " +
          "writes-off-and-changes-card.spec.ts",
      );
      return;
    }
    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await page.waitForTimeout(GAP_MS);
    // ⚠️ AN OP THE TABLE GENUINELY LACKS. This used to ask for a permission
    // grant, and cut A shipped `addPermissionGrant` — so on 13.10.0 the model
    // correctly went looking for the group, found none called "developers",
    // measured the scheme's blast radius and refused honestly. Excellent
    // behaviour, and it stopped measuring the §7.1 sentence entirely. Automation
    // rules have no plan and no endpoint in this surface.
    const unknown = await turnQ(
      "degraded-unknown-op",
      `Create an automation rule on ${PROJECT} that assigns every new bug to me.`,
    );
    const catsNow = await categories();
    const listsWhatItCan = /createProjectCategory|project categor/i.test(unknown.reply);
    const blamesRights = /you (do not|don't) have|not an admin|lack.*permission/i.test(unknown.reply);
    console.log(`[PROBE-0] unknown op: listsCapabilities=${listsWhatItCan} blamesRights=${blamesRights}`);
    expect.soft(
      listsWhatItCan,
      `§7.1 requires the refusal to LIST what it can do — "These are the changes it can make to ` +
        `this site's configuration: …" — so the user can pick one:\n${unknown.reply.slice(0, 1000)}`,
    ).toBe(true);
    expect.soft(
      blamesRights,
      `the unknown-op refusal reads as a PERMISSIONS problem. Nothing was called, so nothing ` +
        `returned a cause about this user's rights:\n${unknown.reply.slice(0, 1000)}`,
    ).toBe(false);
    expect(catsNow.length, `the unknown-op turn changed the category list`).toBe((await categories()).length);
    table.push({ step: "5 unknown op", listsCapabilities: listsWhatItCan, blamesRights });

    // WRITES OFF, THEN THE SAME ASK.
    const r3 = await openAdminSettings(page, T.deepLink(T.envId)!);
    await setRow(r3, "allowJiraAdminWrites", false);
    await page.waitForTimeout(1_000);
    await r3.getByRole("button", { name: "Save tool policy", exact: true }).first().click();
    await page.waitForTimeout(4_000);
    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await page.waitForTimeout(GAP_MS);
    const off = await turnQ(
      "degraded-writes-off",
      `Create a project category called "${CAT_NAME}-off" with the description "should not exist".`,
    );
    const offLine = toolsetOf(off.win);
    console.log(`[gate] writes OFF: ${gateIn(offLine, "allowJiraAdminWrites")}`);
    expect(offLine, `the write gate stayed open after the row was switched off`)
      .toMatch(/allowJiraAdminWrites=false/);
    const offList = await categories();
    expect(
      offList.some((c: any) => String(c.name).startsWith(`${CAT_NAME}-off`)),
      `A CATEGORY WAS CREATED WITH THE WRITE ROW SWITCHED OFF.`,
    ).toBe(false);
    const namesSettings = /Manage apps|ChatWise → Settings|ChatWise admin|settings/i.test(off.reply);
    console.log(`[PROBE-0] writes-off refusal names the settings address = ${namesSettings}`);
    expect.soft(
      namesSettings,
      `the switched-off refusal does not name where it is switched back on:\n${off.reply.slice(0, 900)}`,
    ).toBe(true);
    table.push({ step: "5 writes off", gate: gateIn(offLine, "allowJiraAdminWrites"), namesSettings, created: false });
  } finally {
    console.table(table);
    console.log(`[PROBE-0] FINDINGS:\n- ${findings.join("\n- ") || "(none)"}`);

    // ---- the category, if the undo did not take it ----------------------
    try {
      const left = (await categories()).find((c: any) => c.name === CAT_NAME || String(c.name).startsWith(`${CAT_NAME}-off`));
      if (left) {
        await request("DELETE", `/rest/api/3/projectCategory/${left.id}`);
        console.log(`[restore] category ${left.id} "${left.name}" deleted by REST`);
      }
      console.log(`[restore] GET /rest/api/3/projectCategory = ${JSON.stringify(await categories())}`);
    } catch (e) {
      console.warn(`[restore] a project category MAY REMAIN: ${(e as Error)?.message}`);
    }
    await deleteFixtures([panelIssue], "probe0");

    // ---- the three policy rows, back to exactly what they were ----------
    try {
      const was = policyBefore?.policy || policyBefore;
      if (was) {
        const f = await openGlobalPage(page, CHAT);
        await waitForChatApp(page, f, GLOBAL_APP, 120_000);
        await callResolver(f, GLOBAL_APP, "saveToolPolicy", { policy: was });
        const now: any = await callResolver(f, GLOBAL_APP, "getToolPolicy", {});
        const n = now?.policy || now;
        console.log(
          `[restore] policy rows: tools=${n?.allowJiraAdminTools} writes=${n?.allowJiraAdminWrites} ` +
            `destroy=${n?.allowJiraAdminDestroy} destructive=${n?.allowDestructive}`,
        );
        for (const k of ROWS) {
          if ((n?.[k] === true) !== (was?.[k] === true)) {
            console.warn(`[restore] ${k} did NOT go back to ${was?.[k]} — it reads ${n?.[k]}`);
          }
        }
      }
    } catch (e) {
      console.warn(
        `[restore] COULD NOT restore the tool policy (${(e as Error)?.message}). Switch the three ` +
          `administration rows back by hand on the ChatWise settings page.`,
      );
      try {
        const r = await resolveAdminRoot(page);
        await adminTab(r, "Settings").click();
      } catch { /* nothing further to try */ }
    }
  }
});

// LIVE (13.10.0+): CUTS B2 + B3 — a whole project's life, on a project the
// PERSONA creates and the persona destroys.
//
// One ordered flow, because every step needs the one before it: the project has
// to exist before its workflow scheme can move, and it has to be in the recycle
// bin before "permanently" means anything. Six changes on one object, three of
// them undone, two of them behind a gravity turn.
//
// THE THREE CLAIMS THAT ARE NOT "did it work":
//
//   switchWorkflowScheme states a MEASURED number. It is `radiusExtra`, the one
//   plan in the table that binds a measurement into the confirmation radius —
//   "move WFH onto scheme 10002" hashes the same whether that scheme has three
//   workflows or thirty, and somebody can republish it between the ask and the
//   yes. The ticket must say how many issues would MOVE (0 on an empty project)
//   and carry the versionId, or the user is approving an act nobody described.
//
//   deleteProject must NOT offer a retention date. Nothing in Jira's API says
//   how long the recycle bin keeps anything, so a number here would be invented
//   — and it is exactly the kind of invention a user plans around.
//
//   purgeProject's gravity turn states counts and names the reversible
//   neighbour. `deleteProject` puts it in the bin and `archiveProject` leaves it
//   readable; an irreversible ask is never answered with a flat yes/no.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP, callResolver, openGlobalPage, waitForChatApp,
} from "./chatwise-support";
import {
  adminTurns, askThenYes, complainsOfDrift, restoreAdminPolicy, setAdminPolicy, undoIdIn,
} from "./jira-admin-write-support";
// eslint-disable-next-line
import { request } from "../../data/jira.mjs";

const CHAT = getTarget("chatwise-global");
const GAP_MS = Number(process.env.CHATWISE_TURN_GAP_MS || 300_000);

test.describe.configure({ timeout: 14_400_000 });

test("projects: created by the persona, its schemes moved, binned, restored and purged", async ({
  page,
}) => {
  test.setTimeout(14_400_000);
  test.skip(!CHAT.envId, "env ids unresolved — run `npm run discover`.");

  const stamp = Date.now();
  /** ≤10 chars, letters first — Jira's project-key shape. */
  const KEY = `HT${String(stamp).slice(-6)}`;
  const conversationId = `conv_projwrites_${stamp}`;
  let frame: any = null;
  let policyWas: any = null;
  let purged = false;
  const table: Array<Record<string, unknown>> = [];
  const findings: string[] = [];

  /** The project as Jira has it, or null when it is gone. */
  const project = async (): Promise<any> => {
    try {
      return await request("GET", `/rest/api/3/project/${KEY}`);
    } catch {
      return null;
    }
  };
  const notifSchemeId = async (): Promise<string | null> => {
    try {
      const r: any = await request("GET", `/rest/api/3/project/${KEY}/notificationscheme`);
      return r?.id ? String(r.id) : null;
    } catch {
      return null;
    }
  };
  const workflowSchemeId = async (id: string): Promise<string | null> => {
    try {
      const r: any = await request("GET", `/rest/api/3/workflowscheme/project?projectId=${id}`);
      return r?.values?.[0]?.workflowScheme?.id ? String(r.values[0].workflowScheme.id) : null;
    } catch {
      return null;
    }
  };

  /**
   * SECTIONS THAT CAN STAND DOWN BY NAME when their answer is banked on the
   * build under test or a later one. The scheme sections in the middle are what
   * 13.17.0 changed; re-burning six model turns on the create-undo and the
   * bin/purge tail — both PASS on 13.15.0/13.16.0 — is quota this suite shares
   * with every other journey.
   */
  const ONLY_SCHEMES = process.env.CHATWISE_PROJECT_ONLY_SCHEMES === "1";
  try {
    if (ONLY_SCHEMES) console.log("[projects] create-undo and the bin/purge tail stood down by CHATWISE_PROJECT_ONLY_SCHEMES=1");
    expect(await project(), `a project ${KEY} already exists`).toBeNull();

    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    policyWas = await setAdminPolicy(frame, {
      allowJiraAdminTools: true, allowJiraAdminWrites: true,
      allowJiraAdminDestroy: true, allowDestructive: true,
    });
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId, title: "[harness-test] project writes", personaId: "jira-admin",
    });
    const turns = adminTurns(page, () => frame, conversationId);
    const me: any = await request("GET", "/rest/api/3/myself");

    /* ============ 1. THE PERSONA CREATES THE PROJECT ==================== */
    const create = await askThenYes(
      turns, "create",
      `Create a company-managed Jira Software project with key ${KEY}, called ` +
        `"[harness-test] project writes ${stamp}", led by account ${me.accountId}, using the ` +
        `template com.pyxis.greenhopper.jira:gh-simplified-kanban-classic.`,
      "Yes, create it.", GAP_MS, page,
    );
    const made = await project();
    console.log(`[projects] created=${Boolean(made)} id=${made?.id} undoId=${create.yes.undoId}`);
    expect.soft(Boolean(made), `one yes did not create ${KEY}:\n${create.yes.reply.slice(0, 1000)}`).toBe(true);
    expect.soft(create.yes.undoId, `createProject did not STATE its undo id`).toBeTruthy();
    table.push({ step: "createProject", created: Boolean(made), undoId: create.yes.undoId });
    test.skip(!made, "the project was not created, so nothing below can be measured");

    // THE UNDO OF A CREATE PUTS IT IN THE BIN — and then this spec puts it
    // back, because everything after here needs the project.
    if (!ONLY_SCHEMES && create.yes.undoId) {
      await page.waitForTimeout(GAP_MS);
      const undo = await turns.turn("create-undo", `Undo change ${create.yes.undoId}.`);
      const afterUndo = await project();
      const binned = !afterUndo || afterUndo?.archived === true || afterUndo?.deleted === true;
      console.log(`[projects] after the create-undo: project readable = ${Boolean(afterUndo)} (binned=${binned})`);
      expect.soft(binned, `the undo of a createProject did not put ${KEY} away:\n${undo.reply.slice(0, 900)}`).toBe(true);
      table.push({ step: "createProject/undo", binned });
      // Put it back by REST — this is a fixture, not a measurement.
      await request("POST", `/rest/api/3/project/${KEY}/restore`).catch(() => {});
      const back = await project();
      console.log(`[fixture] ${KEY} restored for the rest of the run: ${Boolean(back)}`);
      test.skip(!back, `${KEY} could not be restored after the create-undo`);
    }

    const proj = await project();
    const projectId = String(proj.id);

    /* ============ 2. THE NOTIFICATION SCHEME ============================ */
    const notifBefore = await notifSchemeId();
    const schemes: any = await request("GET", "/rest/api/3/notificationscheme?maxResults=50");
    const other = (schemes?.values || []).find((s: any) => String(s.id) !== notifBefore);
    console.log(`[truth] ${KEY} notification scheme before = ${notifBefore}; moving to ${other?.id} "${other?.name}"`);
    if (other) {
      await page.waitForTimeout(GAP_MS);
      const notif = await askThenYes(
        turns, "notif",
        `Put project ${KEY} on the notification scheme ${other.id}.`,
        "Yes, do it.", GAP_MS, page,
      );
      const notifAfter = await notifSchemeId();
      const moved = notifAfter === String(other.id);
      console.log(`[projects] notification scheme after = ${notifAfter} (moved=${moved})`);
      expect.soft(moved, `assignNotificationScheme did not move ${KEY}:\n${notif.yes.reply.slice(0, 900)}`).toBe(true);
      expect.soft(notif.yes.undoId, `assignNotificationScheme did not STATE its undo id`).toBeTruthy();
      table.push({ step: "assignNotificationScheme", moved, undoId: notif.yes.undoId });

      if (notif.yes.undoId && moved) {
        await page.waitForTimeout(GAP_MS);
        const undo = await turns.turn("notif-undo", `Undo change ${notif.yes.undoId}.`);
        const backTo = await notifSchemeId();
        console.log(`[projects] notification scheme after undo = ${backTo} (was ${notifBefore})`);
        expect.soft(backTo, `the undo did not put the notification scheme back`).toBe(notifBefore);
        expect.soft(complainsOfDrift(undo.reply), `the undo complained about drift on an untouched project`).toBe(false);
        table.push({ step: "assignNotificationScheme/undo", back: backTo === notifBefore });
      }
    } else {
      findings.push("assignNotificationScheme SKIPPED: this site has only one notification scheme");
    }

    /* ============ 3. THE WORKFLOW SCHEME, WITH ITS MEASUREMENT ========== */
    const wfBefore = await workflowSchemeId(projectId);
    const wfs: any = await request("GET", "/rest/api/3/workflowscheme?maxResults=50");
    const otherWf = (wfs?.values || []).find((s: any) => String(s.id) !== String(wfBefore));
    // GROUND TRUTH: an empty project, so the honest answer is zero.
    const issues: any = await request("POST", "/rest/api/3/search/jql", {
      body: { jql: `project = ${KEY}`, maxResults: 0 },
    }).catch(() => ({ total: -1 }));
    console.log(
      `[truth] ${KEY} workflow scheme before = ${wfBefore}; target = ${otherWf?.id} "${otherWf?.name}"; ` +
        `issues in project = ${issues?.total}`,
    );
    if (otherWf) {
      await page.waitForTimeout(GAP_MS);
      const ask = await turns.turn(
        "wf-ask", `Switch project ${KEY} to the workflow scheme ${otherWf.id}.`,
      );
      // THE MEASUREMENT IN THE TICKET. `radiusExtra` binds it into the radius,
      // and the whole reason it is there is that the argument does not describe
      // the act — so the ticket must say what was measured.
      const saysCount = /\b0\b|\bno issues\b|zero issues|nothing (would )?move/i.test(ask.reply);
      const saysVersion = /version/i.test(ask.reply);
      console.log(`[projects] workflow ticket: statesIssueCount=${saysCount} statesVersion=${saysVersion}`);
      expect.soft(
        saysCount,
        `the workflow-scheme ticket does not state how many issues would MOVE. On an empty project ` +
          `that number is 0, and it is the difference between a change and the 159-ticket ` +
          `incident:\n${ask.reply.slice(0, 1000)}`,
      ).toBe(true);
      expect.soft(
        saysVersion,
        `the ticket does not mention the scheme version it measured. A scheme republished between ` +
          `the ask and the yes is a different act with the same arguments:\n${ask.reply.slice(0, 1000)}`,
      ).toBe(true);
      expect(await workflowSchemeId(projectId), `the PLAIN call moved the workflow scheme`).toBe(wfBefore);

      /**
       * ⚠️ THIS ASSERTION WAS INVERTED, AND IT WAS MY OWN OBSERVATION TURNED
       * INTO A CONTRACT (13.17.0).
       *
       * It read `expect(movedEarly).toBe(false)` — "a destructive workflow
       * switch must not move on the first yes" — which encoded the 13.15.0
       * behaviour I had just reported as the F-LV-20 DEFECT: the yes-turn
       * doubled call minted a fresh ticket instead of redeeming, so the user
       * paid a third turn. `assignWorkflowScheme` is `risk: "write"`, not
       * destructive; ONE yes is the contract, and 13.17.0 delivers it. A test
       * that hardens the bug it just filed will fail the fix.
       *
       * So: one yes must move it. The second turn is still SENT, because a
       * build where the first yes did nothing must still be measured rather
       * than left hanging — but it is now the fallback, not the expectation.
       */
      await page.waitForTimeout(GAP_MS);
      const yes1 = await turns.turn("wf-yes-1", "Yes, switch it.");
      const movedEarly = (await workflowSchemeId(projectId)) !== wfBefore;
      const gravityish = /cannot be undone|nothing can undo|permanent|irreversible/i.test(yes1.reply);
      console.log(`[projects] workflow first yes: moved=${movedEarly} gravitySentence=${gravityish}`);
      expect.soft(
        movedEarly,
        `ONE yes did not switch the workflow scheme. assignWorkflowScheme is a reversible write, ` +
          `so the second question costs the user a turn for nothing (F-LV-20):\n${yes1.reply.slice(0, 900)}`,
      ).toBe(true);
      expect.soft(
        gravityish,
        `the reply calls a REVERSIBLE scheme switch irreversible, which is the gravity language ` +
          `reserved for changes that really cannot be undone:\n${yes1.reply.slice(0, 700)}`,
      ).toBe(false);
      let wfAfter = await workflowSchemeId(projectId);
      let landingReply = yes1.reply;
      if (!movedEarly) {
        await page.waitForTimeout(GAP_MS);
        const yes2 = await turns.turn("wf-yes-2", "Yes, I understand. Switch it.");
        wfAfter = await workflowSchemeId(projectId);
        landingReply = yes2.reply;
      }
      /**
       * ⚠️ "SAYS ACCEPTED" IS ONLY REQUIRED IF JIRA ANSWERED 303, and this
       * harness cannot see the status code. MEASURED 13.17.0: the switch
       * completed synchronously — REST read back the new scheme immediately —
       * and the reply said "Done", which is then CORRECT. The neighbouring
       * `assignIssueSecurityScheme` genuinely is a 303 and said "Jira has
       * accepted … applying it in the background", so the app can clearly tell
       * the two apart. Recorded, not asserted, until the status is observable.
       */
      const saysAccepted = /accept|background|in progress|has started|queued/i.test(landingReply);
      console.log(
        `[projects] workflow after: ${wfAfter} (was ${wfBefore}); turns=${movedEarly ? 1 : 2}; ` +
          `saysAccepted=${saysAccepted} (recorded, not required — this call completed synchronously)`,
      );
      table.push({ step: "switchWorkflowScheme", yesTurns: movedEarly ? 1 : 2, saysAccepted, after: wfAfter });
    } else {
      findings.push("switchWorkflowScheme SKIPPED: this site has only one workflow scheme");
    }

    /* ============ 3b. THE ISSUE SECURITY SCHEME (13.17.0) ================ */
    /**
     * A BARE ROW IS NO SCHEME. Measured on a fresh company-managed project:
     * `GET /project/{key}/issuesecuritylevelscheme` answers with a row that
     * names no scheme, which is the same "known absence read as unreadable"
     * shape as the notification 404. The assign is a 303 — Jira ACCEPTS it and
     * finishes in the background — so the reply must say ACCEPTED, never done,
     * and the undo clears it with `schemeId: null`.
     */
    if (process.env.CHATWISE_PROJECT_SECURITY === "1" && (await project())) {
      const secOf = async (): Promise<string | null> => {
        try {
          const r: any = await request("GET", `/rest/api/3/project/${KEY}/issuesecuritylevelscheme`);
          return r?.id ? String(r.id) : null;
        } catch {
          return null;
        }
      };
      const secBefore = await secOf();
      const schemes: any = await request("GET", "/rest/api/3/issuesecurityschemes").catch(() => null);
      const target = ((schemes?.issueSecuritySchemes || []) as any[])[0] || null;
      console.log(`[truth] ${KEY} issue security before = ${secBefore ?? "(none)"}; target = ${target?.id ?? "(none available)"} "${target?.name ?? ""}"`);
      if (!target) {
        findings.push("assignIssueSecurityScheme SKIPPED: this site has no issue security scheme to assign");
      } else {
        await page.waitForTimeout(GAP_MS);
        const sAsk = await turns.turn(
          "sec-ask",
          `Put project ${KEY} on the issue security scheme ${target.id} ("${target.name}").`,
        );
        const midway = await secOf();
        expect(midway, `the PLAIN call assigned the issue security scheme`).toBe(secBefore);
        await page.waitForTimeout(GAP_MS);
        const sYes = await turns.turn("sec-yes", "Yes, do it.");
        let secAfter: string | null = null;
        const dl = Date.now() + 120_000;
        for (;;) {
          secAfter = await secOf();
          if (secAfter === String(target.id) || Date.now() > dl) break;
          await page.waitForTimeout(10_000);
        }
        const assigned = secAfter === String(target.id);
        const saysAccepted = /accept|in the background|asynchronous|not finished|processing/i.test(sYes.reply);
        const undoId = undoIdIn(sYes.reply);
        console.log(`[projects] issue security: ${secBefore ?? "(none)"} -> ${secAfter ?? "(none)"} (assigned=${assigned}) saysAccepted=${saysAccepted} undoId=${undoId}`);
        expect.soft(assigned, `the issue security scheme was not assigned:\n${sYes.reply.slice(0, 900)}`).toBe(true);
        expect.soft(
          saysAccepted,
          `Jira answers 303 for an issue-security assignment and finishes it in the background; the ` +
            `reply must say ACCEPTED rather than done:\n${sYes.reply.slice(0, 900)}`,
        ).toBe(true);
        table.push({ step: "assignIssueSecurityScheme", assigned, saysAccepted, undoId });
        if (undoId && assigned) {
          await page.waitForTimeout(GAP_MS);
          const sUndo = await turns.turn("sec-undo", `Undo change ${undoId}.`);
          let cleared = false;
          const dl2 = Date.now() + 120_000;
          for (;;) {
            cleared = (await secOf()) === secBefore;
            if (cleared || Date.now() > dl2) break;
            await page.waitForTimeout(10_000);
          }
          console.log(`[projects] issue security after the undo: ${(await secOf()) ?? "(none)"} (cleared=${cleared})`);
          expect.soft(cleared, `the undo did not clear the issue security scheme:\n${sUndo.reply.slice(0, 900)}`).toBe(true);
          expect.soft(complainsOfDrift(sUndo.reply), `the undo complained about drift on a scheme nothing touched`).toBe(false);
          table.push({ step: "assignIssueSecurityScheme/undo", cleared });
        }
      }
    }

    /* ============ 4. THE RECYCLE BIN, AND NO INVENTED DATE ============== */
    if (ONLY_SCHEMES) return;
    await page.waitForTimeout(GAP_MS);
    const del = await askThenYes(
      turns, "delete", `Delete project ${KEY}.`, "Yes, delete it.", GAP_MS, page,
    );
    const saysBin = /recycle bin|trash|restore/i.test(del.ask.reply);
    // ⚠️ NO RETENTION NUMBER. Nothing in Jira's API says how long the bin keeps
    // anything, so a number here is invented — and users plan around it.
    const invents = /\b(\d+)\s*(day|days|week|weeks|month|months)\b/i.test(
      del.ask.reply.replace(/\b30 days\b/gi, ""), // the LEDGER's 30 days is a different promise and is fine
    );
    console.log(`[projects] delete ticket: namesRecycleBin=${saysBin} inventsRetention=${invents}`);
    expect.soft(saysBin, `the delete ticket does not say the project goes to the recycle bin`).toBe(true);
    expect.soft(
      invents,
      `the delete ticket offers a RETENTION PERIOD for the recycle bin. Jira's API does not say ` +
        `how long it keeps anything, so any number here is invented — and it is the kind of ` +
        `invention somebody plans around:\n${del.ask.reply.slice(0, 1000)}`,
    ).toBe(false);
    const afterDelete = await project();
    const binned = !afterDelete || afterDelete?.deleted === true || afterDelete?.archived === true;
    console.log(`[projects] after delete: readable=${Boolean(afterDelete)} binned=${binned}`);
    expect.soft(binned, `one yes did not delete ${KEY}:\n${del.yes.reply.slice(0, 900)}`).toBe(true);
    expect.soft(del.yes.undoId, `deleteProject did not STATE its undo id`).toBeTruthy();
    table.push({ step: "deleteProject", binned, undoId: del.yes.undoId, namesBin: saysBin, inventsRetention: invents });

    if (del.yes.undoId && binned) {
      await page.waitForTimeout(GAP_MS);
      const undo = await turns.turn("delete-undo", `Undo change ${del.yes.undoId}.`);
      const restored = Boolean(await project());
      console.log(`[projects] after the delete-undo: ${KEY} readable = ${restored}`);
      expect.soft(restored, `the undo did not restore ${KEY}:\n${undo.reply.slice(0, 900)}`).toBe(true);
      table.push({ step: "deleteProject/undo", restored });
    }

    /* ============ 5. THE PURGE, WITH ITS GRAVITY ======================== */
    if (await project()) {
      await page.waitForTimeout(GAP_MS);
      const g1 = await turns.turn("purge-ask", `Permanently delete project ${KEY}. I mean gone, not the bin.`);
      expect(Boolean(await project()), `the PLAIN call purged the project`).toBe(true);
      await page.waitForTimeout(GAP_MS);
      const g2 = await turns.turn("purge-yes-1", "Yes, permanently delete it.");
      const survived = Boolean(await project());
      const both = `${g1.reply}\n${g2.reply}`;
      const namesCounts = /\bissues?\b/i.test(both) && /\b0\b|\bno issues\b|board|version/i.test(both);
      const namesNeighbour = /recycle bin|archive|deleteProject|restore/i.test(both);
      console.log(
        `[projects] purge gravity: firstYesRefused=${survived} namesCounts=${namesCounts} namesNeighbour=${namesNeighbour}`,
      );
      expect.soft(survived, `THE FIRST YES PURGED THE PROJECT:\n${g2.reply.slice(0, 900)}`).toBe(true);
      expect.soft(
        namesCounts,
        `the purge gravity turn states no measured counts (issues, boards, versions):\n${both.slice(0, 1400)}`,
      ).toBe(true);
      expect.soft(
        namesNeighbour,
        `the purge gravity turn does not name the reversible neighbour — the recycle bin, or ` +
          `archiving:\n${both.slice(0, 1400)}`,
      ).toBe(true);
      table.push({ step: "purgeProject/gravity", firstYesRefused: survived, namesCounts, namesNeighbour });

      if (survived) {
        await page.waitForTimeout(GAP_MS);
        const g3 = await turns.turn("purge-yes-2", "Yes, I understand nothing can undo it. Purge it.");
        let gone = false;
        const deadline = Date.now() + 120_000;
        for (;;) {
          gone = !(await project());
          if (gone || Date.now() > deadline) break;
          await page.waitForTimeout(10_000);
        }
        purged = gone;
        console.log(`[projects] after the purge: ${KEY} gone = ${gone}`);
        expect.soft(gone, `the second yes did not purge ${KEY}:\n${g3.reply.slice(0, 900)}`).toBe(true);
        expect.soft(g3.drift.map((d) => d.text), `the second yes was refused by a radius mismatch`).toEqual([]);
        table.push({ step: "purgeProject/yes-2", gone });
      }
    }
  } finally {
    console.table(table);
    console.log(`[projects] FINDINGS:\n- ${findings.join("\n- ") || "(none)"}`);
    /**
     * ⚠️ THE BIN IS PART OF THE TENANT (F-LV-18, found 13.15.0 before this spec
     * ran for the third time).
     *
     * `project()` is `GET /rest/api/3/project/{key}`, which 404s for a project
     * in the RECYCLE BIN. So the old guard `!purged && await project()` was
     * false in exactly the case the cleanup existed for — a run that binned the
     * project and then failed before the purge left it in the bin FOREVER, and
     * reported "readable at the end = false" as if the tenant were clean.
     *
     * MEASURED: four of them had accumulated — HT155350, HT166076, HT276359,
     * HT784073 — over previous runs of this file, every one of which I had
     * reported as restored. I purged them by hand.
     *
     * `DELETE /rest/api/3/project/{key}?enableUndo=false` purges a project that
     * is ALREADY in the bin (measured 204 on HT155350; a `/restore` first is
     * not needed and 404s). The sweep is keyed on THIS run's key only — the bin
     * holds other harnesses' projects and they are not mine to remove.
     */
    try {
      if (!purged && (await project())) {
        await request("DELETE", `/rest/api/3/project/${KEY}?enableUndo=false`);
        console.log(`[restore] ${KEY} deleted by REST`);
      }
      if (!purged) {
        const bin: any = await request("GET", "/rest/api/3/project/search?status=deleted&maxResults=100").catch(() => null);
        const inBin = ((bin?.values || []) as any[]).some((x) => x.key === KEY);
        if (inBin) {
          await request("DELETE", `/rest/api/3/project/${KEY}?enableUndo=false`).catch(() => {});
          console.log(`[restore] ${KEY} was in the RECYCLE BIN and has been purged`);
        }
      }
      const bin2: any = await request("GET", "/rest/api/3/project/search?status=deleted&maxResults=100").catch(() => null);
      const stillBinned = ((bin2?.values || []) as any[]).some((x) => x.key === KEY);
      const left = await project();
      console.log(`[restore] ${KEY} at the end: live=${Boolean(left)} inRecycleBin=${stillBinned}`);
      if (left || stillBinned) {
        console.warn(
          `[restore] ⚠️ ${KEY} IS STILL ON THIS SITE (${left ? "live" : "in the recycle bin"}). ` +
            `Purge it: DELETE /rest/api/3/project/${KEY}?enableUndo=false`,
        );
      }
    } catch (e) {
      console.warn(`[restore] could not remove ${KEY}: ${(e as Error)?.message}`);
    }
    try {
      if (frame) {
        await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
        await restoreAdminPolicy(frame, policyWas);
      }
    } catch (e) {
      console.warn(`[restore] could not put the tool policy back: ${(e as Error)?.message}`);
    }
  }
});

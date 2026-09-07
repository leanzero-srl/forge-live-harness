// LIVE (13.10.0+): THE SITE-TOKEN GROUP AFTER CUT R.
//
// The group is one WRITE now — `createSiteUser`, the one change no Forge scope
// can make — plus the two READS that were folded back into
// `getProjectConfiguration` as asUser parts. `site-token-tools.spec.ts` measured
// a group that no longer exists (`getScreenConfiguration`,
// `getIssueSecurityScheme`, `archiveProject`) and is replaced by this file.
//
// ⚠️ THIS SPEC CREATES A REAL ATLASSIAN ACCOUNT AND ATLASSIAN EMAILS IT AN
// INVITATION. Nothing can recall that email — not the undo, not an
// administrator, not Atlassian. The undo DELETES the account; the invitation
// stays sent. So the address is a PLUS-ADDRESS on the site administrator's own
// mailbox: the only person who receives anything is the person who owns this
// tenant, and the account is removed by REST in `finally` if the undo does not
// take it. An address at somebody else's domain would be mail this harness sent
// to a stranger.
import { test, expect } from "../../fixtures/forge";
import fs from "node:fs";
import path from "node:path";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import {
  GLOBAL_APP,
  QUOTA_BUBBLE,
  callResolver,
  describeLogs,
  logWindow,
  openGlobalPage,
  scoreToolOutcome,
  skipIfQuotaBlocked,
  waitForChatApp,
} from "./chatwise-support";
import {
  SECRETS_DIR,
  adminTab,
  cardState,
  hasSecret,
  loadCredentialCopy,
  openAdminSettings,
  removeCredentialViaCard,
  resolveAdminRoot,
  secret,
  skipUntilCardsPresent,
  storeCredentialViaCard,
} from "./admin-credentials-support";
// eslint-disable-next-line
import { request } from "../../data/jira.mjs";

const T = getTarget("chatwise-admin");
const CHAT = getTarget("chatwise-global");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";
const GAP_MS = Number(process.env.CHATWISE_TURN_GAP_MS || 300_000);
const QUOTA_WAIT_MS = Number(process.env.CHATWISE_QUOTA_WAIT_MS || 960_000);

/**
 * Everyone `/user/search` returns for an address, and WHICH OF THEM IS THE ONE.
 *
 * ⚠️ NOT ON THE ROW COUNT. Measured 7 Sep 2026: `/user/search` with an address
 * nobody has returns NINETEEN rows on this site — every app and system account.
 * "rows.length === 0" would call every address taken.
 *
 * ⚠️ AND NOT ON THE ADDRESS EITHER, WHICH IS WHAT THIS FILE USED TO DO AND WHY
 * IT LEFT A REAL ACCOUNT BEHIND (13.14.0). Jira returns `emailAddress` ONLY
 * when the account's privacy settings allow it, and for a freshly created one
 * it comes back ABSENT. So the match failed on an account that existed, the
 * spec reported `created=false`, and the cleanup said "is not a user — nothing
 * to remove" about an ACTIVE account it had just made. A negative that
 * authorises skipping a cleanup has to be PROVEN, and that one was merely
 * observed.
 *
 * Two oracles that do answer:
 *   - the ACCOUNT ID, when the reply stated one — `/user?accountId=` is exact;
 *   - the DISPLAY NAME, which Atlassian derives from the address's local part
 *     ("mihai+harness-test-1788756736288") and which IS returned.
 */
async function searchByEmail(email: string, accountId?: string | null): Promise<{ rows: any[]; match: any }> {
  if (accountId) {
    const exact = await request("GET", `/rest/api/3/user?accountId=${encodeURIComponent(accountId)}`).catch(() => null);
    if (exact) return { rows: [exact], match: exact };
  }
  const local = email.split("@")[0].toLowerCase();
  const rows: any[] = (await request(
    "GET", `/rest/api/3/user/search?query=${encodeURIComponent(email)}`,
  )) || [];
  return {
    rows,
    match:
      rows.find((u: any) => String(u?.emailAddress || "").toLowerCase() === email.toLowerCase()) ||
      rows.find((u: any) => String(u?.displayName || "").toLowerCase() === local) ||
      null,
  };
}

test.describe.configure({ timeout: 14_400_000 });

test("createSiteUser creates a real account, states its undo id, and the undo deletes it", async ({
  page,
}) => {
  test.setTimeout(14_400_000);
  test.skip(!T.envId || !CHAT.envId, "env ids unresolved — run `npm run discover`.");
  test.skip(
    !hasSecret(".site_token") || !hasSecret(".site_email"),
    "no .site_token/.site_email — this spec stores a REAL credential or does nothing",
  );

  const copy: any = await loadCredentialCopy();
  const SITE = copy.SITE_TOKEN_CARD;
  const stamp = Date.now();
  const conversationId = `conv_siteuser_${stamp}`;

  /**
   * THE ADDRESS, and every part of it is a safety decision.
   *
   * A plus-address on the stored administrator's OWN mailbox: Atlassian's
   * invitation lands with the person who owns this tenant and nobody else.
   * `harness-test` so a stray is findable, and the timestamp so a re-run never
   * collides with an account a previous run failed to remove.
   */
  const adminEmail = secret(".site_email");
  const [local, domain] = adminEmail.split("@");
  const NEW_EMAIL = `${local}+harness-test-${stamp}@${domain}`;

  let frame: any = null;
  let createdAccountId: string | null = null;
  /** Did the UNDO remove it, or did the cleanup? The run must be able to say. */
  let undoRemovedIt = false;
  const findings: string[] = [];
  const table: Array<Record<string, unknown>> = [];

  async function turn(label: string, message: string) {
    const t0 = Date.now();
    const sent: any = await callResolver(frame, GLOBAL_APP, "chat", {
      conversationId, message, personaId: "jira-admin", personaLocked: true,
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
    const lines = await logWindow(
      page,
      (ls) => ls.some((l) => l.at >= t0 && /^\[Consumer\] toolset:/.test(l.text)),
      { label: `${label} consumer line` },
    );
    const win = lines.filter((l: any) => l.at >= t0);
    console.log(
      `\n######## ${label}\nASK: ${message}\nBUBBLE:\n${reply.slice(0, 1800)}\nLOG:\n` +
        describeLogs(win.filter((l: any) =>
          /^\[Tools\]|^\[Consumer\] toolset|^\[SiteToken\]|^\[Confirmation\]/.test(l.text))),
    );
    return { reply, win };
  }
  async function turnQ(label: string, message: string) {
    let r = await turn(label, message);
    if (QUOTA_BUBBLE.test(r.reply)) {
      console.log(`[quota] ${label} blocked; waiting ${Math.round(QUOTA_WAIT_MS / 1000)}s, one retry`);
      await page.waitForTimeout(QUOTA_WAIT_MS);
      r = await turn(`${label}-retry`, message);
    }
    return r;
  }
  const undoIdIn = (t: string) => (t.match(/\b(rv_[a-z0-9]+_[a-z0-9]{6,})\b/) || [])[1] || null;

  try {
    /* ---------------- PRE-FLIGHT: the address is genuinely new ---------- */
    const before = await searchByEmail(NEW_EMAIL);
    console.log(`[truth] ${NEW_EMAIL}: rows=${before.rows.length} match=${Boolean(before.match)}`);
    expect(before.match, `${NEW_EMAIL} is ALREADY a user, which cannot happen for a fresh stamp`).toBeNull();
    // THE POSITIVE CONTROL, on the same endpoint — the app makes this check and
    // so must the harness, or "no match" here proves nothing about anybody.
    const control = await searchByEmail(adminEmail);
    expect(
      control.match,
      `the search cannot see email addresses on this site — a control on an address that certainly ` +
        `IS a user came back without a match, so "this address is new" is unprovable and this ` +
        `spec must not create anything.`,
    ).toBeTruthy();

    /* ---------------- store the token ----------------------------------- */
    await assertLoggedIn(page);
    const root = await openAdminSettings(page, T.deepLink(T.envId)!);
    await skipUntilCardsPresent(root, [SITE.heading]);
    test.skip(
      (await cardState(root, SITE)) === "configured",
      "a site token is ALREADY stored on this install; refusing to destroy one it cannot restore",
    );
    await storeCredentialViaCard(root, SITE, { email: adminEmail, token: secret(".site_token") });
    expect(await cardState(root, SITE), "the card does not show the token as stored").toBe("configured");

    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId, title: "[harness-test] site user", personaId: "jira-admin",
    });

    /* ================= 1. THE TWO FOLDED READS, asUser =================== */
    //
    // They were `getScreenConfiguration` and `getIssueSecurityScheme` in the
    // site-token group and both 400d for two deploys. Cut R folds them into
    // `getProjectConfiguration` as asUser parts, so the question is no longer
    // "do they work with a token" but "does the ordinary configuration read
    // carry them" — which is a different tool and a different authority.
    const cfg = await turnQ(
      "folded-reads",
      `Read the full configuration of project ${PROJECT}. I want the SCREENS — which screen ` +
        `scheme each issue type uses and the fields on the create screen — and the issue security ` +
        `scheme.`,
    );
    skipIfQuotaBlocked(cfg.reply, "site-user/folded-reads");
    const cfgScore = scoreToolOutcome("getProjectConfiguration", cfg.win.map((l: any) => l.text));
    console.log(`[folded] getProjectConfiguration -> ${cfgScore.status} :: ${cfgScore.evidence}`);
    expect.soft(cfgScore.status, `getProjectConfiguration: ${cfgScore.evidence}`).toBe("200");
    // No site-token read should be called for this at all any more.
    for (const gone of ["getScreenConfiguration", "getIssueSecurityScheme"]) {
      const s = scoreToolOutcome(gone, cfg.win.map((l: any) => l.text));
      expect.soft(
        s.status,
        `${gone} was still called. Cut R folded these into getProjectConfiguration as asUser ` +
          `parts; a tool that survives in the group is 670 tokens an iteration for a capability ` +
          `that moved.`,
      ).toBe("not-called");
    }
    // GROUND TRUTH for the parts, by the ids these endpoints address a project by.
    const proj: any = await request("GET", `/rest/api/3/project/${PROJECT}`);
    const itss: any = await request(
      "GET", `/rest/api/3/issuetypescreenscheme/project?projectId=${proj.id}`,
    );
    const schemeName = itss?.values?.[0]?.issueTypeScreenScheme?.name || "";
    const namesScheme = schemeName && cfg.reply.includes(schemeName);
    // A field the create screen really carries, so "screens" is not just a name.
    const screens: any = await request("GET", "/rest/api/3/screens?maxResults=100");
    const wfhScreen = (screens?.values || []).find((s: any) => /WFH Create Issue Screen/i.test(s.name || ""));
    console.log(
      `[truth] issue-type screen scheme = "${schemeName}" (named in reply: ${namesScheme}); ` +
        `create screen = ${wfhScreen?.id} "${wfhScreen?.name}"`,
    );
    expect.soft(
      namesScheme,
      `the configuration read does not name ${PROJECT}'s issue-type screen scheme ` +
        `("${schemeName}"), so the folded screens part did not arrive:\n${cfg.reply.slice(0, 1200)}`,
    ).toBe(true);
    const mentionsSecurity = /issue security|security scheme|security level/i.test(cfg.reply);
    expect.soft(
      mentionsSecurity,
      `the configuration read says nothing about issue security. ${PROJECT} has none, and "none" ` +
        `is an answer the folded part must give rather than omit — a silent absence reads as a ` +
        `question that was never asked:\n${cfg.reply.slice(0, 1200)}`,
    ).toBe(true);
    table.push({ step: "folded reads", outcome: cfgScore.status, namesScheme, mentionsSecurity });

    /* ================= 2. THE ASK — nothing created ====================== */
    await page.waitForTimeout(GAP_MS);
    const ask = await turnQ(
      "createuser-ask",
      `Create an Atlassian account on this site for ${NEW_EMAIL}, with no product access.`,
    );
    const afterAsk = await searchByEmail(NEW_EMAIL);
    expect(
      afterAsk.match,
      `THE PLAIN CALL CREATED AN ACCOUNT. A first call checks the address is new, says Atlassian ` +
        `emails an invitation, and asks.`,
    ).toBeNull();
    // THE DISCLOSURE HAS TO CARRY THE IRRECOVERABLE PART. The invitation email
    // is the thing no undo reaches, and a ticket that does not say so is asking
    // for consent to something the user has not been told.
    const saysEmail = /invitation|invite|email/i.test(ask.reply);
    const saysUndoDeletes = /delete|removes? the account|deletes the account/i.test(ask.reply);
    const saysAuthority = /stored (site )?admin|administrator who stored|administrator token/i.test(ask.reply);
    console.log(
      `[createuser] ask: created=false email-named=${saysEmail} undo-deletes=${saysUndoDeletes} ` +
        `authority=${saysAuthority}`,
    );
    expect.soft(saysEmail, `the ticket does not say Atlassian emails them an invitation`).toBe(true);
    expect.soft(saysUndoDeletes, `the ticket does not say the undo DELETES the account`).toBe(true);
    expect.soft(
      saysAuthority,
      `the ticket does not say it runs as the stored administrator. The audit log will name that ` +
        `person for an account somebody else asked for:\n${ask.reply.slice(0, 900)}`,
    ).toBe(true);
    table.push({ step: "createUser/ask", created: false, saysEmail, saysUndoDeletes, saysAuthority });

    /* ================= 3. ONE YES ======================================= */
    await page.waitForTimeout(GAP_MS);
    const yes = await turnQ("createuser-yes", "Yes, create the account.");
    /**
     * ⚠️ THE REPLY'S OWN ACCOUNT ID IS AN INPUT TO THE CHECK, NOT THE CHECK.
     * It is not evidence the account exists — `/user?accountId=` is — but it is
     * the one handle that survives Jira hiding the address, and without it this
     * spec reported `created=false` about an ACTIVE account it had just made.
     * A stated id that resolves to nothing is a fabrication and reads as
     * `match: null` here, which is exactly the right answer.
     */
    const statedId = (yes.reply.match(/\b(\d{6}:[0-9a-f-]{36}|[0-9a-f]{24})\b/) || [])[1] || null;
    console.log(`[createuser] the reply states account id = ${statedId || "(none)"}`);
    const after = await searchByEmail(NEW_EMAIL, statedId);
    createdAccountId = after.match?.accountId ? String(after.match.accountId) : null;
    const yesScore = scoreToolOutcome("createSiteUser", yes.win.map((l: any) => l.text));
    const undoId = undoIdIn(yes.reply);
    console.log(
      `\n========== createSiteUser ==========\n` +
        `created=${Boolean(after.match)} accountId=${createdAccountId} outcome=${yesScore.status} ` +
        `undoId=${undoId}\nREST match: ${JSON.stringify(after.match)}\n` +
        `====================================\n`,
    );
    expect.soft(
      Boolean(after.match),
      `one yes did not create the account. Outcome ${yesScore.status}: ${yesScore.evidence}\n` +
        `${yes.reply.slice(0, 1200)}`,
    ).toBe(true);
    expect.soft(
      undoId,
      `the account was created and the reply did not STATE its undo id — and this is the one tool ` +
        `where that matters most, because the undo is the only way to remove the account:\n` +
        `${yes.reply.slice(0, 900)}`,
    ).toBeTruthy();
    findings.push(`createSiteUser: created=${Boolean(after.match)} id=${createdAccountId} undoId=${undoId}`);
    table.push({ step: "createUser/yes", created: Boolean(after.match), accountId: createdAccountId, undoId });

    /* ================= 4. THE UNDO DELETES THE ACCOUNT =================== */
    if (undoId && after.match) {
      await page.waitForTimeout(GAP_MS);
      const undo = await turnQ("createuser-undo", `Undo change ${undoId}.`);
      // Deletion is not always instant; poll rather than read once.
      /**
       * ⚠️ "GONE" IS `active === false`, NOT "the row disappeared" (F-LV-24,
       * mine, 13.17.0).
       *
       * `DELETE /rest/api/3/user` removes SITE ACCESS and leaves the row
       * behind with `active: false` — I established that by hand earlier the
       * same day, and I fixed the CLEANUP for it and left the poll alone. So
       * the poll asked `/user?accountId=`, got the inactive row, and reported
       * `gone=false` for an undo that had done exactly what it said. It would
       * have read false for a PERFECT deletion, which makes it no evidence
       * either way — the worst kind of check, because it looks like one.
       *
       * The cleanup below is now conditional on this too: firing a DELETE at
       * an account the undo already removed is what destroyed the attribution
       * on this run — after it, nothing could say WHICH of the two did it.
       */
      let gone = false;
      let observed = "(never read)";
      const t0 = Date.now();
      const deadline = t0 + 90_000;
      for (;;) {
        const row = (await searchByEmail(NEW_EMAIL, createdAccountId)).match;
        gone = !row || row.active === false;
        observed = row ? `row present, active=${row.active}` : "no row at all";
        if (gone || Date.now() > deadline) break;
        await page.waitForTimeout(5_000);
      }
      // THE OBSERVATION, NOT JUST THE VERDICT. "gone=true" alone cannot tell a
      // reader whether the row went inactive or vanished, and the two are
      // different facts about what the undo did.
      console.log(
        `[createuser] the UNDO, measured at +${Math.round((Date.now() - t0) / 1000)}s: ${observed} ` +
          `-> removed=${gone}. NO REST cleanup has run at this point.`,
      );
      undoRemovedIt = gone;
      if (gone) createdAccountId = null;
      const undoScore = scoreToolOutcome("revertAdminChange", undo.win.map((l: any) => l.text));
      const negated = /\bno drift\b|nothing else changed/i.test(undo.reply);
      const claims = /\bdrift(ed)?\b|changed since|no longer matches/i.test(undo.reply);
      console.log(`[createuser] undo: gone=${gone} outcome=${undoScore.status} driftComplaint=${claims && !negated}`);
      expect.soft(
        undoScore.status,
        `revertAdminChange was not reachable: ${undoScore.evidence}. On 13.9.0 the ledger group ` +
          `was added only by the two CREDENTIAL gates, so an undo id was stated that the assistant ` +
          `could not redeem. A site token IS stored here, so allowSiteToken should have brought it in.`,
      ).not.toBe("not-called");
      expect.soft(gone, `the undo did not delete the account:\n${undo.reply.slice(0, 900)}`).toBe(true);
      expect.soft(claims && !negated, `the undo complained about drift on an account nothing touched`).toBe(false);
      table.push({ step: "createUser/undo", gone, outcome: undoScore.status });
    }
  } finally {
    console.table(table);
    console.log(`[createuser] FINDINGS:\n- ${findings.join("\n- ") || "(none)"}`);

    // ---- THE ACCOUNT, if the undo did not take it -----------------------
    try {
      const left = await searchByEmail(NEW_EMAIL, createdAccountId);
      // ⚠️ NOT IF THE UNDO ALREADY DID IT. A cleanup that fires anyway makes
      // the run unable to say which of the two removed the account, which is
      // exactly what happened on 13.17.0.
      if (undoRemovedIt) {
        console.log(`[restore] the UNDO already removed the account — no REST cleanup needed`);
      } else if (left.match?.accountId && left.match.active !== false) {
        await request("DELETE", `/rest/api/3/user?accountId=${encodeURIComponent(String(left.match.accountId))}`);
        await new Promise((z) => setTimeout(z, 8_000));
        const stillRow = (await searchByEmail(NEW_EMAIL, createdAccountId)).match;
        // ⚠️ `DELETE /rest/api/3/user` REMOVES SITE ACCESS; the row remains with
        // `active: false`, which is Atlassian's shape for a removed site user
        // and holds no licence. Treating the row's existence as failure would
        // send somebody to the admin console for a job already done.
        const still = stillRow && stillRow.active !== false ? stillRow : null;
        console.log(`[restore] account ${left.match.accountId} deleted by REST; still present = ${Boolean(still)}`);
        if (still) {
          console.warn(
            `[restore] ${NEW_EMAIL} IS STILL A USER on this site. Remove it in the Atlassian admin ` +
              `console — a stray account is a real person's licence seat.`,
          );
        }
      } else {
        console.log(`[restore] ${NEW_EMAIL} is not a user — nothing to remove`);
      }
    } catch (e) {
      console.warn(`[restore] COULD NOT remove ${NEW_EMAIL}: ${(e as Error)?.message}`);
    }
    // The invitation email cannot be recalled, and saying so is the point.
    console.log(
      `[restore] NOTE: if the account was created, Atlassian emailed ${NEW_EMAIL} an invitation. ` +
        `Deleting the account does not unsend it; that address is the site administrator's own ` +
        `mailbox, which is why it was chosen.`,
    );

    try {
      if (frame) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
      await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
      const r = await resolveAdminRoot(page);
      await adminTab(r, "Settings").click();
      await removeCredentialViaCard(r, SITE);
    } catch (e) {
      console.warn(
        `[restore] COULD NOT VERIFY the site token was removed (${(e as Error)?.message}). Take it ` +
          `off by hand — it acts as a named administrator.`,
      );
    }
  }
});

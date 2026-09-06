// LIVE (13.8.0+): THE ORGANISATION WRITE CYCLE, END TO END, IN ONE ORDER.
//
// ONE TEST, NOT SIX, and the order is the point. A revert id is handed out
// exactly once — in the result of the change that made it — so "undo it" is
// only reachable from the turn after "do it", and a suite that split these into
// independent tests would have to fabricate ids or skip the halves that matter.
//
// WHAT THIS EXISTS TO CATCH, measured live on 13.7.0:
//
//   THE USER SAID YES AND WAS REFUSED. Twice, on the two most consequential
//   writes, with the app's own words:
//       [Confirmation] applyOrgChange: blast radius changed since approval — refusing
//   The confirmation radius hashed EVERY argument except four control keys, so
//   `accountIds` — an advisory hint the model sends so the lockout guard can
//   count, and which is ALREADY the radius `keys` — was inside it. The turn
//   that raised the guard sent it; the turn that redeemed did not; the hashes
//   differed and the ticket could never be redeemed. `createPolicy` failed the
//   same way with a nested `attributes` body the model had to reproduce
//   byte-identically.
//
// So EVERY yes turn here asserts the absence of that line. It is the one
// assertion that cannot be satisfied by a model being lucky with its arguments:
// a radius that only matches when nothing drifts is a gate that works on a good
// day, and a consent gate that works on a good day is not a consent gate.
//
// SAFETY. Every object is created by this spec and removed by it: the group is
// made by REST and deleted by REST, the caller's own membership is put back by
// REST the moment the lockout case proves it can be removed, and the role grant
// is revoked by REST. Nothing here touches an object anybody uses.
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
const GAP_MS = Number(process.env.CHATWISE_TURN_GAP_MS || 300_000);
const QUOTA_WAIT_MS = Number(process.env.CHATWISE_QUOTA_WAIT_MS || 960_000);

/**
 * The role the assignOrgRole step grants.
 *
 * MEASURED on this organisation: platform roles are NAMESPACED —
 * `atlassian/org-admin`, `atlassian/site-admin`, `atlassian/user-access-admin`
 * — and two accounts already hold this one, so it is a real value and not a
 * guess. A bare `user-access-admin` would be a different string and Atlassian's
 * answer to that is itself worth reading.
 */
const ROLE = process.env.CHATWISE_ORG_ROLE || "atlassian/user-access-admin";

/** A direct org read/write, used ONLY as ground truth and for restores. */
async function org(
  pathSuffix: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; body: any }> {
  const key = fs.readFileSync(path.join(SECRETS_DIR, ".org_key"), "utf8").trim();
  const orgId = fs.readFileSync(path.join(SECRETS_DIR, ".org_id"), "utf8").trim();
  const res = await fetch(`https://api.atlassian.com/admin${pathSuffix.replace("{org}", orgId)}`, {
    method: init?.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* the status is still the finding */
  }
  return { status: res.status, body };
}

test.describe.configure({ timeout: 14_400_000 });

test("the organisation write cycle: ask, one yes, the id stated, the undo — and never a radius refusal", async ({
  page,
}) => {
  test.setTimeout(14_400_000);
  test.skip(!T.envId || !CHAT.envId, "env ids unresolved — run `npm run discover`.");
  test.skip(
    !hasSecret(".org_key") || !hasSecret(".org_id"),
    "no .org_key/.org_id — this spec stores a REAL organisation key or does nothing",
  );

  const copy: any = await loadCredentialCopy();
  const ORG = copy.ORG_KEY_CARD;
  const stamp = Date.now();
  const conversationId = `conv_org_cycle_${stamp}`;
  const GROUP_NAME = `harness-test-cycle-${stamp}`;
  const POLICY_NAME = `[harness-test] cycle ${stamp}`;

  let frame: any = null;
  let groupId: string | null = null;
  let directoryId = "";
  let callerId = "";
  let roleSubject: string | null = null;
  let roleGranted = false;
  let callerRemovedFromGroup = false;
  const findings: string[] = [];
  const table: Array<Record<string, unknown>> = [];

  /* ---------------------------------------------------------------- turns */
  async function turn(label: string, message: string) {
    const t0 = Date.now();
    const sent: any = await callResolver(frame, GLOBAL_APP, "chat", {
      conversationId, message, personaId: "jira-org-admin", personaLocked: true,
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
        describeLogs(
          win.filter((l: any) =>
            /^\[Tools\]|^\[Consumer\] toolset|^\[OrgAdmin\]|^\[Confirmation\]/.test(l.text)),
        ),
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

  /* ------------------------------------------------------------- oracles */
  /**
   * Who is in the group — organisation API, `groupIds=` PLURAL.
   *
   * TWO WRONG ORACLES CAME BEFORE THIS ONE, in opposite directions:
   *   `…/users?groupId={g}` (SINGULAR) is accepted and SILENTLY IGNORED — it
   *      returned all 15 directory users for an empty group and for a group of
   *      three, so a harness on it agreed with a broken tool and proved nothing;
   *   `/rest/api/3/group/member` OMITS suspended-membership accounts, so it
   *      disagreed with a write that had really landed and reported a working
   *      feature as broken.
   * `groupIds=` answers the question asked, on the same object the write
   * touched: 3 for site-admins, 0 for an all-zeros id.
   */
  const membersOf = async (gid: string): Promise<string[]> => {
    const r = await org(
      `/v2/orgs/{org}/directories/${directoryId}/users?groupIds=${encodeURIComponent(gid)}&limit=100`,
    );
    return ((r.body?.data || []) as any[]).map((u: any) => String(u.accountId));
  };
  const rolesOf = async (accountId: string): Promise<string[]> => {
    const r = await org(`/v2/orgs/{org}/directories/${directoryId}/users/${accountId}`);
    return Array.isArray(r.body?.data?.platformRoles) ? r.body.data.platformRoles.map(String) : [];
  };
  const policyStatus = async (id: string): Promise<string | undefined> =>
    (await org(`/v1/orgs/{org}/policies/${id}`)).body?.data?.attributes?.status;
  const policyNamed = async (name: string) =>
    ((await org("/v1/orgs/{org}/policies")).body?.data || []).find(
      (p: any) => p.attributes?.name === name,
    );

  /**
   * Did the reply COMPLAIN about drift — as opposed to mentioning the word?
   *
   * ⚠️ `/drift/i` matched "No drift was detected — nothing else changed to that
   * membership in the meantime", which is the tool reporting the OPPOSITE
   * (measured 13.8.0, on a clean undo). A negated word is not a complaint, and
   * a checker that cannot tell them apart turns a correct result into a defect
   * report.
   */
  const complainsOfDrift = (t: string) => {
    const negated = /\b(no|without|zero)\s+(drift|changes?)\b/i.test(t) || /nothing else changed/i.test(t);
    const claims =
      /\bdrift(ed)?\b/i.test(t) ||
      /changed since|no longer matches|someone else (has )?changed|has been modified since/i.test(t);
    return claims && !negated;
  };

  /** The undo id as the tool mints it — `rv_<base36>_<10>` and nothing else. */
  const undoIdIn = (t: string) => (t.match(/\b(rv_[a-z0-9]+_[a-z0-9]{6,})\b/) || [])[1] || null;

  /**
   * THE ASSERTION THIS FILE IS FOR.
   *
   * `[Confirmation] applyOrgChange: blast radius changed since approval` means
   * the user's yes was thrown away because the model's arguments drifted
   * between the turn that disclosed and the turn that redeemed. It is the
   * refusal a person experiences as "I said yes and it asked me again", and no
   * amount of correct gate logic upstream survives it.
   */
  function assertNoRadiusDrift(win: any[], step: string) {
    const all = win.filter((l: any) => /^\[Confirmation\].*blast radius changed/.test(l.text));

    /**
     * ⚠️ ONE OF THESE LINES IS THE APP TALKING TO ITSELF, AND IT IS NOT A
     * REFUSAL. Measured on 13.8.0, on a write that SUCCEEDED:
     *
     *   [Confirmation] applyOrgChange: blast radius changed since approval —
     *   refusing (differs: lockoutAcknowledged)
     *
     * `executeApplyOrgChange` redeems against the ACKNOWLEDGED radius first and
     * the plain one second, because a lockout re-ticket has to be preferred
     * over the ordinary ticket. On every write where no lockout fired, the
     * first attempt misses by exactly that one component and logs a WARN
     * saying "refusing" — then the second attempt succeeds and the change
     * lands. Treating that as the defect would fail every healthy write.
     *
     * So the signature is a drift on ANY OTHER component. That is only
     * expressible because 13.8.0 names which component moved; on 13.7.0 the
     * line said nothing and the cause had to be found by reading two argument
     * shapes side by side.
     */
    const real = all.filter((l: any) => {
      const named = (l.text.match(/differs:\s*([^)]*)/) || [])[1] || "";
      const parts = named.split(/[,\s]+/).filter(Boolean);
      return !(parts.length === 1 && parts[0] === "lockoutAcknowledged");
    });
    const benign = all.length - real.length;
    if (all.length) {
      console.log(
        `[radius] ${step}: ${all.length} drift line(s), ${benign} benign ` +
          `(the acknowledged-radius probe), ${real.length} real` +
          (real.length ? ` -> ${real.map((l: any) => l.text).join(" | ")}` : ""),
      );
    }
    if (real.length) findings.push(`${step}: RADIUS DRIFT — ${real[0].text}`);
    expect.soft(
      real.map((l: any) => l.text),
      `${step}: the user's yes was refused because the confirmation radius changed between the ` +
        `turn that disclosed the change and the turn that redeemed it. Whatever the model varied ` +
        `is inside the hashed act and should not be — an argument the user never saw and cannot ` +
        `control must not be able to invalidate their consent.`,
    ).toEqual([]);
    return real.length === 0;
  }

  try {
    /* ------------------------------------------------ ground truth + fixtures */
    const dirs = await org("/v2/orgs/{org}/directories");
    directoryId = String(dirs.body?.data?.[0]?.directoryId || "");
    expect(directoryId, "no user directory on this organisation").toBeTruthy();

    const me: any = await request("GET", "/rest/api/3/myself");
    callerId = String(me.accountId);

    const dirUsers = await org(`/v2/orgs/{org}/directories/${directoryId}/users?limit=100`);
    const people = (dirUsers.body?.data || []) as any[];

    // The add-member SUBJECT: anybody but the caller. A suspended-membership
    // account is preferred because adding one to an empty group with no
    // application access grants nothing at all — the least consequential real
    // write available on this tenant.
    const subject =
      people.find((u: any) => String(u.accountId) !== callerId && u.membershipStatus !== "active") ||
      people.find((u: any) => String(u.accountId) !== callerId);
    expect(subject?.accountId, "no second account in the directory to add to a group").toBeTruthy();

    // The ROLE subject, discovered rather than named: an obviously-disposable
    // address, NOT an active member, and holding NO roles — so the restore is
    // "revoke exactly what this spec granted" and cannot take away something
    // the account already had.
    const throwaway = people.find(
      (u: any) =>
        /harness|\+test|test\+|example\.invalid|\bbot@|\bsvc/i.test(String(u.email || "")) &&
        u.membershipStatus !== "active" &&
        (u.platformRoles || []).length === 0,
    );
    roleSubject = throwaway ? String(throwaway.accountId) : null;
    console.log(
      `[fixture] add-member subject=${subject.accountId} (${subject.name}, membership=${subject.membershipStatus}); ` +
        `role subject=${roleSubject ? `${roleSubject} (${throwaway.name}, no roles)` : "(NONE FOUND)"}`,
    );

    const made: any = await request("POST", "/rest/api/3/group", { body: { name: GROUP_NAME } });
    groupId = String(made.groupId);
    console.log(`[fixture] group "${GROUP_NAME}" id=${groupId}`);
    await page.waitForTimeout(5_000);

    /* ------------------------------------------------------- store the key */
    await assertLoggedIn(page);
    const root = await openAdminSettings(page, T.deepLink(T.envId)!);
    await skipUntilCardsPresent(root, [ORG.heading]);
    test.skip(
      (await cardState(root, ORG)) === "configured",
      "an organisation key is ALREADY stored on this install; refusing to destroy it",
    );
    await storeCredentialViaCard(root, ORG, { orgId: secret(".org_id"), key: secret(".org_key") });
    expect(await cardState(root, ORG), "the card does not show the key as stored").toBe("configured");

    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId, title: "[harness-test] org write cycle", personaId: "jira-org-admin",
    });

    /* ============================ 1. ADD A MEMBER, THEN UNDO IT ============ */
    const add1 = await turnQ(
      "add-ask",
      `Add the account ${subject.accountId} to the organisation group "${GROUP_NAME}". ` +
        `Find its group id first.`,
    );
    skipIfQuotaBlocked(add1.reply, "org-write-cycle/add-ask");
    expect(
      (await membersOf(groupId!)).length,
      `the PLAIN call CHANGED THE GROUP. A first call reads, discloses and asks.`,
    ).toBe(0);
    table.push({ step: "addGroupMember/ask", changed: false });

    await page.waitForTimeout(GAP_MS);
    const add2 = await turnQ("add-yes", "Yes, do it.");
    const afterAdd = await membersOf(groupId!);
    const addLanded = afterAdd.includes(String(subject.accountId));
    const addClean = assertNoRadiusDrift(add2.win, "addGroupMember/yes");
    const addId = undoIdIn(add2.reply);
    console.log(`[cycle] add: members=${afterAdd.length} landed=${addLanded} undoId=${addId} noDrift=${addClean}`);
    expect.soft(addLanded, `one yes did not add the member.\n${add2.reply.slice(0, 900)}`).toBe(true);
    expect.soft(
      addId,
      `the applied change did not STATE its undo id. The organisation card tells an administrator ` +
        `to ask for "undo change {id}", and an id that never appears in the conversation is an ` +
        `undo nobody can reach.\n${add2.reply.slice(0, 900)}`,
    ).toBeTruthy();
    table.push({ step: "addGroupMember/yes", applied: addLanded, undoId: addId, noDrift: addClean });

    if (addId && addLanded) {
      await page.waitForTimeout(GAP_MS);
      const add3 = await turnQ("add-undo", `Undo change ${addId}.`);
      const afterUndo = await membersOf(groupId!);
      const undoClean = assertNoRadiusDrift(add3.win, "addGroupMember/undo");
      const saidDrift = complainsOfDrift(add3.reply);
      console.log(`[cycle] add-undo: members=${afterUndo.length} noDrift=${undoClean} prose-drift=${saidDrift}`);
      expect.soft(
        afterUndo.length,
        `the undo did not put the group back — the organisation directory still lists ` +
          `${afterUndo.length} member(s).\n${add3.reply.slice(0, 900)}`,
      ).toBe(0);
      expect.soft(
        saidDrift,
        `the undo reported DRIFT on an object nothing else touched, which is the ledger comparing ` +
          `against the wrong snapshot:\n${add3.reply.slice(0, 700)}`,
      ).toBe(false);
      table.push({ step: "addGroupMember/undo", members: afterUndo.length, noDrift: undoClean });
    }

    /* ============================ 2. CREATE A POLICY, THEN UNDO IT ========= */
    await page.waitForTimeout(GAP_MS);
    // THE FIVE FIELDS ARE SUPPLIED because Atlassian's create endpoint rejects
    // anything short of type+name+status+rule+resources with a bare 400 that
    // names no field (measured: type+name 400, +status 400, +rule 400, all five
    // 202). Whether the TOOL asks for them when they are missing is a separate
    // claim and not this one's job.
    const pol1 = await turnQ(
      "policy-ask",
      `Create a data-residency policy named "${POLICY_NAME}", status enabled, rule {"in":["eu"]}, ` +
        `and no resources.`,
    );
    expect(await policyNamed(POLICY_NAME), `the PLAIN call CREATED the policy`).toBeFalsy();
    expect.soft(
      /disable|switch(ed)? off|not (be )?(deleted|removed)/i.test(pol1.reply),
      `the preview does not say the undo DISABLES rather than deletes. Atlassian documents no way ` +
        `to delete a policy, so "this can be undone" is a promise the ledger cannot keep:\n` +
        `${pol1.reply.slice(0, 900)}`,
    ).toBe(true);
    table.push({ step: "createPolicy/ask", changed: false });

    await page.waitForTimeout(GAP_MS);
    const pol2 = await turnQ("policy-yes", "Yes, create it.");
    const created = await policyNamed(POLICY_NAME);
    const polClean = assertNoRadiusDrift(pol2.win, "createPolicy/yes");
    const polId = undoIdIn(pol2.reply);
    console.log(
      `[cycle] policy: created=${Boolean(created)} id=${created?.id} status=${created?.attributes?.status} ` +
        `undoId=${polId} noDrift=${polClean}`,
    );
    expect.soft(Boolean(created), `one yes did not create the policy.\n${pol2.reply.slice(0, 900)}`).toBe(true);
    expect.soft(polId, `the created policy did not STATE its undo id.\n${pol2.reply.slice(0, 900)}`).toBeTruthy();
    table.push({
      step: "createPolicy/yes", id: created?.id, status: created?.attributes?.status,
      undoId: polId, noDrift: polClean,
    });

    if (polId && created?.id) {
      await page.waitForTimeout(GAP_MS);
      const pol3 = await turnQ("policy-undo", `Undo change ${polId}.`);
      const status = await policyStatus(String(created.id));
      const undoClean = assertNoRadiusDrift(pol3.win, "createPolicy/undo");
      const saidDrift = complainsOfDrift(pol3.reply);
      console.log(`[cycle] policy-undo: status=${status} noDrift=${undoClean} prose-drift=${saidDrift}`);
      expect.soft(
        status,
        `the undo did not disable the policy — Atlassian reports "${status}".\n${pol3.reply.slice(0, 900)}`,
      ).toBe("disabled");
      expect.soft(saidDrift, `the undo complained about drift on a row created minutes earlier`).toBe(false);
      table.push({ step: "createPolicy/undo", status, noDrift: undoClean });
    }

    /* ============================ 3. THE LOCKOUT GUARD ==================== */
    // The caller is put into the group by REST first, so the removal really
    // does include the person asking for it.
    await request("POST", `/rest/api/3/group/user?groupId=${encodeURIComponent(groupId!)}`, {
      body: { accountId: callerId },
    });
    let callerIn = false;
    const inBy = Date.now() + 60_000;
    for (;;) {
      callerIn = (await membersOf(groupId!)).includes(callerId);
      if (callerIn || Date.now() > inBy) break;
      await page.waitForTimeout(3_000);
    }
    expect(
      callerIn,
      `the caller is not in "${GROUP_NAME}" after 60s, so the lockout case would measure nothing`,
    ).toBe(true);

    await page.waitForTimeout(GAP_MS);
    const lock1 = await turnQ(
      "lockout-ask",
      `Remove my own account ${callerId} from the organisation group "${GROUP_NAME}".`,
    );
    expect(
      (await membersOf(groupId!)).includes(callerId),
      `the PLAIN call removed the caller. A removal must ask first.`,
    ).toBe(true);

    await page.waitForTimeout(GAP_MS);
    const lock2 = await turnQ("lockout-yes-1", "Yes, remove me.");
    const stillIn = (await membersOf(groupId!)).includes(callerId);
    // THE FIRST YES MUST BE REFUSED BY THE LOCKOUT GUARD — and NOT by a radius
    // mismatch. Those two refusals look identical to a user and mean opposite
    // things: one is the product protecting them, the other is the product
    // losing their consent.
    const lock2Clean = assertNoRadiusDrift(lock2.win, "lockout/yes-1");
    /**
     * ONLY THE PART THAT MUST BE IN WORDS.
     *
     * Three runs, three different phrasings, all correct: "AND IT INCLUDES
     * YOU", "because it's your own access", "This is genuinely your own access
     * being removed … nothing has been changed yet". A predicate that also
     * demanded a second clause failed the third on `has been` versus `has`,
     * which is a harness reading a model's prose too closely.
     *
     * The "and it asked again" half needs no prose at all — it is proven
     * STRUCTURALLY, and better: REST says the change did not happen on this
     * turn, and the next yes makes it happen. What cannot be proven any other
     * way is that the user was TOLD the set includes them, so that is the only
     * thing asserted here.
     */
    const toldItIsThem =
      /AND IT INCLUDES YOU/i.test(lock2.reply) ||
      /your own|includes you|you are (one of|in)|yourself|that is you\b/i.test(lock2.reply);
    console.log(`[cycle] lockout yes-1: stillIn=${stillIn} toldItIsThem=${toldItIsThem} noDrift=${lock2Clean}`);
    expect.soft(
      stillIn,
      `THE FIRST YES WENT THROUGH on a removal that includes the caller's own account.\n` +
        `${lock2.reply.slice(0, 900)}`,
    ).toBe(true);
    expect.soft(
      toldItIsThem,
      `the re-ticket does not tell the user the change includes THEIR OWN account, so they are ` +
        `asked a second time without being told what is different about the question. (That it ` +
        `asked again at all is proven by REST — nothing changed on this turn — and by the next ` +
        `yes landing.)\n${lock2.reply.slice(0, 900)}`,
    ).toBe(true);
    table.push({ step: "lockout/yes-1", refused: stillIn, toldItIsThem, noDrift: lock2Clean });

    if (stillIn) {
      await page.waitForTimeout(GAP_MS);
      const lock3 = await turnQ("lockout-yes-2", "Yes, I understand it includes me. Go ahead.");
      const removed = !(await membersOf(groupId!)).includes(callerId);
      callerRemovedFromGroup = removed;
      const lock3Clean = assertNoRadiusDrift(lock3.win, "lockout/yes-2");
      console.log(`[cycle] lockout yes-2: removed=${removed} noDrift=${lock3Clean}`);
      expect.soft(
        removed,
        `THE SECOND YES DID NOT GO THROUGH. A gate nobody can pass is broken, not safe — and on ` +
          `13.7.0 the cause was the radius, not the guard: the turn that raised the warning sent ` +
          `\`accountIds\` and the turn that redeemed it did not.\n${lock3.reply.slice(0, 900)}`,
      ).toBe(true);
      table.push({ step: "lockout/yes-2", applied: removed, noDrift: lock3Clean });

      // RESTORE IMMEDIATELY. This is the caller's own access and it is not left
      // to `finally` — the group is deleted there, which would hide a failure
      // to put it back rather than report one.
      if (removed) {
        await request("POST", `/rest/api/3/group/user?groupId=${encodeURIComponent(groupId!)}`, {
          body: { accountId: callerId },
        });
        // ⚠️ POLL. The write goes to JIRA and the oracle reads the ORGANISATION
        // directory, and the two do not agree instantly: measured 13.8.0, the
        // add landed and a read taken in the same breath said the caller was
        // still out. The earlier precondition in this test only passed because
        // it happened to sit behind a 5-second wait. A restore that reports
        // failure because it asked too early is worse than no check — it sends
        // somebody looking for lost access that was never lost.
        let back = false;
        const deadline = Date.now() + 60_000;
        for (;;) {
          back = (await membersOf(groupId!)).includes(callerId);
          if (back || Date.now() > deadline) break;
          await page.waitForTimeout(3_000);
        }
        console.log(`[restore] caller put back into "${GROUP_NAME}" by REST: ${back}`);
        expect(
          back,
          `the caller's own group membership was NOT restored after 60s of polling. The group is ` +
            `a throwaway this spec created and \`finally\` deletes it, so no real access is at ` +
            `stake — but a restore that cannot be confirmed must be reported, not assumed.`,
        ).toBe(true);
        callerRemovedFromGroup = false;
      }
    }

    /* ============================ 4. ONE ROLE GRANT ====================== */
    if (!roleSubject) {
      console.log(
        `[cycle] assignOrgRole SKIPPED: this organisation has no throwaway account — an ` +
          `obviously-disposable address that is not an active member and holds no roles. Every ` +
          `other account belongs to a real person, and granting one of them an organisation role ` +
          `to measure a tool is not a trade this harness makes. The role VALUE is settled ` +
          `separately: the directory reports platform roles as "${ROLE}"-shaped, namespaced.`,
      );
      findings.push("assignOrgRole: SKIPPED — no throwaway account on this organisation");
      table.push({ step: "assignOrgRole", skipped: true });
    } else {
      const rolesBefore = await rolesOf(roleSubject);
      await page.waitForTimeout(GAP_MS);
      const role1 = await turnQ(
        "role-ask",
        `Give the account ${roleSubject} the organisation role ${ROLE}.`,
      );
      expect(
        (await rolesOf(roleSubject)).length,
        `the PLAIN call GRANTED the role. A first call must ask.`,
      ).toBe(rolesBefore.length);

      await page.waitForTimeout(GAP_MS);
      const role2 = await turnQ("role-yes", "Yes, assign it.");
      const rolesAfter = await rolesOf(roleSubject);
      roleGranted = rolesAfter.length > rolesBefore.length;
      const roleClean = assertNoRadiusDrift(role2.win, "assignOrgRole/yes");
      const roleErr = role2.win.filter((l: any) => /^\[OrgAdmin\] HTTP/.test(l.text));
      console.log(
        `[cycle] role: before=[${rolesBefore.join(", ")}] after=[${rolesAfter.join(", ")}] ` +
          `granted=${roleGranted} noDrift=${roleClean} errors=${roleErr.map((l: any) => l.text).join(" | ") || "(none)"}`,
      );
      // A REJECTED WRITE IS A RESULT, NOT A FAILURE. What this settles is the
      // VALUE: whether the namespaced role string is what the assign endpoint
      // wants. Either answer is worth the turn; what must not happen is the
      // user's yes being lost to a radius mismatch.
      findings.push(
        `assignOrgRole ${ROLE} on ${roleSubject}: granted=${roleGranted}; ` +
          `errors=${roleErr.map((l: any) => l.text.slice(0, 140)).join(" | ") || "none"}; ` +
          `roles ${rolesBefore.length} -> ${rolesAfter.length}`,
      );
      table.push({ step: "assignOrgRole/yes", granted: roleGranted, noDrift: roleClean, errors: roleErr.length });
    }

    /* ============================ 5. THE LEDGER READS IT BACK ============= */
    await page.waitForTimeout(GAP_MS);
    const led = await turnQ(
      "ledger",
      "List the recent changes made with the stored credentials, with their ids and states.",
    );
    const withheld = led.win.filter((l: any) => /^\[Tools\] listRecentChanges\b.*is withheld/.test(l.text));
    expect.soft(
      withheld.map((l: any) => l.text),
      `listRecentChanges was WITHHELD although allowOrgAdmin is open. Both credential gates add ` +
        `the admin-ledger group; if the withdrawal side stops honouring that again, the ledger ` +
        `reader is unreachable on every single-credential installation.`,
    ).toEqual([]);
    for (const [what, id] of [["the add", addId], ["the policy", polId]] as const) {
      if (id) {
        expect.soft(
          led.reply.includes(id),
          `the ledger listing does not carry ${what}'s undo id (${id}) from minutes earlier:\n` +
            `${led.reply.slice(0, 1200)}`,
        ).toBe(true);
      }
    }
    // NO BODIES. A `before` is a policy or a group — other people's addresses
    // and access rules — and it must never reach a model.
    const leaked = people
      .map((u: any) => String(u.email || ""))
      .filter((e: string) => e && led.reply.includes(e));
    expect.soft(leaked, `the ledger listing carried ${leaked.length} directory email address(es)`).toEqual([]);
    table.push({ step: "listRecentChanges", withheld: withheld.length > 0 });
  } finally {
    console.table(table);
    console.log(`[cycle] FINDINGS:\n- ${findings.join("\n- ") || "(none)"}`);

    // ---- RESTORE, loudest first -----------------------------------------
    if (callerRemovedFromGroup && groupId) {
      try {
        await request("POST", `/rest/api/3/group/user?groupId=${encodeURIComponent(groupId)}`, {
          body: { accountId: callerId },
        });
        console.log("[restore] caller's group membership put back");
      } catch (e) {
        console.warn(`[restore] COULD NOT put the caller back: ${(e as Error)?.message}`);
      }
    }
    if (roleGranted && roleSubject) {
      const r = await org(`/v1/orgs/{org}/users/${roleSubject}/roles/revoke`, {
        method: "POST", body: { role: ROLE },
      }).catch(() => ({ status: 0, body: null }));
      const left = await rolesOf(roleSubject).catch(() => ["(unreadable)"]);
      console.log(`[restore] revoked ${ROLE} from ${roleSubject}: HTTP ${r.status}; roles now [${left.join(", ")}]`);
      if (left.includes(ROLE)) {
        console.warn(
          `[restore] ${ROLE} IS STILL ON ${roleSubject}. Revoke it by hand: ` +
            `POST /admin/v1/orgs/{org}/users/${roleSubject}/roles/revoke {"role":"${ROLE}"}`,
        );
      }
    }
    try {
      if (groupId) {
        await request("DELETE", `/rest/api/3/group?groupId=${encodeURIComponent(groupId)}`);
        console.log(`[restore] group "${GROUP_NAME}" deleted`);
      }
    } catch (e) {
      console.warn(`[restore] the group "${GROUP_NAME}" is STILL THERE: ${(e as Error)?.message}`);
    }
    // The policy is left DISABLED and named `[harness-test]`: Atlassian
    // documents no DELETE for one, which is the app's own refusal, so a
    // switched-off row is the cleanest end state that exists.
    try {
      const left = await policyNamed(POLICY_NAME);
      if (left) console.log(`[restore] policy "${POLICY_NAME}" left as status=${left.attributes?.status} (no DELETE exists)`);
    } catch { /* the credential matters more */ }
    try {
      if (frame) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
      await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
      const r = await resolveAdminRoot(page);
      await adminTab(r, "Settings").click();
      await removeCredentialViaCard(r, ORG);
    } catch (e) {
      console.warn(
        `[restore] COULD NOT VERIFY the organisation key was removed (${(e as Error)?.message}). ` +
          `Take it off by hand — it is authority over every product and every site.`,
      );
    }
  }
});

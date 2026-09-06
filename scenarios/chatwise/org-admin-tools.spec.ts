// LIVE: THE ORGANISATION GROUP — the part of Atlassian no Forge scope reaches.
//
// READS ONLY IN THIS FILE'S FIRST TEST. Everything the org key can change goes
// through every product and every site at once, so the write cases live below
// as `test.skip`ped bodies with the reason written into the skip: the eleven
// breaker findings in the write path (ticket-hashes-the-radius, drift-vs-
// `before`, the lockout flag the schema never declared, `archiveProject` with
// no ticket, retry-on-any-method, the unbounded body read) land as 13.6.0 and
// the writes run against THAT build, not this one. Running them here would
// measure code that is about to be replaced and would leave real organisation
// state behind to prove it.
//
// THE ORACLE IS A SECOND, INDEPENDENT READ. Every claim below is checked
// against a direct `api.atlassian.com` call this spec makes with the same org
// key — never against the reply reading plausibly. That is the whole reason
// this file exists: an org read that answers "the organisation has no users" is
// indistinguishable, in prose, from an organisation with no users.
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

const T = getTarget("chatwise-admin");
const CHAT = getTarget("chatwise-global");
const GAP_MS = Number(process.env.CHATWISE_TURN_GAP_MS || 240_000);
const QUOTA_WAIT_MS = Number(process.env.CHATWISE_QUOTA_WAIT_MS || 960_000);

/** The reason every write case below carries, so it is one string and not six. */
const WRITES_WAIT = "13.6.0 not deployed — the org write path is being rebuilt from the breaker's eleven findings";

/**
 * A direct org read, used ONLY as ground truth.
 *
 * It goes to `api.atlassian.com` with the same key the app was given, so a
 * disagreement between this and the tool is the APP's, never the key's. The key
 * is read at call time and never logged, never returned, never put in a failure
 * message.
 */
async function org(pathSuffix: string): Promise<{ status: number; body: any }> {
  const key = fs.readFileSync(path.join(SECRETS_DIR, ".org_key"), "utf8").trim();
  const orgId = fs.readFileSync(path.join(SECRETS_DIR, ".org_id"), "utf8").trim();
  const res = await fetch(`https://api.atlassian.com/admin${pathSuffix.replace("{org}", orgId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
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

test("the organisation reads return what the organisation actually contains", async ({ page }) => {
  test.setTimeout(14_400_000);
  test.skip(!T.envId || !CHAT.envId, "env ids unresolved — run `npm run discover`.");
  test.skip(
    !hasSecret(".org_key") || !hasSecret(".org_id"),
    "no .org_key/.org_id in the secrets dir — this spec stores a REAL organisation key or does nothing",
  );

  const copy: any = await loadCredentialCopy();
  const ORG = copy.ORG_KEY_CARD;
  const stamp = Date.now();
  const conversationId = `conv_org_reads_${stamp}`;
  let root: any = null;
  let frame: any = null;
  const findings: string[] = [];

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
        describeLogs(win.filter((l: any) => /^\[Tools\]|^\[Consumer\] toolset|^\[Org/.test(l.text))),
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
  /** Executed, not merely reached for — `executor.js` prints both on one prefix. */
  const called = (win: any[], tool: string) =>
    win.filter(
      (l: any) =>
        new RegExp(`^\\[Tools\\] ${tool}\\b`).test(l.text) && !/is withheld this turn/.test(l.text),
    );

  try {
    // ---- GROUND TRUTH FIRST, so the asks are checked and not just read ------
    const overview = await org("/v1/orgs/{org}");
    expect(overview.status, "the stored org key cannot read its own organisation").toBe(200);
    const orgName = overview.body?.data?.attributes?.name || "";
    const dirs = await org("/v2/orgs/{org}/directories");
    const directoryId = dirs.body?.data?.[0]?.directoryId;
    const dirUsers = await org(`/v2/orgs/{org}/directories/${directoryId}/users?limit=50`);
    const realUsers = (dirUsers.body?.data || []) as any[];
    const dirGroups = await org(`/v2/orgs/{org}/directories/${directoryId}/groups?limit=50`);
    const realGroups = (dirGroups.body?.data || []) as any[];
    const v1Users = await org("/v1/orgs/{org}/users?limit=50");
    const v1UserCount = (v1Users.body?.data || []).length;
    const policies = await org("/v1/orgs/{org}/policies");
    const realPolicies = (policies.body?.data || []) as any[];
    const events = await org("/v1/orgs/{org}/events?limit=50");
    const realEvents = (events.body?.data || []) as any[];
    console.log(
      `[truth] org="${orgName}" directory=${directoryId} ` +
        `users(directory)=${realUsers.length} users(/v1/orgs/{o}/users)=${v1UserCount} ` +
        `groups=${realGroups.length} policies=${realPolicies.length} events=${realEvents.length}`,
    );
    // The two user endpoints DISAGREE on this organisation, and which one the
    // app uses decides whether it can answer "who has an account" at all.
    if (v1UserCount === 0 && realUsers.length > 0) {
      findings.push(
        `/admin/v1/orgs/{o}/users answers 200 with an EMPTY data array while the directory holds ` +
          `${realUsers.length} people. Any tool reading the first path reports an organisation ` +
          `with no users, which is a different fact from the one it measured.`,
      );
    }

    // ---- STORE THE KEY THROUGH THE CARD ------------------------------------
    await assertLoggedIn(page);
    root = await openAdminSettings(page, T.deepLink(T.envId)!);
    await skipUntilCardsPresent(root, [ORG.heading]);
    test.skip(
      (await cardState(root, ORG)) === "configured",
      `an organisation key is ALREADY stored on this install. It cannot be read back, so this ` +
        `spec would destroy somebody else's credential to run. Refusing.`,
    );
    await storeCredentialViaCard(root, ORG, {
      orgId: secret(".org_id"),
      key: secret(".org_key"),
    });
    expect(await cardState(root, ORG), "the card does not show the key as stored").toBe("configured");

    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId, title: "[harness-test] org reads", personaId: "jira-org-admin",
    });

    // ---- 1. OVERVIEW + USERS ----------------------------------------------
    const t1 = await turnQ(
      "org-overview-users",
      "Which Atlassian organisation does the stored admin key address, and what is it called? " +
        "Then list the people who have an account in this organisation and say how many there are.",
    );
    skipIfQuotaBlocked(t1.reply, "org-admin-tools/overview");

    const line = t1.win.find((l: any) => /^\[Consumer\] toolset:/.test(l.text))?.text || "";
    console.log(`[org] toolset line: ${line}`);
    expect(
      line,
      `allowOrgAdmin did not open after the key was stored through the card:\n${line}`,
    ).toMatch(/allowOrgAdmin=true/);

    expect(
      called(t1.win, "getOrgOverview").length,
      `getOrgOverview was not called for a question that asks which organisation this is:\n` +
        describeLogs(t1.win.filter((l: any) => /^\[Tools\]/.test(l.text))),
    ).toBeGreaterThan(0);
    expect(
      t1.reply,
      `the reply does not name the organisation. REST says it is "${orgName}".`,
    ).toContain(orgName);

    expect(
      called(t1.win, "listOrgUsers").length,
      `listOrgUsers was not called for "list the people who have an account":\n` +
        describeLogs(t1.win.filter((l: any) => /^\[Tools\]/.test(l.text))),
    ).toBeGreaterThan(0);
    // THE ASSERTION THAT MATTERS. The organisation has people in it; a reply
    // that reports none has told the administrator something false about the
    // thing they are about to act on.
    const namesInReply = realUsers.filter((u: any) =>
      u.name && t1.reply.includes(String(u.name)),
    ).length;
    console.log(
      `[org] reply names ${namesInReply} of the ${realUsers.length} people the directory holds`,
    );
    expect(
      /\bno users\b|\b0 users\b|no accounts|empty|none/i.test(t1.reply) && namesInReply === 0,
      `the reply says the organisation has NO users while its directory holds ${realUsers.length} ` +
        `people. An empty list is not an answer here — it is a different endpoint's silence ` +
        `reported as a fact:\n${t1.reply.slice(0, 1200)}`,
    ).toBe(false);
    expect(
      namesInReply,
      `the reply names NONE of the ${realUsers.length} people in this organisation's directory. ` +
        `Ground truth (first three): ${realUsers.slice(0, 3).map((u: any) => u.name).join(", ")}\n` +
        `${t1.reply.slice(0, 1200)}`,
    ).toBeGreaterThan(0);

    // ---- 2. GROUPS + MEMBERS ----------------------------------------------
    await page.waitForTimeout(GAP_MS);
    // A group the directory really has, chosen from ground truth so the ask
    // cannot be answered from a guess.
    const probeGroup = realGroups.find((g: any) => g.name === "site-admins") || realGroups[0];
    const t2 = await turnQ(
      "org-groups-members",
      `List this organisation's groups and say which of them are managed by an identity ` +
        `provider. Then list who is in the group "${probeGroup?.name}".`,
    );
    if (!QUOTA_BUBBLE.test(t2.reply)) {
      expect(
        called(t2.win, "listOrgGroups").length,
        `listOrgGroups was not called:\n` +
          describeLogs(t2.win.filter((l: any) => /^\[Tools\]/.test(l.text))),
      ).toBeGreaterThan(0);
      const groupsNamed = realGroups.filter((g: any) => t2.reply.includes(String(g.name))).length;
      console.log(`[org] reply names ${groupsNamed} of ${realGroups.length} real groups`);
      expect(
        groupsNamed,
        `the reply names none of this organisation's ${realGroups.length} real groups. Ground ` +
          `truth (first three): ${realGroups.slice(0, 3).map((g: any) => g.name).join(", ")}`,
      ).toBeGreaterThan(0);

      // MEMBERSHIP, against the read that actually answers on this API: the
      // directory's user list FILTERED BY GROUP. Four other membership paths
      // 404 here, which is why the app moved to this one.
      const memberTruth = await org(
        `/v2/orgs/{org}/directories/${directoryId}/users?groupId=${encodeURIComponent(probeGroup?.id)}&limit=50`,
      );
      const realMembers = (memberTruth.body?.data || []) as any[];
      console.log(
        `[truth] "${probeGroup?.name}" has ${realMembers.length} member(s): ` +
          realMembers.map((m: any) => m.name).join(", "),
      );
      const membersCalled = called(t2.win, "getOrgGroupMembers").length;
      if (!membersCalled) {
        findings.push(`getOrgGroupMembers was not called for an explicit "who is in group X"`);
      }
      if (realMembers.length > 0) {
        const named = realMembers.filter((m: any) => m.name && t2.reply.includes(String(m.name))).length;
        console.log(`[org] reply names ${named} of ${realMembers.length} real members`);
        expect(
          named,
          `the reply names NONE of the ${realMembers.length} real members of "${probeGroup?.name}": ` +
            `${realMembers.map((m: any) => m.name).join(", ")}\n${t2.reply.slice(0, 1000)}`,
        ).toBeGreaterThan(0);
      }
    }

    // ---- 3. POLICIES + AUDIT ----------------------------------------------
    await page.waitForTimeout(GAP_MS);
    const t3 = await turnQ(
      "org-policies-audit",
      "How many policies does this organisation have, and of which kinds? Are there any " +
        "authentication policies — and if you could not read them, say so rather than saying " +
        "there are none. Then show me the most recent entries in the organisation audit log.",
    );
    if (!QUOTA_BUBBLE.test(t3.reply)) {
      expect(
        called(t3.win, "listOrgPolicies").length,
        `listOrgPolicies was not called:\n` +
          describeLogs(t3.win.filter((l: any) => /^\[Tools\]/.test(l.text))),
      ).toBeGreaterThan(0);
      // 24 on this organisation. The number is read from REST in this run, not
      // pinned, so the assertion survives somebody adding a policy.
      expect(
        t3.reply,
        `the reply does not carry the real policy count (${realPolicies.length}) that REST ` +
          `returns:\n${t3.reply.slice(0, 1200)}`,
      ).toContain(String(realPolicies.length));
      const kinds = [...new Set(realPolicies.map((p: any) => p.attributes?.type))];
      const kindsNamed = kinds.filter((k) => k && t3.reply.includes(String(k))).length;
      console.log(`[org] reply names ${kindsNamed} of ${kinds.length} policy kinds: ${kinds.join(", ")}`);
      expect(kindsNamed, `the reply names no policy kind at all`).toBeGreaterThan(0);

      // AUTH POLICIES. On this organisation `?type=authentication-policy`
      // answers 200 with an empty array and `/auth-policies` 404s. The rule the
      // handler states is that a REFUSAL must never be reported as "none";
      // an empty 200 legitimately may be. This records which happened.
      const authTruth = await org("/v1/orgs/{org}/policies?type=authentication-policy");
      console.log(
        `[truth] auth policies: status=${authTruth.status} count=${(authTruth.body?.data || []).length}`,
      );
      findings.push(
        `auth policies: REST ?type=authentication-policy -> ${authTruth.status} with ` +
          `${(authTruth.body?.data || []).length} rows; the reply said: ` +
          `"${(t3.reply.match(/[^.]*authenticat[^.]*\./i) || ["(nothing about authentication)"])[0].trim()}"`,
      );

      expect(
        called(t3.win, "getOrgAuditEvents").length,
        `getOrgAuditEvents was not called for "the most recent entries in the organisation audit ` +
          `log":\n` + describeLogs(t3.win.filter((l: any) => /^\[Tools\]/.test(l.text))),
      ).toBeGreaterThan(0);
      const actions = [...new Set(realEvents.map((e: any) => e.attributes?.action))].filter(Boolean);
      const actionsNamed = actions.filter((a) => t3.reply.includes(String(a))).length;
      console.log(`[org] reply names ${actionsNamed} of ${actions.length} real audit actions`);
      if (!actionsNamed) {
        findings.push(
          `the audit answer names none of the real actions (${actions.slice(0, 4).join(", ")})`,
        );
      }
    }
  } finally {
    console.log(`[org] FINDINGS:\n- ${findings.join("\n- ") || "(none)"}`);
    try {
      if (frame) {
        await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
      }
      await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
      const r = await resolveAdminRoot(page);
      await adminTab(r, "Settings").click();
      await removeCredentialViaCard(r, ORG);
    } catch (e) {
      console.warn(
        `[restore] COULD NOT VERIFY the organisation key was removed (${(e as Error)?.message}). ` +
          `Remove it by hand on the ChatWise settings page — a stored organisation admin key is ` +
          `authority over every product and every site under this organisation.`,
      );
    }
  }
});

/**
 * THE LEDGER'S READER — and what it is NOT.
 *
 * The 30-day undo promise is made on the organisation card. `listReverts` and
 * `describeRevert` had no caller at all until `listCredentialChanges` and the
 * "Recent changes made with stored credentials" card were added; there is NO
 * `listRecentChanges` TOOL on the chat surface, so "what did you change
 * yesterday" has no conversational path and the reader is an admin-page card
 * only. That is worth knowing before the write cases run: the undo route an
 * administrator is told to use ("Ask the Organisation Administrator assistant:
 * undo change {id}") needs an id that is only visible on the settings page.
 */
test("the credential change ledger has a reader, and it is a settings card and not a tool", async ({
  page,
}) => {
  test.setTimeout(600_000);
  test.skip(!T.envId, "env ids unresolved — run `npm run discover`.");
  const copy: any = await loadCredentialCopy();
  const CHANGES = copy.CHANGES_CARD;
  expect(CHANGES?.heading, "credentialCopy.js exports no changes card").toBeTruthy();

  await assertLoggedIn(page);
  const root = await openAdminSettings(page, T.deepLink(T.envId)!);
  await skipUntilCardsPresent(root, [copy.ORG_KEY_CARD.heading]);

  await expect(
    root.getByText(CHANGES.heading, { exact: true }).first(),
    `the ledger card "${CHANGES.heading}" is not on the Settings tab, so the 30-day undo promise ` +
      `on the organisation card points at a store with no way to open it`,
  ).toBeVisible({ timeout: 30_000 });

  // No credential has written anything on this install, so the EMPTY STATE is
  // what must render — and it must say so in words, not as a blank area that
  // looks like a failed load.
  const body = await page.evaluate(() => document.body.innerText);
  const empty = body.includes(CHANGES.empty);
  console.log(`[ledger] empty-state sentence rendered = ${empty}`);
  expect(
    empty || CHANGES.columns.every((c: string) => body.includes(c)),
    `the ledger card shows neither its empty-state sentence ("${CHANGES.empty}") nor its column ` +
      `headings. A blank card is indistinguishable from one that failed to load.`,
  ).toBe(true);

  console.log(
    `[ledger] the undo instruction an administrator is given is: "${CHANGES.howToUndo}" — the id ` +
      `it needs is visible ONLY on this card, because no chat tool lists recent changes.`,
  );
});

/* ========================================================================== *
 * THE WRITE CASES. WRITTEN, NOT RUN.
 *
 * Each one is a real organisation change and each is skipped with the same
 * reason until the rebuilt write path is deployed. They are written now, and
 * committed now, so that the deploy is followed by a run rather than by a
 * design session — and so the shape of what will be asserted is reviewable
 * while the surgeon is still holding the code.
 * ========================================================================== */

test("create a data-residency policy, undo it by revertId, and prove it disabled by REST", async () => {
  test.skip(true, WRITES_WAIT);
  // ASK 1  : create a policy named `[harness-test] policy <ts>`, type
  //          data-residency, with NO resources — the smallest real policy this
  //          organisation accepts, and the only kind that round-trips (12 of
  //          24 here are data-residency; other kinds refuse the update).
  // EXPECT : a ticket, NOT a change. The plain call reads and asks.
  // ASK 2  : one yes. EXPECT a `revertId` in the result.
  // ⚠️ BREAKER #6: the row's target is the literal string "new policy", so the
  //    inverse can never address the created policy. Assert the revertId
  //    resolves to the REAL id, and that the preview says the undo DISABLES
  //    rather than deletes.
  // ASK 3  : "undo change <revertId>".
  // ORACLE : GET /admin/v1/orgs/{o}/policies/{id} -> status disabled.
  // RESTORE: if the undo did not land, delete the policy directly with the key.
});

test("adding a member to a non-IdP group is one yes, is recorded, and undoes", async () => {
  test.skip(true, WRITES_WAIT);
  // TARGET : a throwaway, EMPTY, non-IdP group. `managedBy`/`externalSynced`
  //          come back on the v2 directory groups read, and the write side
  //          refuses an externally managed one — so the group is chosen from
  //          ground truth, never named in the spec.
  // ⚠️ BREAKER #2: `after` is not recorded and drift is diffed against
  //    `before`, so the FIRST undo after any successful change refuses forever
  //    ("changed since ChatWise touched it"). That is the assertion: the undo
  //    must land, not refuse.
  // ORACLE : the directory's user list filtered by groupId, before and after.
});

test("the lockout guard refuses the first yes when the caller is in the affected set", async () => {
  test.skip(true, WRITES_WAIT);
  // ASK    : remove the harness account's own organisation role / its own
  //          membership of an admin group.
  // EXPECT : the first yes REFUSED, with "AND IT INCLUDES YOU" and a SECOND
  //          ticket. ⚠️ BREAKER #3: on 13.5.0 `acknowledgeLockout: true` sent
  //          on the FIRST call skips the re-ticket entirely — the guard is a
  //          sentence in a schema rather than code. The 13.6.0 assertion is
  //          that the acknowledgement is APP state: a first call carrying the
  //          flag is ignored.
  // THEN   : the second yes proceeds. RESTORE the role/membership immediately
  //          and verify by REST — this is the caller's own access.
});

test("deletePolicy refuses by name, and the invite ticket appears without a second yes", async () => {
  test.skip(true, WRITES_WAIT);
  // deletePolicy / publishDraftPolicies / revokeApiToken have NO Atlassian API:
  // the tool must say WHERE they are done instead, naming the operation.
  // inviteUser `harness-test-<ts>@example.invalid`: the DESTRUCTIVE ticket must
  // appear — and this spec STOPS THERE. A real invitation is irreversible: the
  // account exists in the organisation afterwards and "delete user" is a
  // different, worse change than the one being tested.
});

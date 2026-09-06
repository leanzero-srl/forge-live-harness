// LIVE: THE SITE-TOKEN GROUP — the four tools that act as a stored human.
//
// This is the only group in ChatWise where a request is made as SOMEBODY ELSE.
// The card promises four things (screens, screen schemes, issue security
// schemes, archiving a project) and says, in as many words, that Jira's audit
// log will carry the token owner's name rather than the asker's. So the claims
// worth measuring are, in order:
//
//   1. storing the token OPENS the gate — `allowSiteToken=true` on the very
//      next turn, read off the consumer's own line, not inferred from prose;
//   2. the two READ tools return REAL data, checked against a REST read of the
//      same objects made by this harness;
//   3. the reply SAYS whose authority it ran under, because "I read the screen
//      scheme" and "the stored administrator read it" are different statements
//      and only the second is true;
//   4. `archiveProject` is offered — and this spec records, without ever
//      confirming an archive, whether a plain call asks first;
//   5. removing the token CLOSES the gate again, and the refusal names the card
//      an administrator has to go and find.
//
// ⚠️ NOTHING IS EVER ARCHIVED. The archive probe names a project key that does
// not exist on this site (asserted by REST before the turn) and the spec
// re-reads WFH afterwards to prove it is still live. Archiving WFH would take
// the project every other ChatWise spec seeds into out of every board and
// search, which is a harness that breaks its own tenant to measure a gate.
import { test, expect } from "../../fixtures/forge";
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

/** See admin-persona-gates: one admin turn can exhaust the Sonnet window. */
const GAP_MS = Number(process.env.CHATWISE_TURN_GAP_MS || 240_000);
const QUOTA_WAIT_MS = Number(process.env.CHATWISE_QUOTA_WAIT_MS || 960_000);

/**
 * A project key that CANNOT resolve, used for the archive probe.
 *
 * Shaped like a key (`ID_SHAPES.projectKey` in the app requires a leading
 * letter) so the app's own path builder accepts it and the call really reaches
 * Jira, and asserted absent by REST before the turn runs. If somebody ever
 * creates it, the pre-flight fails loudly rather than the spec quietly
 * archiving a real project.
 */
const GHOST_KEY = "ZZHARNESSNOPE";

test.describe.configure({ timeout: 14_400_000 });

test("the site token opens four tools, they run as the stored administrator, and removing it closes them", async ({
  page,
}) => {
  test.setTimeout(14_400_000);
  test.skip(!T.envId || !CHAT.envId, "env ids unresolved — run `npm run discover`.");
  test.skip(
    !hasSecret(".site_token") || !hasSecret(".site_email"),
    "no .site_token/.site_email in the secrets dir — this spec stores a REAL credential or does nothing",
  );

  const copy: any = await loadCredentialCopy();
  const SITE = copy.SITE_TOKEN_CARD;
  const stamp = Date.now();
  const conversationId = `conv_site_token_${stamp}`;
  let root: any = null;
  let frame: any = null;
  const findings: string[] = [];

  /** One global-page turn, with its log window. Quota is retried once. */
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
      `\n######## ${label}\nASK: ${message}\nBUBBLE:\n${reply.slice(0, 1400)}\nLOG:\n` +
        describeLogs(win.filter((l: any) => /^\[Tools\]|^\[Consumer\] toolset|^\[SiteToken\]/.test(l.text))),
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
  const toolset = (win: any[]) =>
    win.find((l: any) => /^\[Consumer\] toolset:/.test(l.text))?.text || "";
  const called = (win: any[], tool: string) =>
    win.filter((l: any) => new RegExp(`^\\[Tools\\] ${tool}\\b`).test(l.text));

  try {
    // ---- PRE-FLIGHT: REST ground truth, and the ghost key really is a ghost --
    const proj: any = await request("GET", `/rest/api/3/project/${PROJECT}`);
    const projectId = String(proj.id);
    expect(proj.archived === true, `${PROJECT} is ALREADY archived — restore it before testing`).toBe(false);
    const itss: any = await request(
      "GET", `/rest/api/3/issuetypescreenscheme/project?projectId=${projectId}`,
    );
    const screenSchemeName = itss?.values?.[0]?.issueTypeScreenScheme?.name || "";
    expect(screenSchemeName, `no issue-type screen scheme on ${PROJECT} to compare against`).toBeTruthy();
    console.log(`[truth] ${PROJECT} id=${projectId} issue-type screen scheme = "${screenSchemeName}"`);

    let ghostExists = true;
    try {
      await request("GET", `/rest/api/3/project/${GHOST_KEY}`);
    } catch {
      ghostExists = false;
    }
    expect(
      ghostExists,
      `${GHOST_KEY} EXISTS on this site. The archive probe would archive a real project — ` +
        `change GHOST_KEY before running this again.`,
    ).toBe(false);

    // ---- STORE THE TOKEN THROUGH THE CARD ----------------------------------
    await assertLoggedIn(page);
    root = await openAdminSettings(page, T.deepLink(T.envId)!);
    await skipUntilCardsPresent(root, [SITE.heading]);
    test.skip(
      (await cardState(root, SITE)) === "configured",
      `a site token is ALREADY stored on this install. It cannot be read back, so this spec ` +
        `would destroy somebody else's credential to run. Refusing.`,
    );
    await storeCredentialViaCard(root, SITE, {
      email: secret(".site_email"),
      token: secret(".site_token"),
    });
    expect(await cardState(root, SITE), "the card does not show the token as stored").toBe("configured");

    // ---- 1. THE GATE OPENS, AND THE READS RETURN REAL DATA ------------------
    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId, title: "[harness-test] site token", personaId: "jira-admin",
    });

    const reads = await turnQ(
      "site-token-reads",
      `Using the stored site admin token: what is the screen configuration of project ${PROJECT} ` +
        `(its issue type screen scheme and the screens behind it), and what issue security scheme ` +
        `does ${PROJECT} use? Name the schemes exactly as Jira returns them.`,
    );
    skipIfQuotaBlocked(reads.reply, "site-token-tools/reads");

    const line = toolset(reads.win);
    console.log(`[site-token] toolset line: ${line}`);
    expect(line, "no [Consumer] toolset: line for the site-token turn").not.toBe("");
    expect(
      line,
      `allowSiteToken did not open after the token was stored through the card. The gate is ` +
        `policy ∧ site-admin ∧ persona ∧ a stored credential, and three of those were already ` +
        `true, so this is the credential half:\n${line}`,
    ).toMatch(/allowSiteToken=true/);

    const screenCalls = called(reads.win, "getScreenConfiguration");
    const securityCalls = called(reads.win, "getIssueSecurityScheme");
    expect(
      screenCalls.length + securityCalls.length,
      `NEITHER site-token read was called although the gate was open. The model was asked for ` +
        `exactly the two things the card says the token buys:\n` +
        describeLogs(reads.win.filter((l: any) => /^\[Tools\]/.test(l.text))),
    ).toBeGreaterThan(0);

    // THE STATUSES, from the app's own failure line. A 400 here is a FINDING to
    // report with its body, not a reason to stop measuring the rest.
    for (const [tool, calls] of [
      ["getScreenConfiguration", screenCalls],
      ["getIssueSecurityScheme", securityCalls],
    ] as const) {
      const failed = reads.win.filter((l: any) =>
        new RegExp(`^\\[Tools\\] .*${tool}.*failed:`).test(l.text) ||
        new RegExp(`^\\[SiteToken\\].*${tool}`).test(l.text));
      console.log(
        `[site-token] ${tool}: called=${calls.length}` +
          (failed.length ? ` FAILED -> ${failed[0].text.slice(0, 240)}` : ""),
      );
      if (failed.length) findings.push(`${tool}: ${failed[0].text.slice(0, 300)}`);
    }

    // ---- 2. THE ANSWER CARRIES JIRA'S OWN NAMES ----------------------------
    // The oracle is the REST read above, not a plausible-looking scheme name.
    const namedTruth = reads.reply.includes(screenSchemeName);
    console.log(`[site-token] reply names the real screen scheme "${screenSchemeName}": ${namedTruth}`);
    if (!namedTruth) {
      findings.push(
        `the reply does NOT name "${screenSchemeName}", which is what REST returns for ` +
          `${PROJECT}'s issue-type screen scheme`,
      );
    }

    // ---- 3. THE REPLY SAYS WHOSE AUTHORITY IT USED -------------------------
    // Every site-token description and every result opens with the same
    // sentence; the model has to pass it on, because the audit log will carry
    // the token owner's name and not the asker's.
    const saysAuthority =
      /stored (site )?admin(istrator)?|token owner|administrator who stored|as the administrator/i
        .test(reads.reply);
    console.log(`[site-token] reply attributes the authority: ${saysAuthority}`);
    expect(
      saysAuthority,
      `the reply never says the reads ran as the STORED ADMINISTRATOR. The card promises the ` +
        `audit log will carry that person's name; a reply that says "I read it" leaves the ` +
        `asker believing it ran as them:\n${reads.reply.slice(0, 1200)}`,
    ).toBe(true);

    // ---- 4. THE ARCHIVE PROBE — offered, and does it ask first? -------------
    await page.waitForTimeout(GAP_MS);
    const arch = await turnQ(
      "site-token-archive",
      `Archive the project ${GHOST_KEY}. Use exactly that key and no other project — if it does ` +
        `not exist, say so and stop. Do not archive ${PROJECT} or anything else under any ` +
        `circumstances.`,
    );
    if (!QUOTA_BUBBLE.test(arch.reply)) {
      const archCalls = called(arch.win, "archiveProject");
      const offered =
        archCalls.length > 0 ||
        /archiveProject|archive the project|archiving/i.test(arch.reply);
      expect(
        offered,
        `archiveProject is not reachable at all with a token stored, although the card lists ` +
          `"archiving a project" as one of the four things the token buys:\n` +
          describeLogs(arch.win.filter((l: any) => /^\[Tools\]/.test(l.text))) + `\n${arch.reply.slice(0, 800)}`,
      ).toBe(true);

      // WHAT WE RECORD, NOT WHAT WE FORCE. On 13.5.0 the registry entry carries
      // no `confirms`, so a plain call goes straight at Jira; 13.6.0 adds the
      // ticket. Either way this spec never sends a second yes.
      const asked = /confirm|are you sure|say yes|confirmation/i.test(arch.reply);
      console.log(
        `[site-token] archiveProject: tool calls=${archCalls.length}, reply asks for ` +
          `confirmation=${asked}`,
      );
      findings.push(
        `archiveProject on this build: calls=${archCalls.length}, asks-for-confirmation=${asked}`,
      );
    }

    // NOTHING WAS ARCHIVED — asserted against Jira, not against the reply.
    const after: any = await request("GET", `/rest/api/3/project/${PROJECT}`);
    expect(
      after.archived === true,
      `${PROJECT} IS ARCHIVED. The archive probe named ${GHOST_KEY} and told the model not to ` +
        `touch anything else. Restore it: POST /rest/api/3/project/${PROJECT}/restore`,
    ).toBe(false);

    // ---- 5. REMOVE THE TOKEN, AND THE REFUSAL NAMES THE CARD ---------------
    root = await openAdminSettings(page, T.deepLink(T.envId)!);
    expect(await removeCredentialViaCard(root, SITE), "the token could not be removed").toBe(true);

    await page.waitForTimeout(GAP_MS);
    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    const refused = await turnQ(
      "site-token-refusal",
      `Now read the screen configuration of project ${PROJECT} again — its issue type screen ` +
        `scheme and screens.`,
    );
    if (!QUOTA_BUBBLE.test(refused.reply)) {
      const line2 = toolset(refused.win);
      console.log(`[site-token] toolset line after removal: ${line2}`);
      expect(
        line2,
        `the site-token gate is STILL OPEN after the credential was removed through the card. ` +
          `Removing a credential has to close it on the very next turn:\n${line2}`,
      ).toMatch(/allowSiteToken=false\(no-credential\)/);
      expect(
        called(refused.win, "getScreenConfiguration").length,
        `getScreenConfiguration ran with no stored token. There is no asUser fallback by design; ` +
          `a tool that sometimes acts as a person and sometimes as the app is a permission model ` +
          `nobody could describe.`,
      ).toBe(0);
      // The refusal has to point somewhere. `capabilityNotes.allowSiteToken`'s
      // no-credential sentence names the card by its heading precisely so an
      // administrator sent to a settings page can find the field.
      expect(
        refused.reply,
        `the refusal does not name the "${SITE.heading}" card, so a user is told no and given no ` +
          `way through:\n${refused.reply.slice(0, 1200)}`,
      ).toMatch(new RegExp(SITE.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  } finally {
    console.log(`[site-token] FINDINGS:\n- ${findings.join("\n- ") || "(none)"}`);
    try {
      if (frame) {
        await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
      }
      await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
      const r = await resolveAdminRoot(page);
      await adminTab(r, "Settings").click();
      await removeCredentialViaCard(r, SITE);
    } catch (e) {
      console.warn(
        `[restore] COULD NOT VERIFY the site token was removed (${(e as Error)?.message}). ` +
          `Remove it by hand on the ChatWise settings page — a stored site-admin token on a ` +
          `shared tenant hands every later run an authority it never asked for.`,
      );
    }
  }
});

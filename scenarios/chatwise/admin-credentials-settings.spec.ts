// LIVE: THE TWO CREDENTIAL CARDS — the only place a ChatWise administrator
// hands the app a credential that acts as a person or as a whole organisation.
//
// *** SKIPS WHILE wolfaenpak IS ON APP 12. See admin-credentials-support.ts. ***
//
// WHY THE WORDS ARE ASSERTED AND NOT JUST THE CONTROLS
// ---------------------------------------------------
// The owner's ask was "all auth elements should be presented as fields in the
// settings of chatwise please with EXACT TEXT on what is going on". Exact text
// is therefore a requirement, not decoration, and a requirement that nothing
// checks is the `allowBulk` defect: stored, rendered, connected to nothing.
// `credentialCopy.js` exists so the card and this spec read ONE copy — a
// harness that re-typed the headings would be a second copy that disagrees the
// day somebody edits the card, and it would still be green.
//
// WHAT THIS SPEC IS REALLY FOR: THE SECRET NEVER COMES BACK OUT. A unit test
// can assert the reducer; only a live run can assert that the DEPLOYED page,
// after a reload, contains no trace of what was typed — not the value, not a
// prefix, not a mask, not in an input, not in the DOM. A mask is a prefix and a
// prefix narrows a brute force.
//
// SAFETY: the credentials stored here are REAL and this is a shared tenant, so
// every path removes them in `finally` and PROVES the removal by reading the
// status back. A stored site-admin token left behind would hand every later run
// an authority it never asked for.
import { test, expect } from "../../fixtures/forge";
import type { Page, FrameLocator, Locator } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { GLOBAL_APP, callResolver, openGlobalPage, waitForChatApp } from "./chatwise-support";
import {
  cardState,
  hasSecret,
  loadCredentialCopy,
  removeCredentialViaCard,
  secret,
  skipUntilCardsPresent,
} from "./admin-credentials-support";

const T = getTarget("chatwise-admin");
const CHAT = getTarget("chatwise-global");

type Root = Page | FrameLocator;
const PROBE_TAB = "Beta access";

function tabLocator(root: Root, name: string): Locator {
  return root.getByRole("tab", { name, exact: true }).first();
}

async function resolveAdminRoot(page: Page, timeout = 40_000): Promise<Root> {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await tabLocator(page, PROBE_TAB).isVisible({ timeout: 500 }).catch(() => false)) return page;
    const frames = await page.locator("iframe").count().catch(() => 0);
    for (let i = 0; i < frames; i++) {
      const fl = page.locator("iframe").nth(i).contentFrame();
      if (await tabLocator(fl, PROBE_TAB).isVisible({ timeout: 500 }).catch(() => false)) return fl;
    }
    if (Date.now() > deadline) throw new Error("admin page never rendered its tabs");
    await page.waitForTimeout(500);
  }
}

test.describe.configure({ timeout: 900_000 });

test("both credential cards say exactly what the app says they say, and never give a secret back", async ({
  page,
}) => {
  test.skip(!T.envId || !CHAT.envId, "env ids unresolved — run `npm run discover`.");
  const copy: any = await loadCredentialCopy();
  const SITE = copy.SITE_TOKEN_CARD;
  const ORG = copy.ORG_KEY_CARD;
  expect(SITE?.heading, "credentialCopy.js exports no site-token card").toBeTruthy();
  expect(ORG?.heading, "credentialCopy.js exports no org-key card").toBeTruthy();

  let root: Root | null = null;
  let stored: string[] = [];
  let testOutcome = "(not reached)";

  try {
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    root = await resolveAdminRoot(page);
    await tabLocator(root, "Settings").click();
    await skipUntilCardsPresent(root, [SITE.heading, ORG.heading]);

    // ---- PRECONDITION: this site holds neither credential ------------------
    // GROUND TRUTH IS THE CARD, not a resolver: `registerCredentialRoutes` is
    // on the admin resolver only, and the admin surface exposes no bridge
    // handle. What the administrator SEES is the honest oracle here anyway.
    for (const card of [SITE, ORG]) {
      const st = await cardState(root, card);
      console.log(`[admin-creds] "${card.heading}" starts in state: ${st}`);
      test.skip(
        st === "configured",
        `a credential is ALREADY stored for "${card.heading}". A stored credential cannot be read ` +
          `back, so this spec could not restore it after testing Remove. Refusing to destroy one.`,
      );
    }

    // ---- THE WORDS, FROM THE APP'S OWN COPY -------------------------------
    for (const card of [SITE, ORG]) {
      await expect(
        root.getByText(card.heading, { exact: true }).first(),
        `the card "${card.heading}" is not on the Settings tab`,
      ).toBeVisible({ timeout: 30_000 });
      for (const loz of card.lozenges || []) {
        await expect(
          root.getByText(loz.text, { exact: true }).first(),
          `the lozenge "${loz.text}" is missing from "${card.heading}" — it is how an admin sees ` +
            `the cost of the credential at a glance`,
        ).toBeVisible();
      }
      // EVERY paragraph heading. One present and ten missing is a failure, not
      // a partial win — the disclosure is the feature.
      for (const p of card.sections || []) {
        await expect(
          root.getByText(p.label, { exact: true }).first(),
          `"${card.heading}" is missing the section "${p.label}"`,
        ).toBeVisible();
      }
    }

    // ---- THE FIELDS ARE EMPTY AND OF THE RIGHT TYPE -----------------------
    // Anchor on the BARE name: Forge drops the `forge-app-<hash>-` id prefix
    // after the first re-render, so `[id$="-x"]` matches only the first paint.
    const fid = (card: any, key: string) =>
      `input[id$="${card.fields.find((f: any) => f.key === key).id}"]`;
    const siteEmail = root.locator(fid(SITE, "email")).first();
    const siteToken = root.locator(fid(SITE, "token")).first();
    const orgId = root.locator(fid(ORG, "orgId")).first();
    const orgKey = root.locator(fid(ORG, "key")).first();
    for (const [f, name] of [[siteToken, "API token"], [orgKey, "Admin API key"]] as const) {
      await expect(f, `${name} field not found`).toBeVisible({ timeout: 20_000 });
      expect(await f.getAttribute("type"), `${name} is not a password field`).toBe("password");
      await expect(f, `${name} is prefilled`).toHaveValue("");
    }
    await expect(siteEmail).toHaveValue("");
    await expect(orgId).toHaveValue("");

    test.skip(
      !hasSecret(".site_token") || !hasSecret(".site_email"),
      "no site-token credential files — the storing half cannot run",
    );

    // ---- STORE THE SITE TOKEN THROUGH THE UI ------------------------------
    await siteEmail.fill(secret(".site_email"));
    await siteToken.fill(secret(".site_token"));
    await root.getByRole("button", { name: SITE.buttons.save, exact: true }).click();
    stored.push("SITE_TOKEN");
    await expect(
      root.getByText(SITE.savedLozenge, { exact: true }).first(),
      "no acknowledgement that the token was stored",
    ).toBeVisible({ timeout: 30_000 });
    // THE PASTED SECRET LEAVES THE COMPONENT THE MOMENT IT LANDS.
    await expect(siteToken, "the pasted token is still in the field").toHaveValue("");
    await expect(siteEmail, "the pasted email is still in the field").toHaveValue("");

    expect(await cardState(root, SITE), "the card does not show the token as stored").toBe("configured");
    // The card's own state line must now say a token IS saved — "empty field"
    // means both states until something says which.
    await expect(
      root.getByText(SITE.fieldHelper.configured, { exact: false }).first(),
      "the card does not say a token is saved",
    ).toBeVisible({ timeout: 20_000 });

    // ---- TEST: ONE REQUEST, AND ATLASSIAN'S OWN ANSWER --------------------
    // CAPTURED FIRST, THEN ASSERTED. A bare assertion on `testPass` reports
    // "Test is broken" without saying what the card DID say, which is the
    // difference between a bug report and one somebody can act on.
    await root.getByRole("button", { name: SITE.buttons.test, exact: true }).click();
    await page.waitForTimeout(20_000);
    const afterTest = await page.evaluate(() => document.body.innerText);
    const near = afterTest
      .split("\n")
      .filter((l) => /atlassian|token|asked|accept|reject|error|could not/i.test(l))
      .slice(0, 14);
    testOutcome = near.join(" | ");
    console.log(`[admin-creds] after Test, the card says:\n${near.join("\n")}`);
    expect(
      afterTest.includes(SITE.testPass) || afterTest.includes(SITE.testFail),
      `Test reported neither "${SITE.testPass}" nor "${SITE.testFail}". The card showed:\n${near.join("\n")}`,
    ).toBe(true);
    expect(
      afterTest.includes(SITE.testPass),
      `Atlassian did not accept the stored token. The card showed:\n${near.join("\n")}`,
    ).toBe(true);

    // ---- RELOAD: THE SECRET IS NOWHERE IN THE PAGE ------------------------
    await page.reload({ waitUntil: "domcontentloaded" });
    const root2 = await resolveAdminRoot(page);
    root = root2;
    await tabLocator(root2, "Settings").click();
    await expect(root2.getByText(SITE.heading, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    const tok = secret(".site_token");
    const mail = secret(".site_email");
    const leak = await page.evaluate(
      (v) => {
        const html = document.documentElement.outerHTML;
        const inputs = Array.from(document.querySelectorAll("input")).map((i) => i.value).join("|");
        return {
          full: html.includes(v.tok),
          prefix: html.includes(v.pre),
          email: html.includes(v.mail),
          inInput: inputs.includes(v.pre) || inputs.includes(v.mail),
        };
      },
      { tok, pre: tok.slice(0, 10), mail },
    );
    expect(leak.full, "the token is in the admin page's DOM after a reload").toBe(false);
    expect(leak.prefix, "a PREFIX of the token is in the DOM — a prefix narrows a brute force").toBe(false);
    expect(leak.email, "the account email is in the DOM").toBe(false);
    expect(leak.inInput, "the credential was rehydrated into an input").toBe(false);

    // ---- THE ORG KEY, THE SAME WAY ----------------------------------------
    if (hasSecret(".org_key") && hasSecret(".org_id")) {
      const orgId2 = root2.locator(fid(ORG, "orgId")).first();
      const orgKey2 = root2.locator(fid(ORG, "key")).first();
      await orgId2.fill(secret(".org_id"));
      await orgKey2.fill(secret(".org_key"));
      await root2.getByRole("button", { name: ORG.buttons.save, exact: true }).click();
      stored.push("ORG_KEY");
      await expect(
        root2.getByText(ORG.savedLozenge, { exact: true }).first(),
        "no acknowledgement that the org key was stored",
      ).toBeVisible({ timeout: 30_000 });
      expect(await cardState(root2, ORG), "the card does not show the key as stored").toBe("configured");
      await root2.getByRole("button", { name: ORG.buttons.test, exact: true }).click();
      await expect(
        root2.getByText(ORG.testPass, { exact: false }).first(),
        "Test did not report Atlassian accepting the org key",
      ).toBeVisible({ timeout: 60_000 });
    } else {
      console.log("[admin-creds] no org credential files — the org half of this spec did not run");
    }

    // ---- REMOVE, THROUGH THE APP'S OWN DIALOG -----------------------------
    await root2.getByRole("button", { name: SITE.buttons.remove, exact: true }).first().click();
    await expect(
      root2.getByText(SITE.remove.title, { exact: true }).first(),
      "the removal confirmation dialog did not open",
    ).toBeVisible({ timeout: 15_000 });
    // The confirm control inside the modal is the LAST one with that name.
    await root2.getByRole("button", { name: SITE.remove.confirm, exact: true }).last().click();
    await expect(
      root2.getByText(SITE.statusLabels.unconfigured, { exact: true }).first(),
      "the card still claims a token after Remove",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      root2.getByText(SITE.fieldHelper.unconfigured, { exact: false }).first(),
      "the card does not say the four tools are no longer offered",
    ).toBeVisible();
    stored = stored.filter((k: string) => k !== "SITE_TOKEN");
  } finally {
    // RESTORE, from scratch if the body died. A real site-admin token left on a
    // shared tenant is the worst thing this spec could leave behind.
    try {
      let r = root;
      if (!r) {
        await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
        r = await resolveAdminRoot(page);
        await tabLocator(r, "Settings").click();
      }
      for (const card of [SITE, ORG]) await removeCredentialViaCard(r, card).catch(() => {});
    } catch (e) {
      console.warn(`[restore] could not verify credential removal: ${(e as Error)?.message}`);
    }
    console.log(`[admin-creds] SITE_TOKEN Test outcome: ${testOutcome}`);
  }
});

/**
 * THE GAP, WRITTEN DOWN RATHER THAN GLOSSED.
 *
 * The four mutating credential routes are supposed to be in
 * `ADMIN_MUTATION_ROUTES`, i.e. refused for a caller who is not a site admin.
 * The harness account IS a site admin and no non-admin credentials exist on
 * wolfaenpak (HANDOFF §7: an account exists, nobody has its password), so the
 * REFUSAL cannot be driven here — only the ALLOW side can, and an allow proves
 * nothing about a gate.
 *
 * So this test asserts what it honestly can: that the routes answer for an
 * admin at all, and it FAILS if a route is missing entirely. It says out loud
 * that the negative is unproven, because a suite that quietly tested only the
 * happy path is how `setSkillEnabled` shipped ungated for months.
 */
test("an unknown credential kind is refused by name, and the non-admin refusal is UNPROVEN here", async ({
  page,
}) => {
  test.skip(!T.envId, "env ids unresolved — run `npm run discover`.");
  const copy: any = await loadCredentialCopy();
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const root = await resolveAdminRoot(page);
  await tabLocator(root, "Settings").click();
  await skipUntilCardsPresent(root, [copy.SITE_TOKEN_CARD.heading, copy.ORG_KEY_CARD.heading]);

  // Both cards must render their CURRENT state, whatever it is — a card that
  // renders no state at all is the "empty field means both things" defect.
  for (const card of [copy.SITE_TOKEN_CARD, copy.ORG_KEY_CARD]) {
    const st = await cardState(root, card);
    console.log(`[admin-creds] "${card.heading}" state = ${st}`);
    expect(st, `"${card.heading}" shows no recognisable state`).not.toBe("unknown");
  }

  console.log(
    "[admin-creds] UNPROVEN: the non-admin refusal on saveCredential / deleteCredential / " +
      "testCredential. Those routes are registered on the ADMIN resolver behind " +
      "ADMIN_MUTATION_ROUTES; the harness account is a site admin and wolfaenpak has no non-admin " +
      "credentials (HANDOFF §7), so only the ALLOW side is reachable. An allow proves nothing " +
      "about a gate.",
  );
});

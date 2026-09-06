// LIVE: THE WEB-SEARCH SETTINGS CARD — the only control in ChatWise that turns
// on egress, driven the way an administrator drives it.
//
// WHY THIS EXISTS AT ALL
// ----------------------
// This app forfeited the "Runs on Atlassian" badge for exactly one capability,
// and this card is where a site decides whether to spend it. Everything about
// it that matters is a PROPERTY OF WHAT AN ADMIN SEES:
//
//   1. The card STATES THE COST in the card, not in a doc nobody opens: that
//      the words being searched for leave Atlassian, that nothing else does,
//      and that this is why the badge is gone.
//   2. THE KEY IS NEVER READ BACK — not in the field, not masked, not anywhere
//      in the page. A mask is a prefix and a prefix narrows a brute force.
//      test/webSearchSettings.test.mjs asserts the reducer; only a live run can
//      assert that the DEPLOYED page, after a reload, does not contain the
//      credential.
//   3. The switch cannot be turned on without a key, because a lever that gates
//      nothing is the `allowBulk` defect — stored, read, returned, connected to
//      nothing, for months.
//   4. The status ROUND-TRIPS: what the card shows is what the next chat turn
//      will read out of KVS, verified through the resolvers rather than from
//      the card's own optimistic state.
//
// GROUND TRUTH IS THE RESOLVER, NOT THE CARD. The card is the steering wheel;
// `getWebSearchStatus` / `getToolPolicy` read from a SECOND page are the
// odometer — the admin surface is UI Kit 2 and exposes no bridge handle.
//
// NO MODEL RUNS HERE, so nothing below can be quota-blocked and nothing skips
// for that reason. It does NOT assert that the webSearch TOOL works: HANDOFF
// §1.1 records it as unwired at three forwarding hops, which is a different
// defect in a different file, and a spec that conflated the two would go red
// for the wrong reason once one of them is fixed.
//
// SAFETY. wolfaenpak has NO key configured (measured). The spec refuses to run
// its mutating half if it finds one, because a saved key cannot be read back
// and therefore cannot be restored — deleting a real customer key to test the
// delete button is not a trade this harness gets to make.
import { test, expect } from "../../fixtures/forge";
import type { Page, FrameLocator, Locator } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import {
  GLOBAL_APP,
  assertCardButton,
  callResolver,
  openGlobalPage,
  waitForChatApp,
} from "./chatwise-support";

/** The heading this card is anchored by. Kept beside the spec that uses it. */
const WEB_SEARCH_CARD_HEADING = "Web search";

const T = getTarget("chatwise-admin");
const CHAT = getTarget("chatwise-global");

type Root = Page | FrameLocator;
const PROBE_TAB = "Beta access";

/**
 * THE FORGE ID PREFIX IS NOT STABLE ACROSS RE-RENDERS. Measured on the deployed
 * admin page 2026-09-05: the FIRST paint of the Settings tab carries
 * `forge-app-cf6cc-uploadsProject`, and after any interaction the same controls
 * come back as bare `uploadsProject` / `allowWebSearch` / `webSearchKey`. So
 * `[id$="-allowDestructive"]` — with the dash — matches on the first render and
 * silently stops matching afterwards, which is exactly how this spec first
 * failed with "element(s) not found" one line after filling that same field.
 * Every selector here ends WITHOUT the dash so both shapes match.
 */

/** ROLE ONLY — getByText("Settings") collides with Jira's own chrome. */
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

/** A second page with a chat surface on it — the only place resolvers can be called. */
async function openOdometer(page: Page) {
  const p = await page.context().newPage();
  const frame = await openGlobalPage(p, CHAT);
  await waitForChatApp(p, frame, GLOBAL_APP, 120_000);
  return { p, frame };
}


/**
 * THE CARD-SCOPED BUTTON IS SHARED NOW — see `assertCardButton` in
 * chatwise-support.ts.
 *
 * This file went red the day the organisation admin key card shipped, with
 * `strict mode violation: getByRole('button', { name: /save key/i }) resolved
 * to 2 elements`. It was correct when it was written and had no way to know a
 * second card would take its labels. That is the argument for one helper rather
 * than three: the spec that breaks is never the spec that changed.
 */
test.describe.configure({ timeout: 420_000 });

test("the card states the egress cost, refuses the switch without a key, and never reads the key back", async ({
  page,
}) => {
  test.skip(!T.envId || !CHAT.envId, "env ids unresolved — run `npm run discover`.");

  // A key that is unmistakably ours if it ever surfaces in a DOM dump.
  const CANARY = `harness-canary-${Date.now()}-DO-NOT-USE`;
  let odo: { p: Page; frame: FrameLocator } | null = null;
  let keySaved = false;

  try {
    odo = await openOdometer(page);

    // ---- PRECONDITION: this site has no key, so ours is safe to remove -----
    const before: any = await callResolver(odo.frame, GLOBAL_APP, "getWebSearchStatus");
    expect(before?.success, `getWebSearchStatus failed: ${JSON.stringify(before)}`).toBe(true);
    test.skip(
      before.configured === true,
      "a web-search key is ALREADY configured on this site. A stored key can never be read " +
        "back, so this spec cannot restore it after testing the delete path. Refusing to run " +
        "rather than destroying a real credential.",
    );
    const policyBefore: any = await callResolver(odo.frame, GLOBAL_APP, "getToolPolicy");
    expect(policyBefore?.policy, "getToolPolicy returned no policy").toBeTruthy();

    // ---- The card, unconfigured -------------------------------------------
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const root = await resolveAdminRoot(page);
    await tabLocator(root, "Settings").click();

    const heading = root.getByRole("heading", { name: "Web search", exact: true });
    await expect(heading, "the Web search card is not on the Settings tab").toBeVisible({
      timeout: 20_000,
    });

    // THE COST, IN THE CARD. Three separate facts, each asserted on its own —
    // one match on the word "search" would pass while the disclosure was gone.
    await expect(
      root.getByText("Leaves Atlassian", { exact: true }),
      "the card does not say the capability leaves Atlassian",
    ).toBeVisible();
    await expect(
      root.getByText(/sends the words being searched for to the provider/i),
      "the card does not state WHAT leaves",
    ).toBeVisible();
    await expect(
      root.getByText(/no issue data, no attachments, no\s+account or site identifiers/i),
      "the card does not state what does NOT leave",
    ).toBeVisible();
    await expect(
      root.getByText(/does not carry the .Runs on Atlassian. badge/i),
      "the card does not state the badge cost — the one fact a security review needs",
    ).toBeVisible();

    const toggle = root.locator('input[type="checkbox"][id$="allowWebSearch"]').first();
    const keyField = root.locator('input[id$="webSearchKey"]').first();
    await expect(keyField).toBeVisible();

    // A LEVER THAT GATES NOTHING IS THE `allowBulk` DEFECT. With no key the
    // switch must be unusable, not merely ignored.
    await expect(
      root.getByText("Not configured", { exact: true }),
      "the lozenge does not say the key is missing",
    ).toBeVisible();
    expect(await toggle.isDisabled(), "the switch is live with no key configured").toBe(true);
    expect(await toggle.isChecked(), "web search is already on").toBe(false);

    // The field type is the cheapest half of "never shown": a password input
    // cannot be read off a shoulder or a screenshot.
    expect(await keyField.getAttribute("type"), "the key field is not a password field").toBe(
      "password",
    );

    // ---- Save a key THROUGH THE UI ----------------------------------------
    await keyField.fill(CANARY);
    await (await assertCardButton(root, WEB_SEARCH_CARD_HEADING, "Save key")).click();
    keySaved = true;

    await expect(
      root.getByText("Key saved", { exact: true }),
      "no acknowledgement that the key was stored",
    ).toBeVisible({ timeout: 30_000 });

    // THE PASTED SECRET LEAVES THE COMPONENT THE MOMENT IT LANDS.
    await expect(keyField, "the pasted key is still sitting in the field").toHaveValue("");

    // The card now reads "configured but off" — configured is not enabled.
    await expect(
      root.getByText("Web search off", { exact: true }),
      "the lozenge did not move to the configured-but-off state",
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      root.getByText(/A key is saved\. Paste a new one to replace it\./i),
      "the card does not say a key is stored",
    ).toBeVisible();

    // ---- GROUND TRUTH: what did the BACKEND store? ------------------------
    const stored: any = await callResolver(odo.frame, GLOBAL_APP, "getWebSearchStatus");
    expect(stored?.configured, "the key did not reach app storage").toBe(true);
    // AND THE ROUTE DOES NOT ECHO IT. Not the value, not a prefix of it.
    const storedJson = JSON.stringify(stored);
    expect(storedJson, "getWebSearchStatus echoed the key").not.toContain(CANARY);
    expect(storedJson, "getWebSearchStatus echoed a PREFIX of the key").not.toContain(
      CANARY.slice(0, 12),
    );

    // ---- RELOAD: the field is still empty, and the key is nowhere on the page
    // The reducer test cannot ask this. A component that re-hydrated from a
    // route that one day returns the key would only be caught here.
    await page.reload({ waitUntil: "domcontentloaded" });
    const root2 = await resolveAdminRoot(page);
    await tabLocator(root2, "Settings").click();
    const keyField2 = root2.locator('input[id$="webSearchKey"]').first();
    await expect(keyField2).toBeVisible({ timeout: 30_000 });
    await expect(keyField2, "the stored key was rendered back into the field").toHaveValue("");

    const domHasKey = await page.evaluate((c) => {
      const html = document.documentElement.outerHTML;
      const values = Array.from(document.querySelectorAll("input")).map((i) => i.value).join("|");
      return {
        full: html.includes(c),
        prefix: html.includes(c.slice(0, 12)),
        inputs: values.includes(c.slice(0, 12)),
      };
    }, CANARY);
    expect(domHasKey.full, "the key is in the admin page's DOM after a reload").toBe(false);
    expect(domHasKey.prefix, "a PREFIX of the key is in the admin page's DOM").toBe(false);
    expect(domHasKey.inputs, "the key is in an input value after a reload").toBe(false);

    // ---- The switch is live now, and it round-trips to KVS ----------------
    const toggle2 = root2.locator('input[type="checkbox"][id$="allowWebSearch"]').first();
    expect(await toggle2.isDisabled(), "the switch is still dead with a key configured").toBe(false);
    await toggle2.click({ force: true }); // Atlaskit hides the input under a styled track
    await expect(
      root2.getByText("Web search on", { exact: true }),
      "the card did not move to the on state",
    ).toBeVisible({ timeout: 20_000 });

    const polOn: any = await callResolver(odo.frame, GLOBAL_APP, "getToolPolicy");
    expect(polOn?.policy?.allowWebSearch, "the switch did not reach KVS").toBe(true);
    // AND IT DID NOT TRAMPLE THE OTHER LEVERS. The card writes to the same KVS
    // row as "High-impact actions"; a blind write there re-opens whatever this
    // site had shut.
    expect(
      polOn.policy.allowDestructive,
      "flipping web search changed the DELETION lever",
    ).toBe(policyBefore.policy.allowDestructive);
    expect(polOn.policy.allowBulk).toBe(policyBefore.policy.allowBulk);
    expect(polOn.policy.allowAgile).toBe(policyBefore.policy.allowAgile);

    // ---- Remove the key: the app's OWN dialog, and the switch goes with it -
    await (await assertCardButton(root2, WEB_SEARCH_CARD_HEADING, "Remove key")).click();
    await expect(
      root2.getByText(/The stored key is deleted and web search is switched off/i),
      "the removal confirmation dialog did not open",
    ).toBeVisible({ timeout: 15_000 });
    // THE CONFIRM NO LONGER SHARES THE CARD'S LABEL. It used to be a second
    // "Remove key" and this line took `.last()` to tell them apart — which is
    // the ambiguity that, on the credential cards, made a confirm click land
    // back on the opener and leave a real site-admin token stored (6 Sep 2026).
    // The dialog now confirms with "Yes, remove it", so the locator names the
    // one control that can only be the modal's.
    await root2.getByRole("button", { name: "Yes, remove it", exact: true }).first().click();

    await expect(
      root2.getByText("Not configured", { exact: true }),
      "the card still claims a key after removing it",
    ).toBeVisible({ timeout: 30_000 });
    keySaved = false;

    const after: any = await callResolver(odo.frame, GLOBAL_APP, "getWebSearchStatus");
    expect(after?.configured, "the key survived the removal").toBe(false);
    const polOff: any = await callResolver(odo.frame, GLOBAL_APP, "getToolPolicy");
    expect(
      polOff?.policy?.allowWebSearch,
      "the key was removed but the switch stayed ON — egress with no key configured",
    ).toBe(false);
  } finally {
    // RESTORE, from scratch if the body died. Never leave a key or a switch on
    // a shared tenant.
    try {
      const o = odo ?? (await openOdometer(page));
      if (keySaved) await callResolver(o.frame, GLOBAL_APP, "deleteWebSearchKey").catch(() => {});
      const pol: any = await callResolver(o.frame, GLOBAL_APP, "getToolPolicy").catch(() => null);
      if (pol?.policy?.allowWebSearch === true) {
        await callResolver(o.frame, GLOBAL_APP, "saveToolPolicy", {
          policy: { ...pol.policy, allowWebSearch: false },
        }).catch(() => {});
      }
      const final: any = await callResolver(o.frame, GLOBAL_APP, "getWebSearchStatus").catch(() => null);
      const finalPol: any = await callResolver(o.frame, GLOBAL_APP, "getToolPolicy").catch(() => null);
      console.log(
        `[restore] websearch configured=${final?.configured} allowWebSearch=${finalPol?.policy?.allowWebSearch}`,
      );
      if (final?.configured === true || finalPol?.policy?.allowWebSearch === true) {
        console.warn(
          "[restore] WEB SEARCH WAS LEFT ON OR KEYED on a shared tenant — remove it by hand.",
        );
      }
      await o.p.close().catch(() => {});
    } catch (e) {
      console.warn(`[restore] could not verify the restore: ${(e as Error)?.message}`);
    }
  }
});

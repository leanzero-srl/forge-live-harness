// Shared plumbing for the ADMIN-CREDENTIALS scenarios. Not a spec — testMatch
// only collects *.spec.ts.
//
// WHY THESE SPECS ALL START THE SAME WAY
// --------------------------------------
// The admin-credentials feature shipped as Forge app 13.x. wolfaenpak is
// installed on app 12 and shows "Outdated app" until the owner approves the new
// scopes and the new egress hosts, so EVERY route, tool, persona and settings
// card in this feature is unreachable on the live site right now. A spec that
// simply failed would say "the feature is broken"; a spec that passed would be
// worse. They SKIP, with one sentence, and the sentence names the reason.
//
// THE PRECONDITION IS A CAPABILITY PROBE, NOT A VERSION STRING. The deployed
// marker tells you which BUILD is on the site; it does not tell you which app
// VERSION the site has approved, and those are exactly the two things that
// disagree here — the repo is on v6.116.0 while the install serves app 12. So
// the probe calls a resolver that only exists from 13.0.0 and reads the answer.
// The marker is logged beside it for the record, never asserted on.
import { test } from "@playwright/test";
import { assertCardButton } from "./chatwise-support";
import type { Page, FrameLocator } from "@playwright/test";

export type Root = Page | FrameLocator;
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** The one sentence, in one place, so every spec skips with the same words. */
export const NOT_APPROVED = "app 13.x not approved on this install";

/** Where the operator left the harness credentials, mode 600. */
export const SECRETS_DIR =
  process.env.CHATWISE_SECRETS_DIR ||
  path.join(
    "/private/tmp/claude-501/-Users-mihaiperdum-Projects-ChatWise",
    "6fbc7d3d-08a3-41d3-9673-62eea36d3527/scratchpad",
  );

/** The app repo, for reading the copy module the settings card renders from. */
export const APP_REPO = process.env.CHATWISE_REPO || path.join(os.homedir(), "Projects/ChatWise");

/**
 * Read one credential file.
 *
 * NEVER LOGGED, NEVER ASSERTED ON, NEVER INTERPOLATED INTO A FAILURE MESSAGE.
 * It is read, held in a local, typed into a password field or handed to a
 * resolver, and that is the whole of its life in this process. `has()` is what
 * a skip condition asks, so no caller needs to touch the value to find out
 * whether it exists.
 */
export function secret(name: string): string {
  return fs.readFileSync(path.join(SECRETS_DIR, name), "utf8").trim();
}
export function hasSecret(name: string): boolean {
  try {
    return fs.statSync(path.join(SECRETS_DIR, name)).size > 0;
  } catch {
    return false;
  }
}

/**
 * The words the two settings cards render, read from the APP'S OWN module.
 *
 * `credentialCopy.js` is import-free ESM and exists precisely so the strings
 * are asserted rather than re-typed: a harness that spelled them out again
 * would be a second copy that disagrees the day somebody edits the card. If the
 * file moves, these specs fail loudly here rather than quietly matching
 * nothing.
 */
export async function loadCredentialCopy(): Promise<any> {
  const p = path.join(APP_REPO, "src/admin-uikit/src/credentialCopy.js");
  if (!fs.existsSync(p)) {
    throw new Error(
      `credentialCopy.js is not at ${p}. These specs assert the DEPLOYED card against the app's ` +
        `own copy module rather than against re-typed strings; point CHATWISE_REPO at the app repo.`,
    );
  }
  return import(`file://${p}`);
}

/**
 * IS THE 13.x CREDENTIAL SURFACE REACHABLE — asked on the RIGHT surface.
 *
 * THE FIRST VERSION OF THIS PROBE WAS WRONG AND IT MATTERED. It called
 * `getCredentialStatus` from the GLOBAL PAGE and read
 * "Resolver has no definition for 'getCredentialStatus'" as "app 13.x is not
 * approved". The install was on app 13 and the marker was v6.116.0; the route
 * simply is not there. `registerCredentialRoutes` is registered ONLY on the
 * `admin-resolver` (src/resolvers/admin/index.js:51), and the global page and
 * the issue panel both run `chat-resolver`. That is correct design — managing a
 * site-administrator credential belongs on the admin page and nowhere else —
 * and a harness that reported it as a missing feature would have sent somebody
 * hunting a deploy problem that does not exist.
 *
 * So the probe asks the ADMIN page for the thing only 13.x renders: the card.
 * The admin surface is UI Kit 2 and exposes no bridge handle, which is why
 * ground truth for these specs is what the card SHOWS, and for the gates the
 * `[Consumer] toolset:` reason line on a real turn.
 */
export async function adminCardsPresent(root: Root, headings: string[]): Promise<boolean> {
  for (const h of headings) {
    // BY TEXT, NOT BY ROLE. UI Kit 2's `Heading as="h3"` does not surface as an
    // ARIA heading in the host DOM — measured 6 Sep 2026: the strings were
    // plainly in `document.body.innerText` while
    // `getByRole("heading", { name })` matched nothing, so a role-based probe
    // reported the whole feature missing on an install that had it.
    // `isVisible()` DOES NOT WAIT. Its `timeout` option is inert — it is an
    // immediate check, not an auto-retrying assertion — so the first version of
    // this probe asked before the tab had painted and reported the whole
    // feature missing on an install that had it. Measured 6 Sep 2026: the same
    // locator counted 1 after an 8-second settle. `waitFor` is the one that
    // waits.
    const seen = await root
      .getByText(h, { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (!seen) return false;
  }
  return true;
}

/** Skip — never pass — while the credential cards are not on the settings page. */
export async function skipUntilCardsPresent(root: Root, headings: string[]): Promise<void> {
  const present = await adminCardsPresent(root, headings);
  console.log(`[admin-creds] credential cards present = ${present} (${headings.join(" | ")})`);
  test.skip(!present, NOT_APPROVED);
}

/**
 * What the card SAYS about the credential right now. `statusLabels` in the copy
 * module is the closed set, so reader and renderer cannot disagree about what a
 * state is called.
 */
export async function cardState(root: Root, card: any): Promise<string> {
  for (const [state, label] of Object.entries(card.statusLabels || {})) {
    // A short WAIT, not an instant check — see adminCardsPresent above.
    const seen = await root
      .getByText(String(label), { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 2_500 })
      .then(() => true)
      .catch(() => false);
    if (seen) return state;
  }
  return "unknown";
}

/**
 * Remove a credential THROUGH THE CARD and prove the card agrees.
 *
 * These specs store REAL credentials on a shared tenant, so the restore is
 * verified rather than attempted and says so when it cannot. It goes through
 * the app's own dialog because that is the only route there is: the admin
 * surface has no bridge handle, so there is no resolver to call.
 */
export async function removeCredentialViaCard(root: Root, card: any): Promise<boolean> {
  if ((await cardState(root, card)) === "unconfigured") return true;
  const open = await assertCardButton(root, card.heading, card.buttons.remove, 8_000).catch(() => null);
  if (!open) {
    console.warn(`[restore] no "${card.buttons.remove}" control on "${card.heading}"`);
    return false;
  }
  await open.click().catch(() => {});
  // ⚠️ WAIT FOR THE DIALOG BY ITS TITLE, THEN CONFIRM BY A LABEL ONLY THE
  // DIALOG HAS. This is the shape of a bug that left a real site-admin token on
  // a shared tenant (measured 6 Sep 2026), and it is worth keeping the history:
  //
  // The card's control and the modal's confirm used to carry the SAME LABEL —
  // "Remove token" was both `buttons.remove` and `remove.confirm`. Before the
  // modal painted there was exactly ONE button with that name, so the confirm
  // click landed back on the OPENER: the dialog toggled shut and nothing was
  // removed. Playwright reported the click delivered, the `.catch(() => {})`
  // swallowed nothing because nothing threw, and the only symptom was a card
  // still saying "Token saved" ten polls later. Measured: 1 matching button
  // before the dialog, 2 after ~4s.
  //
  // THE APP FIXED THE AMBIGUITY rather than leaving the harness to work around
  // it: the confirm now reads "Yes, remove it" and ChatWise's own
  // credentialSettings suite asserts, over its copy module, that no card's
  // opener can ever share a label with its own confirmation again. So
  // `card.remove.confirm` is now unique on the page and `.first()` is exact.
  //
  // Both guards stay anyway. The title wait is what proves the dialog is UP —
  // clicking a confirm that has not rendered is a different failure with the
  // same silent symptom — and reading both labels from the copy module means a
  // wording change lands here without an edit.
  const dialogUp = await root
    .getByText(card.remove.title, { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!dialogUp) {
    console.warn(`[restore] the "${card.remove.title}" dialog never opened`);
  }
  // ONE button carries this name now, and it is the modal's. `.first()` rather
  // than `.last()` because with a unique label they are the same locator, and
  // `.first()` does not quietly depend on DOM order the way `.last()` did.
  await root
    .getByRole("button", { name: card.remove.confirm, exact: true })
    .first()
    .click({ timeout: 15_000 })
    .catch(() => {});
  for (let i = 0; i < 10; i++) {
    if ((await cardState(root, card)) === "unconfigured") {
      console.log(`[restore] ${card.heading}: removed`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  console.warn(
    `[restore] ${card.heading} MAY STILL BE STORED on a shared tenant — remove it by hand on the ` +
      `ChatWise settings page.`,
  );
  return false;
}

/** Poll a predicate; returns the last value either way. */
export async function until<T>(
  page: Page,
  read: () => Promise<T>,
  ok: (v: T) => boolean,
  timeoutMs = 60_000,
  stepMs = 3_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await read();
  while (!ok(last) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, stepMs));
    last = await read();
  }
  return last;
}

/**
 * The 13.x precondition for the CHAT surfaces, which have no credential routes.
 *
 * `jira-org-admin` is a persona that ships with 13.x and with nothing earlier,
 * so its presence in the roster is the cheapest honest capability probe on a
 * surface whose resolver never registers `getCredentialStatus`.
 */
export async function skipUntilAdminPersonas(
  frame: FrameLocator,
  appKey: string,
  callResolverFn: (f: FrameLocator, k: string, m: string, p?: Record<string, unknown>) => Promise<any>,
): Promise<void> {
  const r = await callResolverFn(frame, appKey, "getPersonas", {}).catch(() => null);
  const ids = (r?.personas || []).map((p: any) => p.id);
  const ok = ids.includes("jira-admin") && ids.includes("jira-org-admin");
  console.log(`[admin-creds] persona roster: ${ids.join(", ") || "(none)"} -> 13.x=${ok}`);
  test.skip(!ok, NOT_APPROVED);
}

/* ------------------------------------------------------------------------ *
 * DRIVING THE ADMIN PAGE FROM A SPEC THAT IS NOT ABOUT THE ADMIN PAGE.
 *
 * `site-token-tools` and `org-admin-tools` both have to STORE a real credential
 * before they can measure anything and REMOVE it afterwards, and the only route
 * to either is the card: `registerCredentialRoutes` is on the admin resolver,
 * and the UI Kit 2 surface exposes no bridge handle. These three helpers were
 * copied out of `admin-credentials-settings.spec.ts` the moment the second
 * caller appeared, because a second hand-rolled copy of "find the admin root"
 * is how the two specs come to disagree about what the page looks like.
 * ------------------------------------------------------------------------ */

/** The tab that is on the admin page in every version, used to find the root. */
export const ADMIN_PROBE_TAB = "Beta access";

export function adminTab(root: Root, name: string) {
  return root.getByRole("tab", { name, exact: true }).first();
}

/**
 * The admin page renders in the HOST DOM on some builds and inside an iframe on
 * others, so this asks both rather than assuming. `isVisible()` is used with an
 * explicit short timeout INSIDE a loop that owns the waiting — the option on
 * `isVisible` itself is inert.
 */
export async function resolveAdminRoot(page: Page, timeout = 60_000): Promise<Root> {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await adminTab(page, ADMIN_PROBE_TAB).isVisible({ timeout: 500 }).catch(() => false)) return page;
    const frames = await page.locator("iframe").count().catch(() => 0);
    for (let i = 0; i < frames; i++) {
      const fl = page.locator("iframe").nth(i).contentFrame();
      if (await adminTab(fl, ADMIN_PROBE_TAB).isVisible({ timeout: 500 }).catch(() => false)) return fl;
    }
    if (Date.now() > deadline) throw new Error("admin page never rendered its tabs");
    await page.waitForTimeout(500);
  }
}

/** Open the admin page's Settings tab and return whatever root it lives in. */
export async function openAdminSettings(page: Page, deepLink: string): Promise<Root> {
  await page.goto(deepLink, { waitUntil: "domcontentloaded" });
  const root = await resolveAdminRoot(page);
  await adminTab(root, "Settings").click();
  return root;
}

/**
 * Store a credential THROUGH THE CARD and prove the card agrees.
 *
 * `values` is keyed by the copy module's field `key`, so a renamed field id
 * fails here rather than silently filling nothing. THE VALUES ARE NEVER LOGGED.
 */
/**
 * THE CARD-SCOPED BUTTON NOW LIVES IN `chatwise-support.ts`.
 *
 * It was here, anchored on the card's last FIELD, and that was one home too few
 * and one anchor too narrow: `websearch-settings-card.spec.ts` hit the same
 * "Save key" collision from outside this module and could not reach it, and the
 * ledger card has buttons and no fields at all. The shared version anchors on
 * the HEADING — a card is the thing that has that heading — and `assertCardButton`
 * additionally proves the ancestor walk did not climb past the card into a
 * container holding somebody else's.
 */
export { cardButton, assertCardButton, SETTINGS_CARD_HEADINGS } from "./chatwise-support";

export async function storeCredentialViaCard(
  root: Root,
  card: any,
  values: Record<string, string>,
): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    const field = card.fields.find((f: any) => f.key === key);
    if (!field) throw new Error(`"${card.heading}" has no field with key "${key}"`);
    const loc = root.locator(`input[id$="${field.id}"]`).first();
    await loc.waitFor({ state: "visible", timeout: 30_000 });
    await loc.fill(value);
  }
  await (await assertCardButton(root, card.heading, card.buttons.save)).click();
  await root
    .getByText(card.savedLozenge, { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
}

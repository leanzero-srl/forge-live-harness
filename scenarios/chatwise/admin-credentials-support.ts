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
  const open = root.getByRole("button", { name: card.buttons.remove, exact: true }).first();
  const there = await open
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!there) {
    console.warn(`[restore] no "${card.buttons.remove}" control on "${card.heading}"`);
    return false;
  }
  await open.click().catch(() => {});
  await root
    .getByRole("button", { name: card.remove.confirm, exact: true })
    .last()
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

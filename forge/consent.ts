// Some Forge apps act AS the user (per-user OAuth consent) and render NOTHING until the host banner
// "For <App> to display, you need to grant it access to Atlassian apps on your behalf" is accepted.
// Found 2026-09-08 with resolution's "User Manager": two full-text runs captured 0 chars because the
// iframe stays empty behind the banner. Accepting is a REAL grant on the signed-in account, so this
// only ever runs on the wolfaenpak testbed and records that it did so in the manifest narrative.
import type { Page } from "@playwright/test";
import { BASE_URL } from "../config/env";

export async function consentIfAsked(page: Page): Promise<"granted" | "not-asked" | "refused-not-testbed" | "needs-interactive-login"> {
  const banner = page.getByText(/grant it access to Atlassian apps on your behalf/i).first();
  if (!(await banner.count().catch(() => 0))) return "not-asked";
  if (!/wolfaenpak\.atlassian\.net/.test(BASE_URL)) return "refused-not-testbed";
  const allow = page.getByRole("button", { name: /^Allow access$/i }).first();
  const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 8000 }).catch(() => null), allow.click().catch(() => {})]);
  const t = popup || page;
  await t.waitForLoadState("domcontentloaded").catch(() => {});
  await t.waitForTimeout(4000);
  // Resolution (2026-09-08): the popup is Forge OUTBOUND AUTH (id.atlassian.com/outboundAuth/start) and
  // lands on Atlassian's LOGIN page — the popup does not inherit the profile session, so consent needs
  // a person to sign in (email, password, MFA). Report that; do not pretend it was granted.
  if (/id\.atlassian\.com\/login/.test(t.url()) || /log in to continue/i.test(await t.title().catch(() => ""))) {
    if (popup) await popup.close().catch(() => {});
    return "needs-interactive-login";
  }
  // Atlassian's consent screen, if shown, has an Accept control
  const accept = t.getByRole("button", { name: /^(accept|allow|continue)$/i }).first();
  if (await accept.count().catch(() => 0)) { await accept.click().catch(() => {}); await t.waitForTimeout(6000); }
  if (popup) await popup.close().catch(() => {});
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(8000);
  return "granted";
}

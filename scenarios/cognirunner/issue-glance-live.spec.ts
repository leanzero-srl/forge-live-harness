// LIVE: CogniRunner issue-context glance (jira:issueContext "CogniRunner on this issue") on a real
// wolfaenpak issue. COGTEST-2476 carries 50 execution-log entries, so this exercises the FULL state
// (activity cards + status badges), not just the empty state. Proves the one part the mock harness
// could not: the live module render + view.getContext() issue wiring + getIssueActivity end-to-end.
import { test, expect } from "../../fixtures/forge";
import { BASE_URL } from "../../config/env";
import { assertLoggedIn } from "../../forge/browser";

const ISSUE = "COGTEST-2476";

// Browser/iframe render can flake transiently — retry like the other render smokes.
test.describe.configure({ retries: 3 });

test("issue-context glance renders CogniRunner activity on a real issue", async ({ page }) => {
  await assertLoggedIn(page);
  await page.goto(`${BASE_URL}/browse/${ISSUE}`, { waitUntil: "domcontentloaded" });

  // The glance is a jira:issueContext Custom UI panel whose iframe is LAZY — it only mounts when
  // the context item is expanded (normal issueContext behavior). The item is a DIV labelled with the
  // app name ("CogniRunner DEV" in dev / "CogniRunner"), not an aria button — click it to mount.
  const contextItems = [
    ...(await page.getByText(/^CogniRunner DEV$/i).all()),
    ...(await page.getByText(/^CogniRunner$/i).all()),
  ];
  let glanceFrame: import("@playwright/test").Frame | null = null;
  for (const el of contextItems) {
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click().catch(() => {});
    try {
      await expect(async () => {
        for (const f of page.frames()) {
          if ((await f.locator(".glance-head").count().catch(() => 0)) > 0) { glanceFrame = f; return; }
        }
        throw new Error("not yet");
      }).toPass({ timeout: 8_000 });
      break;
    } catch { /* try the next candidate item */ }
  }
  expect(glanceFrame, "the CogniRunner issueContext panel expanded and its iframe mounted").not.toBeNull();

  // The lazy iframe can re-mount while getIssueActivity resolves — re-scan frames on each poll so a
  // stale frame ref can't flake, and assert the FULL activity render (cards + glyph/label badges +
  // AI reasons) since COGTEST-2476 carries real logged activity.
  await expect(async () => {
    let f: import("@playwright/test").Frame | null = null;
    for (const fr of page.frames()) if ((await fr.locator(".glance-head").count().catch(() => 0)) > 0) f = fr;
    if (!f) throw new Error("glance frame not present");
    await expect(f.locator(".glance-head")).toContainText(/CogniRunner on this issue/i);
    const items = await f.locator(".glance-item").count();
    const badges = await f.locator(".glance-badge").count();
    const reasons = await f.locator(".glance-reason").count();
    if (items < 1 || badges < 1 || reasons < 1) throw new Error(`not rendered yet: items=${items} badges=${badges} reasons=${reasons}`);
    // eslint-disable-next-line no-console
    console.log(`GLANCE LIVE OK: ${items} activity cards, ${badges} status badges, ${reasons} reasons on ${ISSUE}`);
  }).toPass({ timeout: 30_000 });
});

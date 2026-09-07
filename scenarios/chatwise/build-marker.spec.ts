// WHICH BUILD IS ACTUALLY LIVE — no model turns, no writes, ~20 seconds.
//
// ⚠️ WRITTEN BECAUSE I KEPT RE-DERIVING IT. Every result this harness produces
// has to be tagged with the build it ran on, and the repo is NOT the answer: the
// working tree carries the next version's marker while the tenant is still
// serving the last one, and `forge install list` reports the MAJOR only (13),
// which does not move on a deploy. The only honest source is the marker the
// deployed page renders, so this reads that.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { openGlobalPage } from "./chatwise-support";

const CHAT = getTarget("chatwise-global");

test("the build marker the tenant is actually serving", async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(!CHAT.envId, "env id unresolved — run `npm run discover`.");
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, CHAT);
  // The marker is a plain div in the iframe's body; read the whole body text
  // and pull it out, because a `text=` locator matches the RENDERED node and
  // this one is opacity 0.3 and pointer-events:none, which several strict-mode
  // and visibility rules treat differently across surfaces.
  await page.waitForTimeout(4_000);
  const body = await frame.locator("body").innerText({ timeout: 60_000 }).catch(() => "");
  const marker = (body.match(/\bv\d+\.\d+\.\d+\b/) || [""])[0];
  console.log(`[build] the global page is serving: ${marker.trim() || "(no marker found)"}`);
  expect(
    /^v\d+\.\d+\.\d+$/.test(marker.trim()),
    `no build marker on the global page — every result this harness reports would be untagged`,
  ).toBe(true);
});

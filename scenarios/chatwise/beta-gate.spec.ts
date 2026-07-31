// LIVE REGRESSION: ChatWise's BETA access gate must NOT lock out a legitimate user.
//
// The gate has two layers (see ChatWise src/shared/access/): guardResolver.js
// refuses every resolver route for a caller outside the allow-list, and
// src/chat/shared/services/BetaGate.js paints the blocking screen that explains
// the refusal. The dangerous failure mode before a client install is not "a
// stranger got in" — it is "the gate wrongly blocks someone who IS on the list",
// which turns the app into a dead page for its own testers.
//
// The harness's browser session is the wolfaenpak admin, whose accountId is in
// BETA_SEED_ALLOWLIST (baked into the build, not removable at runtime). So the
// EXPECTED live outcome is ALLOWED: no blocking overlay, no leftover cover, and
// a chat UI that actually paints.
//
// Note on ordering: asserting "#chatwise-beta-gate is absent" straight after the
// iframe mounts would pass trivially — the overlay is painted asynchronously,
// after an invoke() round-trip. So we first wait for the gate to SETTLE (either
// the blocking screen appeared, or the app initialised past it), and only then
// assert which way it went.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("chatwise-global");

/** BetaGate.js OVERLAY_ID — the blocking screen. */
const GATE = "#chatwise-beta-gate";
/** `${OVERLAY_ID}-cover` — painted SYNCHRONOUSLY, removed only when access is granted. */
const COVER = "#chatwise-beta-gate-cover";
/** mihai@wolfaenpak.com — verified live via /rest/api/3/myself; in BETA_SEED_ALLOWLIST. */
const ALLOWLISTED_ACCOUNT = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";

// UI/iframe specs retry transient load flakes (deep REST suites stay at 0).
test.describe.configure({ retries: 2 });

test("ChatWise beta gate ALLOWS the allow-listed wolfaenpak admin (no lock-out)", async ({ page, recorder }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo,
  });

  await assertLoggedIn(page);
  await recorder.step("navigate to the ChatWise global page", async () => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }, { action: "navigate", expectation: { assertion: "global page loads (no login redirect)", narrative: "ChatWise opens for the logged-in wolfaenpak admin." } });

  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("ChatWise global page is a Custom-UI surface — expected an iframe frame");

  // The gate's decision is only observable once one of its two outcomes exists:
  // the blocking overlay (denied), or an initialised app (allowed — initializeApp
  // in GlobalPageApp.js sets window.chatWiseGlobal only AFTER enforceBetaGate()
  // returned true).
  let verdict: "allowed" | "blocked" | "unsettled" = "unsettled";
  await recorder.step("beta gate settles (a real decision, not just 'not painted yet')", async () => {
    const deadline = Date.now() + 45_000;
    for (;;) {
      if ((await frame.locator(GATE).count().catch(() => 0)) > 0) { verdict = "blocked"; return; }
      const booted = await frame
        .locator("body")
        .evaluate(() => Boolean((window as unknown as { chatWiseGlobal?: unknown }).chatWiseGlobal))
        .catch(() => false);
      if (booted) { verdict = "allowed"; return; }
      if (Date.now() > deadline) break;
      await page.waitForTimeout(300);
    }
    throw new Error(
      "beta gate never settled: within 45s neither the blocking screen (" + GATE +
      ") nor an initialised app (window.chatWiseGlobal) appeared — the access check hung or app init failed after it.",
    );
  }, { expectation: { assertion: "the access check completes and the app either boots or blocks", narrative: "The beta gate reaches a decision instead of leaving the user on a covered, dead page." } });

  await recorder.step("no BETA blocking overlay for an allow-listed user", async () => {
    expect(verdict, `beta verdict for ${ALLOWLISTED_ACCOUNT} (a BETA_SEED_ALLOWLIST entry)`).toBe("allowed");
    await expect(frame.locator(GATE)).toHaveCount(0);
  }, { expectation: { assertion: `${GATE} is absent for an allow-listed account`, narrative: "The gate does not lock out a legitimate user — the single riskiest regression before a client install." } });

  await recorder.step("the synchronous cover is removed, not left on screen", async () => {
    await expect(frame.locator(COVER)).toHaveCount(0);
  }, { expectation: { assertion: `${COVER} is removed once access is granted`, narrative: "BetaGate.js paints an opaque cover before its first await; an allowed user must not be left staring at it." } });

  await recorder.step("the real chat UI is present and actually painted", async () => {
    await expect(frame.locator("#appShell")).toBeVisible();
    await expect(frame.locator("#chatInput")).toBeVisible();
    await expect(frame.locator("#sendButton")).toBeVisible();
    // Playwright's toBeVisible() ignores OCCLUSION — a full-screen cover on top
    // would still leave these "visible". The paint-toggle diff is the real check.
    const paints = await recorder.paintsPixels("#newChatButton");
    expect(paints, "the chat UI must actually paint — no gate cover/overlay may occlude it").toBe(true);
  }, { expectation: { assertion: "the chat shell renders and paints real pixels", narrative: "An allow-listed user gets the working ChatWise interface, not a blocked or covered shell." } });
});

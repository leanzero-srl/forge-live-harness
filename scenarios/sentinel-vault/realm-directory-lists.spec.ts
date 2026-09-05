// Realm-console DIRECTORY lists — the four asUser() resolvers the console reads at bootstrap and
// behind its pickers, driven as the logged-in WFH steward (Mihai). None of these can be reached
// from the webtrigger seam (asUser needs a real session), so the browser is the only lane. Every
// assertion below is on the RESOLVED value, never on "something rendered" — each of these has a
// silent fallback the UI substitutes on failure, which is exactly why a render-only check is vacuous:
//   identify-realm            → the Sealed Files heading carries the REAL space name (fetched over
//                               REST here), not the "Current Space" fallback (realm-console/index.jsx:524).
//   enumerate-operators       → Access Control → Add Steward → FOCUS the search (no typing): the
//                               initial-10 "Recent users" list renders from operatorResults, which
//                               only fetchInitialOperators() (index.jsx:645) can populate.
//   enumerate-teams           → Groups "+ Add Group" → the search input only appears once teamList
//                               is non-empty (index.jsx:2004 shows skeletons until fetchAllTeams
//                               returns) → focus it → ≥1 real group row.
//   enumerate-operator-seals  → the bootstrap fetchMyClaimedFiles() invoke (index.jsx:675), captured
//                               on the wire and asserted to list the sealed fixture. The "My Sealed
//                               Files" tab is rendered ONLY for userRole === "user" (index.jsx:1505) —
//                               a steward cannot click it — so the wire is the only proof for Mihai.
//                               If the tab IS present (a non-steward run) the card is asserted too.
// Self-cleaning: nothing is added, saved or typed; both pickers are closed again and the steward /
// group counts are asserted unchanged. Dev-scoped through the target (env 17516615).
// @covers resolver:identify-realm resolver:enumerate-operators resolver:enumerate-teams resolver:enumerate-operator-seals
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { BASE_URL } from "../../config/env";
// @ts-ignore - plain ESM JS helper
import { get } from "../../data/jira.mjs";

const T = getTarget("sentinel-vault-realm");
const SPACE_KEY = process.env.SENTINEL_SPACE_KEY || "WFH";
const FIXTURE_ATT = "att265945089";
const FIXTURE_NAME = "sv-aql-sealed-fixture.txt";
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

test.describe.configure({ timeout: 180_000, retries: 1 });

test("realm-console directory lists: real space name, initial users, groups, my seals (asUser resolvers)", async ({ page, recorder }) => {
  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + T.deepLink(T.envId), repo: T.repo,
  });

  // The truth identify-realm must match: the space name straight from Confluence. Proves the
  // assertion below is on the resolved value, not on the fallback string.
  const spaces: any = await get(`/wiki/api/v2/spaces?keys=${encodeURIComponent(SPACE_KEY)}`);
  const spaceName: string = spaces?.results?.[0]?.name || "";
  console.log("### REST space name:", JSON.stringify(spaceName));
  expect(spaceName, `REST resolved the ${SPACE_KEY} space name`).toBeTruthy();
  expect(spaceName, "the real name must differ from the UI fallback or the assert is vacuous").not.toBe("Current Space");

  // Arm the wire capture BEFORE navigating: the bootstrap fires enumerate-operator-seals as soon as
  // the console renders (Promise.allSettled at index.jsx:592-598). The Forge bridge POST body carries
  // the function key — the same signal realm-operator-search.spec.ts intercepts on.
  const sealsResponse = page
    .waitForResponse((r) => {
      const rq = r.request();
      return rq.method() === "POST" && (rq.postData() || "").includes("enumerate-operator-seals");
    }, { timeout: 90_000 })
    .catch(() => null);

  await recorder.step("open the realm console", async () => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  }, { expectation: { assertion: "the realm-console space page loads", narrative: "The space page opens for the steward." } });

  const surface = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
  if (surface.kind !== "custom") throw new Error("expected a Custom UI iframe");
  const app = surface.frame;
  await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });

  // A steward sees the "Sealed Files" tab (exact text — "My Sealed Files" is the non-steward tab).
  const sealedFilesTab = app.locator(".tab-navigation .tab-button", { hasText: /^\s*Sealed Files\s*$/ });
  const mySealedFilesTab = app.locator(".tab-navigation .tab-button", { hasText: /My Sealed Files/ });
  const isSteward = (await sealedFilesTab.count()) > 0;
  console.log("### role:", isSteward ? "steward" : "user");

  // ── identify-realm ──────────────────────────────────────────────────────────────────────────
  await recorder.step("identify-realm: Sealed Files heading names the real space", async () => {
    expect(isSteward, "harness user must be a WFH steward to see the Sealed Files heading").toBeTruthy();
    await sealedFilesTab.click();
    const heading = app.locator(".section-header", { hasText: "Sealed Files in" });
    await expect(heading, "Sealed Files heading rendered").toBeVisible({ timeout: 15000 });
    // identify-realm is awaited before first paint (index.jsx:521-528), so the name is final here.
    const text = squash(await heading.innerText());
    console.log("### heading:", JSON.stringify(text));
    expect(text, "heading carries the REST-resolved space name").toContain(spaceName);
    expect(text, "heading is NOT the 'Current Space' failure fallback").not.toContain("Current Space");
  }, { expectation: { assertion: `the Sealed Files heading reads "Sealed Files in ${spaceName}"`, narrative: "identify-realm resolved the space name as the user; the fallback would read 'Current Space'." } });

  // ── enumerate-operators ────────────────────────────────────────────────────────────────────
  await app.locator(".tab-navigation .tab-button", { hasText: /Access Control/ }).click();
  await page.waitForTimeout(1500);
  const stewardCards = app.locator(".steward-card:not(.steward-card-add)");
  const stewardsBefore = await stewardCards.count();
  const userInput = app.locator('input[placeholder="Type to search for users..."]');
  const initialUserRows = app.locator(".search-dropdown .search-result.user-search-result");

  await recorder.step("enumerate-operators: Add Steward shows the initial user list before typing", async () => {
    await app.locator(".steward-card-add").click();
    await expect(userInput, "user search input revealed by Add Steward").toBeVisible({ timeout: 15000 });
    // Focus only — the initial-list branch renders on focus with an EMPTY query (index.jsx:1870-1875,
    // 1946). Typing would route to search-operators instead, which is a different resolver.
    await userInput.click();
    await expect.poll(() => initialUserRows.count(), { timeout: 20000, message: "≥1 initial user row (enumerate-operators) before any typing" }).toBeGreaterThanOrEqual(1);
    expect(await userInput.inputValue(), "nothing was typed — this is the initial list, not a search").toBe("");
    await expect(app.locator(".search-dropdown .search-result", { hasText: "Recent users" }), "the 'Recent users' header proves the initial-list branch").toBeVisible();
    const n = await initialUserRows.count();
    const first = squash(await initialUserRows.first().innerText());
    console.log(`### enumerate-operators: ${n} initial row(s); first = ${JSON.stringify(first)}`);
    expect(first.length, "first row carries a display name").toBeGreaterThan(0);
  }, { expectation: { assertion: "≥1 .user-search-result renders under 'Recent users' with an empty query", narrative: "enumerate-operators populated the initial 10-user list; no search was typed." } });

  await recorder.step("close the user picker without adding anyone", async () => {
    await app.locator(".steward-card-add").click(); // toggles showOperatorSearch off
    await expect(userInput, "user search closed").toBeHidden({ timeout: 10000 });
    expect(await stewardCards.count(), "steward count unchanged (nothing added)").toBe(stewardsBefore);
  }, { expectation: { assertion: "the picker closes and the steward list is unchanged", narrative: "Self-cleaning: no steward was added." } });

  // ── enumerate-teams ────────────────────────────────────────────────────────────────────────
  const groupChips = app.locator(".guild-chips .guild-chip:not(.guild-chip-add)");
  const groupsBefore = await groupChips.count();
  const groupInput = app.locator('input[placeholder="Type to search and select groups..."]');
  const groupRows = app.locator(".steward-guilds .search-dropdown .search-result .user-name");

  await recorder.step("enumerate-teams: '+ Add Group' lists real groups", async () => {
    await app.locator(".guild-chip-add").click();
    // The input only exists once teamList is non-empty — skeletons until enumerate-teams returns
    // (index.jsx:2004-2008). Its appearance is itself the proof the resolver answered.
    await expect(groupInput, "group search input (teamList populated by enumerate-teams)").toBeVisible({ timeout: 30000 });
    // The dropdown opens on focus and closes 200 ms after blur (index.jsx:2016). In the shared
    // suite browser a host-page reflow can steal focus between the click and the poll, leaving
    // the input rendered and the list closed (seen once in-suite, never alone). Re-arming through
    // the change handler is legitimate: onTeamSearch re-opens the list whenever teamList is
    // non-empty, and typing-then-deleting leaves an empty filter, i.e. the full list.
    await groupInput.scrollIntoViewIfNeeded();
    await groupInput.click(); // focus → showTeamDropdown
    for (let attempt = 0; attempt < 4 && (await groupRows.count()) === 0; attempt++) {
      await page.waitForTimeout(1500);
      if ((await groupRows.count()) > 0) break;
      await groupInput.click();
      await groupInput.press("a");
      await groupInput.press("Backspace");
    }
    await expect.poll(() => groupRows.count(), { timeout: 20000, message: "≥1 group row in the Groups dropdown" }).toBeGreaterThanOrEqual(1);
    expect(await groupInput.inputValue(), "no group filter typed").toBe("");
    const n = await groupRows.count();
    const first = squash(await groupRows.first().innerText());
    console.log(`### enumerate-teams: ${n} group row(s); first = ${JSON.stringify(first)}`);
    expect(first.length, "first row carries a group name").toBeGreaterThan(0);
  }, { expectation: { assertion: "≥1 group row renders in the Groups dropdown", narrative: "enumerate-teams populated the group list; nothing selected." } });

  await recorder.step("close the group picker without adding any group", async () => {
    await app.locator(".guild-chip-add").click(); // toggles showGuildSearch off
    await expect(groupInput, "group search closed").toBeHidden({ timeout: 10000 });
    expect(await groupChips.count(), "group chip count unchanged (nothing added)").toBe(groupsBefore);
  }, { expectation: { assertion: "the picker closes and the group chips are unchanged", narrative: "Self-cleaning: no group was added." } });

  // ── enumerate-operator-seals ───────────────────────────────────────────────────────────────
  await recorder.step("enumerate-operator-seals: the bootstrap invoke lists the sealed fixture", async () => {
    const resp = await sealsResponse;
    expect(resp, "the enumerate-operator-seals invoke was observed on the wire during bootstrap").toBeTruthy();
    const status = resp!.status();
    const body = await resp!.text().catch(() => "");
    console.log(`### enumerate-operator-seals: HTTP ${status}, ${body.length} bytes, fixture name present=${body.includes(FIXTURE_NAME)}, id present=${body.includes(FIXTURE_ATT)}`);
    expect(status, "invoke succeeded").toBeLessThan(400);
    // artifactTitle comes from the protection record's attachmentName, refreshed from the live
    // attachment title (sealing/actions.js enumerateOperatorSeals) — the fixture is sealed by Mihai.
    expect(body, `response lists the fixture "${FIXTURE_NAME}" sealed by the harness user`).toContain(FIXTURE_NAME);
    expect(body, `response carries the fixture id ${FIXTURE_ATT}`).toContain(FIXTURE_ATT);
    // Non-steward runs render the tab — then the card itself is the proof, so assert it too.
    if ((await mySealedFilesTab.count()) > 0) {
      await mySealedFilesTab.click();
      const card = app.locator(".artifact-card", { hasText: FIXTURE_NAME });
      await expect(card, "fixture card on My Sealed Files").toBeVisible({ timeout: 20000 });
      console.log("### My Sealed Files tab present → fixture card rendered ✓");
    } else {
      console.log("### My Sealed Files tab not rendered for a steward (index.jsx:1505) — wire proof only");
    }
  }, { expectation: { assertion: `the enumerate-operator-seals response contains "${FIXTURE_NAME}"`, narrative: "The user's own seals list, as the resolver returned it, includes the fixture." } });
});

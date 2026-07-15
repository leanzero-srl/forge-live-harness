// it57 REGRESSION GUARD — the realm-console operator search (Access Control → add a steward).
// The catch block of findOperators used to call an UNDEFINED `setError`, so ANY search-operators
// rejection (offline / 429 / CQL error) threw a ReferenceError that unmounted the WHOLE console.
// This spec proves: (1) the happy path returns results without crashing, and (2) when the
// search-operators invoke FAILS, the console shows a graceful error and stays MOUNTED (no crash).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";

const RC = getTarget("sentinel-vault-realm");

async function openAccessControl(page: any) {
  await page.goto(RC.deepLink(RC.envId)!, { waitUntil: "domcontentloaded" });
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
  const app = (s as any).frame;
  await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });
  // Access Control tab
  const tab = app.locator(".tab-navigation .tab-button", { hasText: /Access Control/i });
  await tab.click();
  await page.waitForTimeout(1200);
  // the user search is revealed by clicking the "Add Steward" card (showOperatorSearch toggle).
  // audit C5: the copy was renamed off "Operator" — the action reads "Add Steward" and the search
  // placeholder reads "Type to search for users..." (the results are directory users, not stewards yet).
  const addCard = app.locator(".steward-card-add");
  await expect(addCard, "Add Steward card present on Access Control").toBeVisible({ timeout: 15000 });
  await expect(app.locator(".steward-card-add", { hasText: /Add Steward/i }), "card copy renamed to 'Add Steward'").toBeVisible();
  await addCard.click();
  const input = app.locator('input[placeholder="Type to search for users..."]');
  await expect(input, "user search input (renamed placeholder) appears after Add Steward").toBeVisible({ timeout: 15000 });
  return { app, input };
}

test.describe.configure({ timeout: 120_000, retries: 1 });

test("operator search: happy path returns without crashing the console", async ({ page }) => {
  const { app, input } = await openAccessControl(page);
  await input.click();
  await input.fill("a");
  await page.waitForTimeout(4000); // debounced CQL search
  // console is still mounted (title + tabs present) — no crash on the normal path
  await expect(app.locator(".space-admin-title"), "console stays mounted after a search").toBeVisible();
  await expect(app.locator(".tab-navigation .tab-button").first()).toBeVisible();
  // either a results dropdown or a graceful "no operators" state — not a blank/broken console
  const body = (await app.locator("body").innerText().catch(() => "")).toLowerCase();
  expect(/could not load|something went wrong|failed to load/i.test(body), "no fatal error banner on happy path").toBeFalsy();
  console.log("### happy path: search ran, console intact ✓");
});

test("operator search FAILURE shows a graceful error and does NOT unmount the console (crash guard)", async ({ page }) => {
  let aborted = 0;
  // abort ONLY the search-operators invoke (its Forge-bridge POST body carries the function key)
  await page.route("**/*", async (route) => {
    const req = route.request();
    const pd = req.method() === "POST" ? (req.postData() || "") : "";
    if (pd.includes("search-operators")) { aborted++; return route.abort("failed"); }
    return route.continue();
  });

  const { app, input } = await openAccessControl(page);
  await input.click();
  await input.fill("zzz");
  await page.waitForTimeout(5000);

  // The intercept must have fired (else the test proves nothing) …
  expect(aborted, "the search-operators invoke was intercepted+failed").toBeGreaterThan(0);
  // … the console is STILL MOUNTED (pre-fix: ReferenceError unmounts it) …
  await expect(app.locator(".space-admin-title"), "console remains mounted after a failed search").toBeVisible();
  await expect(app.locator(".tab-navigation .tab-button", { hasText: /Access Control/i }), "Access Control tab still present").toBeVisible();
  // … and a graceful error surfaced (the it57 setMessage path), not a silent break.
  const body = (await app.locator("body").innerText().catch(() => "")).toLowerCase();
  expect(/search failed|could not|error/i.test(body), "a graceful error message is shown").toBeTruthy();
  console.log(`### crash guard: ${aborted} search-operators call(s) failed → console intact + error shown ✓`);

  await page.unroute("**/*");
});

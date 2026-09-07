// LIVE, NO MODEL TURNS: the two controls 13.12.0 added to the changes card.
//
// The journey spec proves the card SEES a row land while it is open. It never
// presses Refresh on the healthy path — that branch only runs when the poll has
// already failed — so "the button works" was carried as unverified. It costs no
// model quota to settle, so it is settled here rather than described.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { loadCredentialCopy, openAdminSettings } from "./admin-credentials-support";
import { cardButton } from "./chatwise-support";

const T = getTarget("chatwise-admin");

test("the changes card's Refresh is a control, and Last read says when", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!T.envId, "env id unresolved — run `npm run discover`.");
  const copy: any = await loadCredentialCopy();
  const C = copy.CHANGES_CARD;
  expect(C?.heading, "credentialCopy.js exports no changes card").toBeTruthy();

  await assertLoggedIn(page);
  await openAdminSettings(page, T.deepLink(T.envId)!);
  await page.getByText(C.heading, { exact: false }).first().waitFor({ timeout: 60_000 });

  // Let the mount read settle before reading the line it writes.
  let text = "";
  const settle = Date.now() + 30_000;
  for (;;) {
    text = await page.evaluate(() => document.body.innerText);
    if (/Last read/i.test(text) || Date.now() > settle) break;
    await page.waitForTimeout(1_500);
  }
  const readLine = (t: string) => (t.split("\n").find((l) => /Last read|Not read yet/i.test(l)) || "").trim();
  console.log(`[card] on mount: "${readLine(text)}"`);
  expect(
    /Last read/i.test(text),
    `the card never reported when it last read. "${C.neverRead}" and an empty list are the two ` +
      `things this line exists to tell apart.`,
  ).toBe(true);

  /**
   * ⚠️ "Last read just now." IS NOT EVIDENCE OF A READ. The card renders the
   * timestamp through a coarse relative table whose first bucket is "just now",
   * so a button that does nothing at all leaves the same sentence on screen as
   * one that re-read. The only honest oracle for "it issued a read" is the
   * REQUEST, so the invokes are counted across the press.
   */
  const invokes: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (r.method() === "POST" && /invoke|graphql|gateway\/api/i.test(u)) invokes.push(u);
  });
  await page.waitForTimeout(3_000);
  const invokesBefore = invokes.length;
  console.log(`[card] POSTs in the 3s BEFORE the press (the idle control): ${invokesBefore}`);

  // THE BUTTON. Anchored on the heading, because "Refresh" is a word three
  // cards on this page could plausibly carry.
  const btn = cardButton(page, C.heading, C.refresh);
  await expect(btn, `"${C.refresh}" is not inside the "${C.heading}" card on the healthy path`).toHaveCount(1);
  await btn.click({ timeout: 15_000 });

  // The press must produce a READ, and the read must produce a NEW answer: the
  // rows are still there afterwards (a Refresh that empties the card would be
  // worse than none) and the line still says when.
  await page.waitForTimeout(4_000);
  const after = await page.evaluate(() => document.body.innerText);
  console.log(`[card] after pressing "${C.refresh}": "${readLine(after)}"`);
  expect(/Last read/i.test(after), `after "${C.refresh}" the card no longer says when it read`).toBe(true);
  expect(
    after.includes(C.loadErrorTitle),
    `pressing "${C.refresh}" put the card into its load-error state:\n${after.slice(0, 600)}`,
  ).toBe(false);
  const fired = invokes.length - invokesBefore;
  console.log(`[card] POSTs issued across the press: ${fired}`);
  expect(
    fired > 0,
    `pressing "${C.refresh}" issued NO request. "Last read just now." would say the same thing on ` +
      `a button that does nothing, which is why this is measured on the wire and not on the screen.`,
  ).toBe(true);

  const rowsBefore = (text.match(/undo change rv_/g) || []).length;
  const rowsAfter = (after.match(/undo change rv_/g) || []).length;
  console.log(`[card] rows before=${rowsBefore} after=${rowsAfter}`);
  expect.soft(
    rowsAfter >= rowsBefore,
    `"${C.refresh}" LOST rows: ${rowsBefore} -> ${rowsAfter}. A re-read that empties the list is a ` +
      `failure to read rendered as "there are none".`,
  ).toBe(true);
});

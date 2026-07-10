// LIVE BROWSER — workflow CONDITION visibility in the NEW Jira issue view. DOCUMENTS + GUARDS a platform
// FINDING (it40): the new Jira issue-view status dropdown does NOT evaluate Forge app workflow conditions —
// a CogniRunner condition (field-has-value) does NOT hide its transition when the field is empty, and the
// app's condition function is NEVER invoked (zero "condition" execution logs on issue render). So the
// CONDITION feature's "hide transition" behaviour is a NO-OP in the default modern issue view.
//
// This is a JIRA PLATFORM limitation, not a CogniRunner code bug (the condition executor is correct — it33
// unit-verified it; Jira just never calls it here). Conditions were already proven REST-unreachable (it33);
// this proves they're also not honoured by the new-issue-view dropdown.
//
// The test ASSERTS the CURRENT reality (so it passes) AND acts as a TRIPWIRE: if Jira ever starts honouring
// Forge conditions in this view, `shownWhenEmpty`/`condLogs` will flip and this fails → revisit + celebrate.
// Design notes: self-loop transitions never appear in this dropdown (it40) — a NAMED Backlog→In Progress
// transition is used (shows by name); the test only OPENS the menu (never clicks), so the fixture stays put.
import { test, expect } from "../../fixtures/forge";
import { assertLoggedIn } from "../../forge/browser";
import { BASE_URL } from "../../config/env";
// @ts-ignore
import { attachTransition, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { setField, execLogs } from "../../data/cogni-rule-lab.mjs";
// @ts-ignore
import { searchJql } from "../../data/jira.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const TEXT = "customfield_10280";
test.describe.configure({ retries: 1 });

async function openMenuBody(page: any, tag: string): Promise<string> {
  const btn = page.getByRole("button", { name: /^\s*Backlog/i }).first();
  await btn.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `test-results/condvis-${tag}.png` }).catch(() => {});
  const body = await page.evaluate(() => document.body.innerText).catch(() => "");
  await page.keyboard.press("Escape").catch(() => {});
  return body;
}

test("CONDITION visibility — the new Jira issue-view dropdown does NOT honour Forge conditions (documented platform gap)", async ({ page }) => {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  test.skip(!ex.length, "COGTEST fixture missing");
  const key = ex[0].key;
  const tname = `ZCONDVIS-${Date.now()}`;
  await assertLoggedIn(page);
  // field-has-value condition on a NAMED Backlog→In Progress transition. If Jira honoured it, an EMPTY field
  // would HIDE the transition. It does not.
  await attachTransition(WF, "10003", "3", tname, [
    { type: "condition", config: { ruleType: "field-has-value", premadeRuleType: "field-has-value", ruleKind: "premade", fieldId: TEXT } },
  ]);
  try {
    // Field EMPTY — if conditions were honoured the transition would be HIDDEN.
    await setField(key, { [TEXT]: null });
    const since = Date.now();
    await page.goto(`${BASE_URL}/browse/${key}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const emptyBody = await openMenuBody(page, "empty");
    await page.waitForTimeout(2500); // allow any condition log to land
    const condLogs = (await execLogs()).filter((l: any) => l.issueKey === key && l.type === "condition" && Date.parse(l.timestamp) >= since - 2000);

    const menuOpened = /view workflow/i.test(emptyBody);
    const shownWhenEmpty = emptyBody.includes(tname);
    console.log(`RESULT: menuOpened=${menuOpened} shownWhenEmpty=${shownWhenEmpty} condLogsOnRender=${condLogs.length}`);
    expect(menuOpened, "the transition popup opened").toBe(true);

    // DOCUMENTED PLATFORM GAP (tripwire): the transition is shown despite the empty field, AND Jira never
    // evaluated the app condition on render (no condition log). If either flips, Jira changed → revisit.
    expect(shownWhenEmpty, "TRIPWIRE: transition still SHOWN with empty field (new-view ignores Forge conditions)").toBe(true);
    expect(condLogs.length, "TRIPWIRE: Jira did NOT invoke the app condition on issue-view render").toBe(0);
  } finally {
    await detachByNamePrefix(WF, "ZCONDVIS-").catch(() => {});
    await setField(key, { [TEXT]: null }).catch(() => {});
  }
});

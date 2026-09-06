// Does each NEW assertion actually discriminate? Each predicate is run against
// text/values captured from the REAL live runs (the positive) and against the
// value the run would have produced had the thing under test been broken (the
// negative). A predicate that answers the same to both proves nothing.
const cases = [];
const check = (name, pred, good, bad) =>
  cases.push({ name, pass: pred(good) === true, failsOnBad: pred(bad) === false });

// 1. gates: allowJiraAdminTools=true on the admin turn
const adminLine = "[Consumer] toolset: profile=standard allowDestructive=false(admin-off) allowJiraAdminTools=true allowSiteToken=false(no-credential) allowOrgAdmin=false(no-credential)";
const scrubLine = "[Consumer] toolset: profile=standard allowDestructive=false(admin-off) allowJiraAdminTools=false(not-this-persona) allowSiteToken=false(not-this-persona) allowOrgAdmin=false(not-this-persona)";
check("gates: allowJiraAdminTools=true", (s) => /allowJiraAdminTools=true/.test(s), adminLine, scrubLine);
check("gates: allowSiteToken=false(no-credential)", (s) => /allowSiteToken=false\(no-credential\)/.test(s), adminLine, scrubLine);
check("gates: scrubber is not-this-persona", (s) => /allowJiraAdminTools=false\(not-this-persona\)/.test(s), scrubLine, adminLine);

// 2. panel anti-vacuity guard — the exact line the broken run produced
const panelGood = "[Consumer] toolset: profile=issue-panel allowJiraAdminTools=true allowSiteToken=false(no-credential)";
const panelBad  = "[Consumer] toolset: profile=issue-panel allowJiraAdminTools=false(not-this-persona) allowSiteToken=false(not-this-persona)";
check("panel: the turn ran as the admin persona", (s) => /allowJiraAdminTools=true/.test(s), panelGood, panelBad);

// 3. panel: the reply names a rule kind (real reply vs the ordinary-summary reply it wrongly captured)
const rules = 'The three transitions visible from New are: Reject work (has 1 condition), UAT (has 1 condition)... The "Accepted by Client" transition itself has 1 condition: it is restricted by group';
const summary = "This is a test ticket, not a piece of real work. Status: New. Assignee: Mihai Perdum.";
check("panel: reply names a rule kind", (s) => /condition|validator|post[- ]?function/i.test(s), rules, summary);

// 4. site-token: the reply attributes the stored administrator
const authGood = "I read this as the administrator who stored the site token, not as you.";
const authBad  = "I read the screen configuration for WFH and here is what it says.";
check("site-token: reply attributes the authority",
  (s) => /stored (site )?admin(istrator)?|token owner|administrator who stored|as the administrator/i.test(s),
  authGood, authBad);

// 5. site-token: the no-credential refusal names a way through
const heading = "Jira site admin token";
const refusalGood = 'No site admin token is stored. A ChatWise admin adds it at Apps -> Manage apps -> ChatWise -> Settings, on the "Jira site admin token" card.';
const refusalBad  = "I cannot read the screen configuration.";
const namesRoute = (s) => new RegExp(heading, "i").test(s) || (/site admin(istrator)? token/i.test(s) && /settings|manage apps|ChatWise admin/i.test(s));
check("site-token: refusal names a way through", namesRoute, refusalGood, refusalBad);

// 6. org: the users answer is not a false empty (the REAL failing reply is the negative)
const usersBad = "The user directory listing returned 0 accounts, with no further pages to fetch.";
const usersGood = "There are 15 accounts: Adrian, Alexandru Curea, Daniel Paduraru, Mihai Perdum ...";
const realNames = ["Adrian", "Alexandru Curea", "Daniel Paduraru"];
check("org: the reply names real directory people",
  (s) => realNames.some((n) => s.includes(n)), usersGood, usersBad);

// 7. org: createPolicy preview says the undo DISABLES
const disGood = "Undoing this will DISABLE the policy — Atlassian documents no way to delete one.";
const disBad  = "This can be undone at any time within 30 days.";
check("org: createPolicy preview says disables",
  (s) => /disable|switch(ed)? off|not (be )?(deleted|removed)/i.test(s), disGood, disBad);

// 8. lockout: the re-ticket says it includes you
check("org: lockout re-ticket says AND IT INCLUDES YOU",
  (s) => /AND IT INCLUDES YOU/i.test(s),
  "This removes 1 account AND IT INCLUDES YOU: if it goes through you may not be able to undo it.",
  "## No change was made — same failure as before. I retried it, since you confirmed.");

// 9. revertId extraction — the exact false positive the first run produced
const rv = (t) => (t.match(/\b(rv_[a-z0-9]+_[a-z0-9]{6,})\b/) || [])[1] || null;
check("revertId: matches rv_ and not a group UUID",
  (t) => rv(t) === "rv_m1abcd_9f2k3l7q0z",
  "Recorded as rv_m1abcd_9f2k3l7q0z so it can be undone.",
  "the group id is 724412af-fe13-40da-81f7-049f5990e5e8");
check("revertId: a bare UUID no longer matches", (t) => rv(t) === null,
  "the group id is 724412af-fe13-40da-81f7-049f5990e5e8",
  "Recorded as rv_m1abcd_9f2k3l7q0z");

// 10. the ledger card empty state
const cardGood = "Recent changes made with stored credentials\nNo changes have been made with a stored credential.";
const cardBad = "Recent changes made with stored credentials\n";
const cols = ["What changed", "Object", "Who", "When", "State"];
check("ledger card: empty sentence or columns",
  (s) => s.includes("No changes have been made with a stored credential.") || cols.every((c) => s.includes(c)),
  cardGood, cardBad);

// 11. the email leak, as a DIFFERENCE
check("settings: email occurrences did not increase",
  (v) => v.after <= v.before, { before: 2, after: 2 }, { before: 2, after: 3 });

// 12. Last accepted by Atlassian moves
check("settings: the Test stamp moves",
  (v) => v.second !== v.first,
  { first: "Last accepted by Atlassian: 9/6/2026, 2:33:01 PM", second: "Last accepted by Atlassian: 9/6/2026, 2:34:27 PM" },
  { first: "Last accepted by Atlassian: 9/6/2026, 2:33:01 PM", second: "Last accepted by Atlassian: 9/6/2026, 2:33:01 PM" });

// 13. withheld is not called
const withheldLine = { text: "[Tools] getScreenConfiguration is withheld this turn — not executed" };
const calledLine = { text: '[Tools] getScreenConfiguration {projectKey:"WFH"} (user: 712020:x)' };
const isCall = (l) => /^\[Tools\] getScreenConfiguration\b/.test(l.text) && !/is withheld this turn/.test(l.text);
check("tool-call counting excludes withheld", (l) => isCall(l) === true, calledLine, withheldLine);

// 14. the asUser status: a sub-request failure must not decide the row
const rowStatus = (lines) => {
  const outcome = lines.filter((t) => /^\[Tools\] getWorkflowScheme(\(|:)/.test(t) && !/ failed:/.test(t));
  const failed = lines.filter((t) => /^\[Tools\] .*getWorkflowScheme.* failed:/.test(t));
  return outcome.length ? "200" : failed.length ? (failed[0].match(/failed:\s*(\d{3})/) || [])[1] : "not-called";
};
check("asUser: a draft 404 does not become the tool's status",
  (ls) => rowStatus(ls) === "200",
  ['[Tools] getWorkflowScheme(WFH) draft failed: 404 {"errorMessages":["no draft"]}',
   "[Tools] getWorkflowScheme(WFH): 1 issue-type mapping(s), draft=false"],
  ['[Tools] getWorkflowScheme(WFH) failed: 403 {"errorMessages":["forbidden"]}']);


// 18. the radius-drift assertion — the one the write cycle turns on
const driftLine = "[Confirmation] applyOrgChange: blast radius changed since approval — refusing";
const cleanLine = "[Confirmation] applyOrgChange: same-turn redemption refused (no prior disclosure)";
const noDrift = (lines) => lines.filter((t) => /^\[Confirmation\].*blast radius changed/.test(t)).length === 0;
check("write-cycle: a radius refusal is detected", (ls) => noDrift(ls) === true,
  ["[Tools] applyOrgChange {op:\"createPolicy\"}", cleanLine],
  ["[Tools] applyOrgChange {op:\"createPolicy\"}", driftLine]);

// 19. the undo id must be STATED
const stated = (t) => /\b(rv_[a-z0-9]+_[a-z0-9]{6,})\b/.test(t);
check("write-cycle: the undo id is stated in the reply", (t) => stated(t) === true,
  "Done. This can be undone for 30 days — reference undo id rv_mtpysogl_naclcnakiu.",
  "Done. This change can be undone for 30 days — just ask and I can revert it.");

// 20. the lockout re-ticket, as a property rather than a phrase
const toldItIsThem = (t) =>
  /AND IT INCLUDES YOU/i.test(t) ||
  (/your own|includes you|you are (one of|in)|yourself/i.test(t) &&
    /nothing has changed|still want|go ahead\?|confirm again|one more time/i.test(t));
check("write-cycle: the re-ticket says the set includes the caller", (t) => toldItIsThem(t) === true,
  "This one comes back to you one more time — deliberately, because it's your own access. Nothing has changed yet. Do you still want to go ahead?",
  "Done — the account has been removed from the group.");

let bad = 0;
for (const c of cases) {
  const ok = c.pass && c.failsOnBad;
  if (!ok) bad++;
  console.log(`${ok ? "DISCRIMINATES" : "!! DOES NOT   "}  ${c.name}  (green-on-real=${c.pass}, red-on-broken=${c.failsOnBad})`);
}
console.log(`\n${cases.length - bad}/${cases.length} predicates proven able to fail.`);
process.exit(bad ? 1 : 0);

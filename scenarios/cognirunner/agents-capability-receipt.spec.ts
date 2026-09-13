// LIVE BROWSER — F-501 / F-502 on the surface a human actually reads: the Agents tab
// renders a capability-gated tick as a SOLID RED copy row with a title and a remedy.
//
// WHY THIS CANNOT RUN ON DEV. F-485 refuses the creation of any Virtual Administrator on
// an instance whose capability is off, and dev is Standard (needs-coder-edition), so no
// agent can exist there to carry a receipt. The agent is created on STAGING with the
// agent model flipped to a frontier model and the capability then taken away MID-LIFE
// (test-harness/scripts/va-capability-gate-live.mjs --flip-model --keep), which is also
// the life a real agent has when a licence or model changes underneath it.
//
// WHAT F-501 AND F-502 ACTUALLY CLAIM, and what would disprove them here:
//   F-501 the gate reaches the tab. `publicReceipt` used to rebuild `gate` from the
//         reason and never read the stored field, so `gate:"capability"` never arrived
//         and the row would fall through to the plain `.va-receipt-skip` branch printing
//         a raw id. A `.va-receipt-cap` element existing at all is the positive evidence.
//   F-502 the tick is marked FAILED, not ok.
//
// THE WORDS ARE THE APP'S OWN. Title and remedy are compared to agentCapabilityCopy()
// from the deployed shared module, keyed on the reason the instance itself reports — so
// this spec cannot pass by agreeing with a string retyped here that has since drifted.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");
const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;
const ACCT = process.env.HARNESS_ADMIN_ACCOUNT_ID;
const AGENT_ID = process.env.VA_AGENT_ID;
test.describe.configure({ retries: 1 });

async function call(functionKey: string, payload: any = {}): Promise<any> {
  const r = await fetch(HOOK!, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "invokeResolver", functionKey, payload, accountId: ACCT }),
  });
  if (!r.ok) throw new Error(`hook ${functionKey} ${r.status}`);
  return r.json();
}

test("F-501/F-502 the Agents tab renders the capability refusal in solid red", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  test.skip(!HOOK || !SECRET || !ACCT || !AGENT_ID, "COGNI_TESTHOOK_URL / HARNESS_SECRET / HARNESS_ADMIN_ACCOUNT_ID / VA_AGENT_ID not set");

  // THE ORACLE, read before the browser: the instance's capability and the agent's own
  // receipt. The UI assertions below are derived from these, never from constants.
  const cap = await call("getAgentCapability");
  const status = await call("getVaStatus", { jobId: AGENT_ID });
  const prep = (status.receipts || []).filter((r: any) => r.phase === "prepare")[0];
  const gateRow = ((prep && prep.skipped) || []).find((s: any) => s && s.itemKey === null);
  console.log("capability ->", JSON.stringify(cap));
  console.log("prepare receipt ->", JSON.stringify(prep));
  expect(cap.enabled, "this spec proves the REFUSAL; the instance must be incapable").toBe(false);
  expect(gateRow, "the agent must already carry a capability-gated receipt").toBeTruthy();
  expect(gateRow.gate, "F-501 at the resolver, before the UI is even opened").toBe("capability");
  expect(prep.ok, "F-502 at the resolver").toBe(false);

  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module, moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });

  await assertLoggedIn(page);
  await recorder.step("open admin panel", async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); });
  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("expected a Custom-UI iframe");
  await expect(frame.locator(".tab-btn").first()).toBeVisible({ timeout: 20_000 });

  await recorder.step("go to Agents tab and expand the agent", async () => {
    await frame.locator(".tab-btn", { hasText: /^\s*Agents\s*$/ }).first().click();
    /*
     * THE LIST SHOWS THE PERSONA NAME, NOT THE JOB NAME. The card renders
     * `.va-agent-name` from `va.persona.name` ("Cap"), while `listVaAgents` reports the
     * JOB's name ("F-482 capability proof"). Looking for the job name found nothing and
     * read as "the agent is not listed" - a false negative about the app. The card is
     * located structurally instead, and the count is asserted so a silent empty list
     * cannot pass either.
     */
    const card = frame.locator(".card.va-agent").first();
    await expect(card, "the agent this run left in place must be listed").toBeVisible({ timeout: 25_000 });
    console.log("agent card name:", (await card.locator(".va-agent-name").innerText()).trim());
    /*
     * TWO DOORS, NOT ONE. Expanding the row reveals `.va-detail`, whose DEFAULT pane is
     * "Staged replies" - empty on a gated agent, which is exactly right and exactly
     * useless here. The receipts live behind the "Ticks" pane, so the expander alone
     * found no receipt and read as "the gate did not reach the tab".
     */
    await card.locator("button.rule-expand-btn").first().click();
    await expect(card.locator(".va-detail")).toBeVisible({ timeout: 20_000 });
    await card.locator("button.va-pane-btn", { hasText: /^Ticks$/ }).first().click();
    await expect(frame.locator(".va-receipt-cap, .va-receipt-skip").first(), "a receipt must render on the Ticks pane").toBeVisible({ timeout: 25_000 });
  });

  await recorder.step("F-501: the gate reached the tab as a COPY ROW, not a raw id", async () => {
    // THE DISPROOF IS THE OTHER BRANCH. If `gate` had not reached the tab, gateCopy()
    // would have fallen through to `.va-receipt-skip` and printed the bare reason.
    const raw = frame.locator(".va-receipt-skip", { hasText: cap.reason });
    expect(await raw.count(), "a raw reason id in .va-receipt-skip means the gate did NOT reach the tab").toBe(0);
    await expect(frame.locator(".va-receipt-cap").first()).toBeVisible({ timeout: 15_000 });
  }, { expectation: { assertion: "the capability skip renders through the copy-row branch", narrative: "publicReceipt carried the stored gate through, so the tab has words instead of an id." } });

  await recorder.step("the title and the remedy are the app's own words", async () => {
    const capRow = frame.locator(".va-receipt-cap").first();
    const title = (await capRow.locator(".va-receipt-cap-title").innerText()).trim();
    const text = (await capRow.locator(".va-receipt-cap-text").innerText()).trim();
    console.log(`agents-tab capability row: title="${title}" remedy="${text}"`);

    const { agentCapabilityCopy } = await import(process.env.HOME + "/Projects/CogniRunner/src/shared/edition.js");
    const expected = agentCapabilityCopy(cap.reason);
    expect(title).toBe(expected.title);
    expect(text).toBe(expected.remedy);

    const all = title + " " + text;
    expect(all, "no raw object may reach a human").not.toContain("[object Object]");
    expect(all, "no machine-readable id may reach a human").not.toContain(cap.reason);
    expect(all).not.toContain("undefined");
  }, { expectation: { assertion: "title + remedy equal agentCapabilityCopy(reason) exactly", narrative: "One home for those words, shared with the Code tab, the Coder panel and the Listeners tab." } });

  await recorder.step("it is SOLID RED with white text, and has no left accent rail", async () => {
    const style = await frame.locator(".va-receipt-cap").first().evaluate((el: Element) => {
      const cs = getComputedStyle(el as HTMLElement);
      return { background: cs.backgroundColor, color: cs.color, borderLeftWidth: cs.borderLeftWidth, opacity: cs.opacity };
    });
    console.log("computed style:", JSON.stringify(style));
    // #dc2626 light / #ef4444 dark — a SOLID fill, not a low-alpha tint.
    expect(style.background).toMatch(/^rgba?\(\s*(220,\s*38,\s*38|239,\s*68,\s*68)/);
    expect(style.background, "a faded tint would carry an alpha below 1").not.toMatch(/,\s*0?\.\d+\s*\)$/);
    expect(style.color).toBe("rgb(255, 255, 255)");
    expect(style.borderLeftWidth, "the owner's rule: never a left accent rail").toBe("0px");
  }, { expectation: { assertion: "solid #dc2626/#ef4444 fill, white text, border-left 0", narrative: "The owner's design rules: solid saturated colour, no faded tints, no left rail." } });

  await recorder.step("F-502: the tick is shown as FAILED", async () => {
    await expect(frame.locator(".va-receipt-failed").first(), "ok:false must render as FAILED").toBeVisible({ timeout: 10_000 });
  }, { expectation: { assertion: "the receipt renders a FAILED marker", narrative: "A tick the engine stopped at a gate is not shown as a healthy one." } });
});

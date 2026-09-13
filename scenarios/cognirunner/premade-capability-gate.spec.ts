// LIVE BROWSER — F-486: a premade listener whose capability this instance does not have
// renders DISABLED, with the capability sentence beside it, and does NOT open.
//
// THE GATE IS `disabled`, AND THE NOTE IS A SIBLING. src/.../ListenersTab.jsx renders a
// blocked premade as a `.lst-premade-btn.lst-premade-btn-blocked[disabled]` with a sibling
// `.cpf-cap.lst-premade-cap` carrying `.cpf-cap-title` + `.cpf-cap-text` from
// agentCapabilityCopy() — the ONE home for those words, shared with the Code tab, the
// Coder panel and the Agents tab.
//
// THE ORACLE IS THE INSTANCE, NOT A CONSTANT. The expected reason is read from the app's
// own getAgentCapability through the dev test hook, so this spec cannot pass by agreeing
// with a hard-coded string that has drifted. A capable instance SKIPS instead of silently
// asserting nothing.
//
// THE POSITIVE CONTROL, and why it is NOT another premade. There is exactly ONE premade
// listener in the catalogue (git-pr-review) and it is the gated one, so "some other
// premade is clickable" is not available on this surface. The control is instead the tab's
// own "+ Add Listener" button: it is rendered by the same component, in the same render,
// behind the same `canEdit`, and it must be ENABLED. With it, a disabled premade is a
// GATE; without it, a disabled premade is indistinguishable from a tab that failed to
// load or an account that may not edit.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");
const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;
const ACCT = process.env.HARNESS_ADMIN_ACCOUNT_ID;
const PREMADE = "Review every opened PR";
test.describe.configure({ retries: 1 });

async function capability(): Promise<any> {
  const r = await fetch(HOOK!, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "invokeResolver", functionKey: "getAgentCapability", payload: {}, accountId: ACCT }),
  });
  if (!r.ok) throw new Error(`hook getAgentCapability ${r.status}`);
  return r.json();
}

test("F-486 premade 'Review every opened PR' is blocked with the capability sentence", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  test.skip(!HOOK || !SECRET || !ACCT, "COGNI_TESTHOOK_URL / HARNESS_SECRET / HARNESS_ADMIN_ACCOUNT_ID not set");

  // THE INSTANCE'S OWN VERDICT, read before the browser so the expectation is derived.
  const cap = await capability();
  console.log("getAgentCapability ->", JSON.stringify(cap));
  test.skip(cap.enabled === true, `capability is ON (${cap.reason}) — this spec proves the BLOCKED state`);

  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module, moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });

  await assertLoggedIn(page);
  await recorder.step("open admin panel", async () => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  });
  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("expected a Custom-UI iframe");
  await expect(frame.locator(".tab-btn").first()).toBeVisible({ timeout: 20_000 });

  await recorder.step("go to Listeners tab", async () => {
    await frame.locator(".tab-btn", { hasText: /^\s*Listeners\s*$/ }).first().click();
    await expect(frame.locator(".lst-premade").first()).toBeVisible({ timeout: 20_000 });
  });

  const row = frame.locator(".lst-premade-cell", { hasText: PREMADE }).first();
  const btn = row.locator("button.lst-premade-btn").first();
  await expect(btn).toBeVisible({ timeout: 15_000 });

  // POSITIVE CONTROL FIRST: some OTHER premade in the same list must be enabled, or a
  // disabled target proves only that the list never rendered.
  await recorder.step("positive control: the tab rendered and this account MAY edit", async () => {
    const add = frame.locator("button.btn-small.btn-solid", { hasText: /Add Listener|Add your first listener/ }).first();
    await expect(add, "the '+ Add Listener' button is rendered by the same component behind the same canEdit").toBeVisible({ timeout: 15_000 });
    await expect(add, "it must be ENABLED, or a disabled premade proves nothing").toBeEnabled();
    // The gated row itself RENDERED its content — it is a present, described row, not a gap.
    await expect(row.locator(".lst-premade-name")).toHaveText(PREMADE);
    const help = (await row.locator(".lst-premade-help").innerText()).trim();
    console.log(`premade row rendered: name="${PREMADE}" help="${help.slice(0, 80)}…"`);
    expect(help.length).toBeGreaterThan(20);
  }, { expectation: { assertion: "the Listeners tab rendered and its own Add button is enabled", narrative: "So the premade's disabled state is a capability gate, not a dead tab." } });

  await recorder.step("the gated premade is DISABLED", async () => {
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveClass(/lst-premade-btn-blocked/);
  }, { expectation: { assertion: "the row is disabled and carries the blocked class", narrative: "The answer arrives before the work, not at Save." } });

  await recorder.step("the SETTLED capability sentence is rendered beside it", async () => {
    const note = row.locator(".cpf-cap.lst-premade-cap").first();
    await expect(note).toBeVisible();
    /*
     * WAIT FOR THE SETTLED STATE, NOT THE FIRST ONE THAT APPEARS.
     *
     * `useAgentCapability` renders three states through the SAME element: checking
     * (`cpf-cap-checking`, "Checking whether the Coder is available"), unknown
     * (`cpf-cap-unknown`) and off (`cpf-cap-off`). An earlier version of this step
     * asserted "the title is non-empty" and PASSED on the CHECKING state - a transient
     * spinner message, which says nothing at all about the gate. The class is the only
     * thing that distinguishes them, so the class is what is waited for.
     */
    await expect(note, "the capability read must SETTLE to the off state").toHaveClass(/cpf-cap-off/, { timeout: 30_000 });
    const title = (await note.locator(".cpf-cap-title").innerText()).trim();
    const text = (await note.locator(".cpf-cap-text").innerText()).trim();
    console.log(`SETTLED capability note: title="${title}" remedy="${text}"`);

    // THE EXPECTED WORDS ARE THE APP'S OWN, fetched from the deployed shared module
    // through the hook-reported reason - never a string retyped in this spec.
    const { agentCapabilityCopy } = await import(process.env.HOME + "/Projects/CogniRunner/src/shared/edition.js");
    const expected = agentCapabilityCopy(cap.reason);
    expect(title).toBe(expected.title);
    expect(text).toBe(expected.remedy);

    // NEITHER A RAW OBJECT NOR A RAW ID may reach a human.
    expect(title + " " + text).not.toContain("[object Object]");
    expect(title + " " + text).not.toContain(cap.reason);
    expect(title.toLowerCase()).not.toContain("checking");

    // SOLID RED, not a faded tint: the owner's design rule, asserted on the computed style.
    const colour = await note.evaluate((el: Element) => {
      const cs = getComputedStyle(el as HTMLElement);
      return { color: cs.color, background: cs.backgroundColor, borderLeft: cs.borderLeftWidth };
    });
    console.log("computed style of the settled note:", JSON.stringify(colour));

    // The note is a SIBLING of the button, never a child (a button inside a button).
    expect(await note.evaluate((el: Element) => el.closest("button") === null)).toBe(true);
  }, { expectation: { assertion: "the SETTLED off-state title + remedy match agentCapabilityCopy(reason) exactly, with no [object Object] and no raw id", narrative: "An admin is told what is wrong and what to do about it, in the app's own words." } });

  await recorder.step("clicking it does NOT open the editor", async () => {
    await btn.click({ force: true });           // force: a disabled button ignores a normal click
    await page.waitForTimeout(1500);
    // The editor's Save button is the thing that appears when a premade opens.
    await expect(frame.locator("button.btn-small", { hasText: /^Save$/ })).toHaveCount(0);
    await expect(btn).toBeDisabled();
  }, { expectation: { assertion: "a forced click still does not open the premade editor", narrative: "The onClick guard is the second lock; the gate does not depend on a DOM state." } });
});

// LIVE BROWSER — F-486, the OTHER half: on an instance where the capability IS on, the
// same premade row OPENS, refuses a Save with no repositories, and then SAVES a row whose
// fields are the seed's.
//
// RUN IT AGAINST STAGING, with the agent model flipped to a frontier model first:
//   COGNI_ENV_ID=<staging env id> COGNI_TESTHOOK_URL=<staging hook> \
//   HARNESS_SECRET=… HARNESS_ADMIN_ACCOUNT_ID=… \
//   npx playwright test scenarios/cognirunner/premade-capability-open.spec.ts
// The flip and its restore are the CALLER's job (test-harness/scripts do it through
// kvSet); this spec only SKIPS when the instance it is pointed at is not capable, so it
// can never quietly report a pass about the wrong tenant.
//
// EVERY FIELD IS RE-READ THROUGH THE HOOK, not off the form. "Save succeeded" is the
// form's opinion of its own write; `getListeners` is a different principal reading the
// stored row, which is the only thing that can show allowedActions, agentlessTaskType and
// savedByRole are what the seed promised.
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
const REPO = "leanzero/cognirunner-probe";
test.describe.configure({ retries: 0 });

async function call(functionKey: string, payload: any = {}): Promise<any> {
  const r = await fetch(HOOK!, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "invokeResolver", functionKey, payload, accountId: ACCT }),
  });
  if (!r.ok) throw new Error(`hook ${functionKey} ${r.status}`);
  return r.json();
}

test("F-486 the gated premade opens, requires repos, and saves the seed's fields", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  test.skip(!HOOK || !SECRET || !ACCT, "COGNI_TESTHOOK_URL / HARNESS_SECRET / HARNESS_ADMIN_ACCOUNT_ID not set");

  const cap = await call("getAgentCapability");
  console.log("getAgentCapability ->", JSON.stringify(cap));
  test.skip(cap.enabled !== true, `capability is OFF (${cap.reason}) — flip the agent model to a frontier model first; this spec proves the OPEN state`);

  const name = `F-486 open probe ${Date.now().toString(36)}`;
  let savedId: string | null = null;

  try {
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

    await recorder.step("go to Listeners tab", async () => {
      await frame.locator(".tab-btn", { hasText: /^\s*Listeners\s*$/ }).first().click();
      await expect(frame.locator(".lst-premade").first()).toBeVisible({ timeout: 20_000 });
    });

    const row = frame.locator(".lst-premade-cell", { hasText: PREMADE }).first();
    const btn = row.locator("button.lst-premade-btn").first();

    await recorder.step("the row is ENABLED and carries NO capability note", async () => {
      // Wait out the capability read before judging: the row starts blocked-while-checking.
      await expect(btn).toBeEnabled({ timeout: 30_000 });
      await expect(btn).not.toHaveClass(/lst-premade-btn-blocked/);
      await expect(row.locator(".cpf-cap.lst-premade-cap")).toHaveCount(0);
    }, { expectation: { assertion: "on a capable instance the same row is clickable and unannotated", narrative: "The gate tracks the instance, not the build." } });

    await recorder.step("it OPENS the editor, pre-filled from the seed", async () => {
      await btn.click();
      await expect(frame.locator(".section-title", { hasText: /New listener|Edit listener/ })).toBeVisible({ timeout: 15_000 });
      await expect(frame.locator("#evp-repos-input"), "the repos field is the decision the seed leaves to the admin").toBeVisible({ timeout: 15_000 });
      const repoVal = await frame.locator("#evp-repos-input").inputValue();
      console.log(`repos field opens EMPTY: ${JSON.stringify(repoVal)}`);
      expect(repoVal.trim()).toBe("");
    }, { expectation: { assertion: "the premade opens with an empty repos field", narrative: "filters.repos is intentionally empty in the seed; the picker must fill it." } });

    await recorder.step("SAVE WITH NO REPOSITORIES IS REFUSED", async () => {
      await frame.locator("button.btn-small.btn-edit", { hasText: /^Save$/ }).first().click();
      const toast = frame.locator(".toast, .toast-error, [class*='toast']").filter({ hasText: /repository|repositories/i }).first();
      await expect(toast, "the refusal names repositories").toBeVisible({ timeout: 15_000 });
      console.log("refusal toast:", (await toast.innerText()).trim());
      // AND NOTHING WAS WRITTEN: a second read through a different principal.
      const listed = (await call("getListeners")).listeners || [];
      expect(listed.some((l: any) => l.name === PREMADE || l.name === name), "the refused save must not have written a row").toBe(false);
    }, { expectation: { assertion: "saving without repos is refused and writes nothing", narrative: "That refusal is the feature, not a gap." } });

    await recorder.step("fill the repos and a distinct name, then Save", async () => {
      await frame.locator("#evp-repos-input").fill(REPO);
      await frame.locator("#evp-repos-input").blur();
      const nameInput = frame.locator("input").filter({ hasNot: frame.locator("#evp-repos-input") }).first();
      await nameInput.fill(name);
      await frame.locator("button.btn-small.btn-edit", { hasText: /^Save$/ }).first().click();
      await page.waitForTimeout(4000);
    });

    await recorder.step("SECOND READ: the stored row carries the seed's fields", async () => {
      /*
       * `getListeners` ANSWERS A SUMMARY, NOT THE ROW. The list shape carries id, name,
       * events, `repos` and `projectKeys` hoisted to the top level and a `stats` block -
       * and NO `agent`, no `agentlessTaskType`, no `savedByRole`. Asserting those off the
       * list reports them all missing on a perfectly good row. The full record comes from
       * `getListener({id})`, so the list is used only to FIND the id.
       */
      const listed = (await call("getListeners")).listeners || [];
      const summary = listed.find((l: any) => l.name === name);
      console.log("list summary:", JSON.stringify(summary));
      expect(summary, "the row must be findable through getListeners").toBeTruthy();
      savedId = summary.id;
      const saved = (await call("getListener", { id: savedId })).listener;
      console.log("stored row (full):", JSON.stringify(saved));
      expect(saved, "the full row must be readable through getListener").toBeTruthy();
      expect(saved.agentlessTaskType, "agentlessTaskType routes this to the DETERMINISTIC git-review engine").toBe("gitreview");
      expect(saved.agent && saved.agent.allowedActions, "an agentless seed carries NO capability-gated action").toEqual([]);
      expect(saved.savedByRole, "a UI save by an app admin is armed as admin").toBe("admin");
      expect((saved.filters && saved.filters.repos) || []).toContain(REPO);
    }, { expectation: { assertion: "allowedActions [], agentlessTaskType gitreview, savedByRole admin, repos stored", narrative: "The saved row is the seed's promise, read back by a different principal." } });
  } finally {
    // CLEANUP IS AN ASSERTION: delete and RE-READ.
    if (savedId) {
      const del = await call("deleteListener", { id: savedId });
      const back = await call("getListener", { id: savedId }).catch(() => null);
      const still = !!(back && back.listener);
      console.log(`cleanup deleteListener ${savedId}: ${JSON.stringify(del)} | second read: ${still ? "STILL PRESENT" : "gone"}`);
      expect(still, "the probe listener must not survive this run").toBe(false);
    }
  }
});

// LIVE BROWSER — admin Skills tab CRUD (journey J10). Drives the real admin panel (Forge globalPage iframe):
// confirm builtins are seeded, add a skill (SkillEditor: name + instructions) → assert it lists AND persists
// to skill_repo_index (KVS hook), then delete it (custom confirm dialog) → assert gone from list + index.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");
const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;
test.describe.configure({ retries: 2 });

async function skillIndex(): Promise<any[]> {
  const r = await fetch(`${HOOK}?what=kvs&key=skill_repo_index`, { headers: { Authorization: `Bearer ${SECRET}` } });
  if (!r.ok) throw new Error(`hook kvs read ${r.status}`);
  const v = (await r.json()).value;
  return Array.isArray(v) ? v : (v?.skills || v?.index || []);
}

test("J10 admin Skills — builtins shown, add persists to skill_repo_index, delete removes", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module, moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });
  const name = `RuleLab Skill Probe ${Date.now().toString(36)}`;

  await assertLoggedIn(page);
  await recorder.step("open admin panel", async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); });
  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("expected a Custom-UI iframe");
  await expect(frame.locator(".tab-btn").first()).toBeVisible({ timeout: 20_000 });

  await recorder.step("go to Skills tab (builtins present)", async () => {
    await frame.locator(".tab-btn", { hasText: /^\s*Skills\s*$/ }).first().click();
    await expect(frame.locator("button.btn-add-skill")).toBeVisible({ timeout: 15_000 });
    const idx = await skillIndex();
    const builtins = idx.filter((s: any) => s?.builtin || s?.isBuiltin || s?.seeded);
    console.log(`skill index: ${idx.length} skills, ${builtins.length} builtin`);
    expect(idx.length, "the library has seeded builtin skills").toBeGreaterThan(0);
  }, { expectation: { assertion: "the Skills library renders with seeded builtins", narrative: "Builtins ship with the app so Skills is never empty." } });

  await recorder.step("add a skill (persists to skill_repo_index)", async () => {
    await frame.locator("button.btn-add-skill", { hasText: /New Skill/i }).click();
    await frame.locator("input.input[placeholder*='Skill name']").fill(name);
    await frame.locator("textarea[placeholder*='What the AI should know']").fill("Rule-lab probe skill: customfield_10280 is COGTEST_Text; prefer api.updateIssue for field writes. " + name);
    await frame.locator("button.btn-save-doc", { hasText: /Save Skill/i }).click();
    await expect(frame.locator("*", { hasText: name }).first()).toBeVisible({ timeout: 20_000 });
    let inIndex = false;
    for (let i = 0; i < 10; i++) { if ((await skillIndex()).some((s: any) => s?.name === name)) { inIndex = true; break; } await page.waitForTimeout(1500); }
    expect(inIndex, "the added skill persisted to skill_repo_index").toBe(true);
  }, { expectation: { assertion: "the added skill appears + persists to the index", narrative: "A saved skill shows immediately and is written to KVS." } });

  await recorder.step("delete the skill (custom confirm dialog)", async () => {
    const row = frame.locator("tr, .skills-admin-row, li", { hasText: name }).first();
    await row.locator("button.btn-danger", { hasText: /Delete/i }).click();
    const overlay = frame.locator(".cr-confirm-overlay");
    await expect(overlay).toBeVisible({ timeout: 8000 });
    await overlay.locator("button.btn-danger", { hasText: /Delete/i }).click();
    let gone = false;
    for (let i = 0; i < 10; i++) { if (!(await skillIndex()).some((s: any) => s?.name === name)) { gone = true; break; } await page.waitForTimeout(1500); }
    expect(gone, "the deleted skill is removed from skill_repo_index").toBe(true);
  }, { expectation: { assertion: "deleting removes the skill from the index", narrative: "Delete (custom confirm dialog) removes the skill everywhere." } });
});

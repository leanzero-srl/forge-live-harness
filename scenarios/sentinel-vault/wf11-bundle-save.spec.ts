// WF-11, second half (UX critique 2026-09-19, done 2026-09-20): the approval / protection settings
// used to sit on the settings view with their own Save while the states had theirs on another —
// two records, two buttons, and the steward read one sentence that described settings edited
// elsewhere. After the fix the states view carries the approval and protection sections under the
// default workflow with ONE Save (save-workflow-bundle): the definition is written first, then the
// settings; a refused settings write puts the definition back exactly as it was and says so.
// Server half through the hook (a bad settings write with a changed definition → both untouched);
// browser half on the space console (the sections on the states view, one Save, both records
// written). FAILS before (unknown resolver key / no sections on the states view), PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, inv, getKvs, setKvs, delKvs, norm, SPACE, MIHAI } from "./_wf";
import { getTarget } from "../../config/targets";
import { enterForgeSurface, ensureInViewport } from "../../forge/frame";

const OUT = process.env.OUT_DIR || "evidence/wf11-bundle-save";
test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;
const DEF_KEY = `workflow-def-space-${SPACE}`;
const SET_KEY = `workflow-settings-${SPACE}`;

test("WF-11 server: one Save, two records — a refused settings write puts the definition back; a good one writes both", async () => {
  const bed = await setupWorkflowPage("wf11-bundle-server"); // WFH settings snapshot + restore
  const defBefore = await getKvs(DEF_KEY);
  try {
    const list = await call("list-space-workflows", { spaceKey: SPACE });
    const def = JSON.parse(JSON.stringify(list.default));
    const draft = def.states.find((s: any) => s.id === "draft");
    draft.name = "Drafting (bundle test)";
    const settings = (await call("get-space-workflow-settings", { spaceKey: SPACE }))?.settings || {};
    // ── the settings are refused (demoteTo names a state that does not exist) → nothing saved ──
    const bad = await call("save-workflow-bundle", { spaceKey: SPACE, workflowId: "default", def, labels: [], priority: 0, settings: { ...settings, demoteTo: "no_such_state" } });
    console.log("### refused bundle:", JSON.stringify(bad));
    expect(bad?.success).toBe(false);
    expect(bad?.stage).toBe("settings");
    expect(bad?.restored, "the definition was put back").toBe(true);
    const defAfterBad = await getKvs(DEF_KEY);
    expect(JSON.stringify(defAfterBad ?? null), "the space's definition record is exactly what it was").toBe(JSON.stringify(defBefore ?? null));
    const listAfterBad = await call("list-space-workflows", { spaceKey: SPACE });
    expect(listAfterBad.default.states.find((s: any) => s.id === "draft").name, "the rename did not land").not.toBe("Drafting (bundle test)");
    expect((await getKvs(SET_KEY))?.demoteTo ?? "initial", "the bad settings did not land").not.toBe("no_such_state");
    // ── a good bundle writes both ────────────────────────────────────────────────────────────
    const good = await call("save-workflow-bundle", { spaceKey: SPACE, workflowId: "default", def, labels: [], priority: 0, settings: { ...settings, reviewAfterDays: 121 } });
    console.log("### good bundle:", JSON.stringify(good).slice(0, 200));
    expect(good?.success).toBe(true);
    const listAfterGood = await call("list-space-workflows", { spaceKey: SPACE });
    expect(listAfterGood.default.states.find((s: any) => s.id === "draft").name).toBe("Drafting (bundle test)");
    expect((await getKvs(SET_KEY))?.reviewAfterDays).toBe(121);
    // ── a non-steward is refused before anything is read ─────────────────────────────────────
    const ref = await call("save-workflow-bundle", { spaceKey: SPACE, workflowId: "default", def, settings }, "sv-nobody");
    expect(ref?.success).toBe(false);
    expect(ref?.reason).toMatch(/Only a space admin/);
  } finally {
    if (defBefore == null) await delKvs(DEF_KEY).catch(() => {}); else await setKvs(DEF_KEY, defBefore);
    await bed.restore();
  }
});

test("WF-11 browser: the states view carries the approval and protection settings under the default workflow with ONE Save that writes both", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("wf11-bundle-browser");
  const STEWARD_KEY = `admin-settings-space-${SPACE}`;
  const priorSteward = await getKvs(STEWARD_KEY);
  const defBefore = await getKvs(DEF_KEY);
  try {
    const users = [...new Set([...(priorSteward?.adminUsers || []).map((u: any) => (typeof u === "string" ? u : u?.accountId)), MIHAI])];
    await setKvs(STEWARD_KEY, { ...(priorSteward || {}), adminUsers: users });
    const T = getTarget("sentinel-vault-realm");
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45_000 });
    const app = (s as any).frame;
    await app.locator(".tab-navigation .tab-button", { hasText: "Workflow" }).click();
    await app.locator(".wf-dash-loading").waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});
    // the settings view: no approval / protection sections, one Save
    await expect(app.locator('[data-testid="wf-rule"]')).toBeVisible({ timeout: 20_000 });
    await expect(app.locator('[data-testid="wf-section-approval"]')).toHaveCount(0);
    await expect(app.locator('[data-testid="wf-section-protection"]')).toHaveCount(0);
    expect(await app.getByRole("button", { name: /^Save/ }).count()).toBe(1);
    const edit = app.locator('[data-testid="wf-defs-toggle"]');
    await ensureInViewport(page, edit);
    await edit.click();
    const form = app.locator('[data-testid="wf-def-default"]');
    await expect(form).toBeVisible({ timeout: 15_000 });
    const sections = form.locator('[data-testid="wf-def-settings"]');
    await expect(sections.locator('[data-testid="wf-section-approval"]'), "Approval sits under the default workflow's states").toBeVisible({ timeout: 15_000 });
    await expect(sections.locator('[data-testid="wf-section-protection"]'), "…and Protection").toBeVisible();
    expect(await app.getByRole("button", { name: /^Save/ }).count(), "ONE Save on the states view").toBe(1);
    await expect(app.getByRole("button", { name: /^Save/ })).toHaveText(/Save workflow/);
    await ensureInViewport(page, sections.locator('[data-testid="wf-section-approval"]'));
    await page.screenshot({ path: `${OUT}/01-states-view-with-settings.png` });
    // change a state name AND a setting, one Save
    const draftName = form.locator('[data-testid="wf-def-state"][data-state-id="draft"] [data-testid="wf-def-state-name"]');
    await draftName.fill("Draft (bundle)");
    const clock = sections.locator('[data-testid^="wf-review-clock-"]').first();
    await ensureInViewport(page, clock);
    await clock.fill("99");
    const save = form.locator('[data-testid="wf-def-save"]');
    await ensureInViewport(page, save);
    await save.click();
    const msg = form.locator('[data-testid="wf-def-message"]');
    await expect(msg).toBeVisible({ timeout: 20_000 });
    const text = norm(await msg.innerText());
    console.log("### save message:", text);
    expect(text).toMatch(/Workflow and its settings saved/);
    await expect.poll(async () => (await getKvs(DEF_KEY))?.states?.find((x: any) => x.id === "draft")?.name, { timeout: 20_000 }).toBe("Draft (bundle)");
    expect((await getKvs(SET_KEY))?.reviewAfterDays, "the setting went with the states").toBe(99);
    await page.screenshot({ path: `${OUT}/02-saved.png` });
    await app.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/02b-saved-dark.png` });
  } finally {
    if (priorSteward == null) await delKvs(STEWARD_KEY).catch(() => {}); else await setKvs(STEWARD_KEY, priorSteward);
    if (defBefore == null) await delKvs(DEF_KEY).catch(() => {}); else await setKvs(DEF_KEY, defBefore);
    await bed.restore();
  }
});

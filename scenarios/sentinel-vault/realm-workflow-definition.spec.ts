// B1 in the browser: the Workflow tab's definition editor. A steward opens it, adds a state,
// wires a transition to it with the per-state checkboxes, saves, and the state chips above the
// settings show the new state; the change is real (the resolver lists it) and is restored.
// @covers resolver:store-space-workflow resolver:list-space-workflows
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface, ensureInViewport } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import { mkdirSync } from "node:fs";

const T = getTarget("sentinel-vault-realm");
const SPACE = "WFH";
const DEF_KEY = `workflow-def-space-${SPACE}`;
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const OUT = "/tmp/sv-def-editor";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });

test.describe.configure({ timeout: 300_000, retries: 1 });

test("steward adds a state and a transition in the definition editor; the chips show it", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const priorDef = await getKvs(DEF_KEY);
  try {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
    const app = (s as any).frame;
    await app.locator(".tab-navigation .tab-button", { hasText: "Workflow" }).click();
    await app.locator(".wf-dash-loading").waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
    const toggle = app.locator('[data-testid="wf-defs-toggle"]');
    await ensureInViewport(page, toggle);
    await toggle.click();
    const form = app.locator('[data-testid="wf-def-default"]');
    await expect(form, "the default workflow's editor opens").toBeVisible({ timeout: 15000 });
    const before = await form.locator('[data-testid="wf-def-state"]').count();
    expect(before, "the default has states").toBeGreaterThan(1);

    // Add a state, name it, allow Draft → it and it → Draft.
    const add = form.locator('[data-testid="wf-def-add-state"]');
    await ensureInViewport(page, add);
    await add.click();
    const rows = form.locator('[data-testid="wf-def-state"]');
    await expect(rows).toHaveCount(before + 1);
    const newRow = rows.nth(before);
    await newRow.locator('[data-testid="wf-def-state-name"]').fill("Legal check");
    await expect(newRow, "the id follows the name").toHaveAttribute("data-state-id", "legal_check");
    const draftRow = form.locator('[data-testid="wf-def-state"][data-state-id="draft"]');
    await draftRow.locator('[data-testid="wf-def-edge-draft-legal_check"]').check({ force: true });
    await newRow.locator('[data-testid="wf-def-edge-legal_check-draft"]').check({ force: true });
    await page.screenshot({ path: `${OUT}/1-editor.png`, fullPage: true });

    const save = form.locator('[data-testid="wf-def-save"]');
    await ensureInViewport(page, save);
    await save.click();
    const msg = form.locator('[data-testid="wf-def-message"]');
    await expect(msg, "a save confirmation").toBeVisible({ timeout: 15000 });
    console.log("### save message:", await msg.innerText());
    expect(await msg.innerText(), "saved (a dead-end warning would name a state)").toMatch(/saved/i);

    const list = (await inv("listSpaceWorkflows", { spaceKey: SPACE, actor: MIHAI })).result;
    const legal = list?.default?.states?.find((x: any) => x.id === "legal_check");
    expect(legal?.name, "the resolver lists the new state").toBe("Legal check");
    expect(list.default.transitions.some((t: any) => t.from === "draft" && t.to === "legal_check"), "…with its edge").toBe(true);
    await expect(app.locator(".wf-state-preview .wf-state-chip", { hasText: "Legal check" }), "the state chips above the settings show it").toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/2-saved.png`, fullPage: true });
    console.log("### definition edited from the console ✓");
  } finally {
    if (priorDef) await setKvs(DEF_KEY, priorDef); else await delKvs(DEF_KEY).catch(() => {});
  }
});

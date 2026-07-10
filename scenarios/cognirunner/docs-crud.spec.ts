// LIVE BROWSER — admin Documentation Library CRUD (journey J9). Drives the real admin panel (Forge
// globalPage iframe): confirm the library is populated (seeded builtins), add a doc → assert it lists AND
// persists to doc_repo_index (read via the KVS hook), then delete it (custom confirm dialog) → assert gone
// from both the list and the index. Asserts real persistence, not just button presence.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");
const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;
test.describe.configure({ retries: 2 });

async function docIndex(): Promise<any[]> {
  const r = await fetch(`${HOOK}?what=kvs&key=doc_repo_index`, { headers: { Authorization: `Bearer ${SECRET}` } });
  if (!r.ok) throw new Error(`hook kvs read ${r.status}`);
  const v = (await r.json()).value;
  return Array.isArray(v) ? v : (v?.docs || v?.index || []);
}

test("J9 admin Documentation Library — builtins shown, add persists to index, delete removes", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module, moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });
  const title = `RuleLab Doc Probe ${Date.now().toString(36)}`;

  await assertLoggedIn(page);
  await recorder.step("open admin panel", async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); });
  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("expected a Custom-UI iframe");
  await expect(frame.locator(".tab-btn").first()).toBeVisible({ timeout: 20_000 });

  await recorder.step("go to Documentation tab (library populated with builtins)", async () => {
    await frame.locator(".tab-btn", { hasText: /^\s*Documentation\s*$/ }).first().click();
    await expect(frame.locator(".docs-tab .section-title", { hasText: /Documentation Library/i })).toBeVisible({ timeout: 15_000 });
    const idx = await docIndex();
    const builtins = idx.filter((d: any) => d?.builtin || d?.isBuiltin || d?.seeded);
    console.log(`doc index: ${idx.length} docs, ${builtins.length} builtin`);
    expect(idx.length, "the library has seeded builtin docs").toBeGreaterThan(0);
  }, { expectation: { assertion: "the Documentation Library renders with seeded builtin docs", narrative: "Builtins ship with the app so the library is never empty." } });

  await recorder.step("add a document (persists to doc_repo_index)", async () => {
    await frame.locator("button.btn-small", { hasText: /\+\s*Add Document/i }).click();
    await frame.locator("input.doc-input[placeholder*='title']").fill(title);
    // category is a CustomSelect (defaults to "General") — no need to set it; content + title are the only required fields.
    await frame.locator("textarea[placeholder*='Paste documentation']").fill("Rule-lab probe content: customfield_10280 is COGTEST_Text. " + title);
    await frame.locator("button.btn-small", { hasText: /^\s*Save\s*$/ }).click();
    await expect(frame.locator("table.table td", { hasText: title }).first()).toBeVisible({ timeout: 20_000 });
    // persistence oracle
    let inIndex = false;
    for (let i = 0; i < 10; i++) { if ((await docIndex()).some((d: any) => d?.title === title)) { inIndex = true; break; } await page.waitForTimeout(1500); }
    expect(inIndex, "the added doc persisted to doc_repo_index").toBe(true);
  }, { expectation: { assertion: "the added doc appears in the list and persists to the index", narrative: "A saved doc shows immediately and is written to KVS." } });

  await recorder.step("delete the document (custom confirm dialog)", async () => {
    const row = frame.locator("tr", { hasText: title }).first();
    await row.locator("button.btn-danger", { hasText: /Delete/i }).click();
    const overlay = frame.locator(".cr-confirm-overlay");
    await expect(overlay).toBeVisible({ timeout: 8000 });
    await overlay.locator("button.btn-danger", { hasText: /Delete/i }).click();
    await expect(frame.locator("table.table td", { hasText: title })).toHaveCount(0, { timeout: 20_000 });
    let gone = false;
    for (let i = 0; i < 10; i++) { if (!(await docIndex()).some((d: any) => d?.title === title)) { gone = true; break; } await page.waitForTimeout(1500); }
    expect(gone, "the deleted doc is removed from doc_repo_index").toBe(true);
  }, { expectation: { assertion: "deleting removes the doc from the list and the index", narrative: "Delete (via the custom confirm dialog) removes the doc everywhere." } });
});

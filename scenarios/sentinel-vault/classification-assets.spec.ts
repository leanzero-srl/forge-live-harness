// JSM Assets as the source of classification levels (owner go 2026-09-19). The one fact that
// decides the feature: the Assets API answers a Forge app only from a USER's session (spike
// 2026-09-19: six real schemas listed from the steward console as Mihai; asApp answers 401).
// This spec drives the whole link from the console: schema "Information Governance" → object
// type "Classification Level" (4 objects: PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED with Rank,
// Colour as words, Handling Guidance) → guessed mapping → preview → import → the Levels list
// IS the Assets list → re-import → unlink. The site's levels are restored afterwards.
// @covers resolver:classification-assets-schemas resolver:classification-assets-object-types resolver:classification-assets-attributes resolver:classification-assets-preview resolver:classification-assets-import resolver:classification-assets-link resolver:classification-assets-set-link
import { test, expect } from "../../fixtures/forge";
import { enterForgeSurface } from "../../forge/frame";
import { getTarget } from "../../config/targets";
import { getTestState } from "../../testhook/client";
const T = getTarget("sentinel-steward-console");
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
test.describe.configure({ timeout: 300_000, retries: 1 });

test("link the levels to an Assets object type: schemas → type → mapping → preview → import → re-import → unlink", async ({ page }) => {
  const levelsBefore = await getKvs("classification-levels");
  const linkBefore = await getKvs("classification-assets-link");
  // CLS-1 (2026-09-20): classification is OFF by default and the tab's controls are dimmed and
  // inert while it is — switch the site on for this run and put the record back after.
  const globalBefore = await getKvs("admin-settings-global");
  await setKvs("admin-settings-global", { ...(globalBefore || {}), classificationEnabled: true });
  try {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".admin-title", timeout: 45000 });
    if (s.kind !== "custom") throw new Error("expected Custom UI");
    const app = s.frame;
    await app.locator('[data-testid="tab-classification"]').click();
    await expect(app.locator('[data-testid="cls-tab"]')).toBeVisible({ timeout: 90000 });
    const section = app.locator('[data-testid="cls-assets"]');
    await expect(section, "offered to a site admin on the App scheme").toBeVisible();
    const err = section.locator('[data-testid="cls-assets-error"]');
    const fail = async (where: string) => { if (await err.count()) throw new Error(`${where}: ${await err.innerText()}`); };

    await section.locator('[data-testid="cls-assets-load"]').click();
    await expect(section.locator('[data-testid="cls-assets-schemas"]').or(err)).toBeVisible({ timeout: 40000 });
    await fail("schemas");
    const names = await section.locator('[data-testid="cls-assets-schema"]').allInnerTexts();
    console.log("### schemas:", JSON.stringify(names));
    await section.locator('[data-testid="cls-assets-schema"]', { hasText: "Information Governance" }).click();
    await expect(section.locator('[data-testid="cls-assets-types"]').or(err)).toBeVisible({ timeout: 40000 });
    await fail("types");
    console.log("### object types:", JSON.stringify(await section.locator('[data-testid="cls-assets-type"]').allInnerTexts()));
    await section.locator('[data-testid="cls-assets-type"]', { hasText: "Classification Level" }).click();
    await expect(section.locator('[data-testid="cls-assets-mapping"]').or(err)).toBeVisible({ timeout: 40000 });
    await fail("attributes");
    // the guess from the attribute names: Rank / Colour / Handling Guidance
    const active = await section.locator('[data-testid="cls-assets-mapping"] .cls-assets-opt.is-active').allInnerTexts();
    console.log("### guessed mapping:", JSON.stringify(active));
    expect(active).toEqual(expect.arrayContaining(["Rank", "Colour", "Handling Guidance"]));
    await page.screenshot({ path: "test-results/classification-assets-1-mapping.png" });

    await section.locator('[data-testid="cls-assets-preview-btn"]').click();
    await expect(section.locator('[data-testid="cls-assets-preview"]').or(err)).toBeVisible({ timeout: 40000 });
    await fail("preview");
    const chips = await section.locator('[data-testid="cls-assets-preview-level"]').allInnerTexts();
    console.log("### preview:", JSON.stringify(chips));
    expect(chips).toEqual(["1 · PUBLIC", "2 · INTERNAL", "3 · CONFIDENTIAL", "4 · RESTRICTED"]);
    await page.screenshot({ path: "test-results/classification-assets-2-preview.png" });

    await section.locator('[data-testid="cls-assets-import"]').click();
    await expect(section.locator('[data-testid="cls-assets-done"]').or(err)).toBeVisible({ timeout: 40000 });
    await fail("import");
    await expect(section.locator('[data-testid="cls-assets-badge"]'), "the section says Linked").toBeVisible();
    const stored = await getKvs("classification-levels");
    console.log("### stored levels:", JSON.stringify((stored?.levels || stored || []).map?.((l: any) => [l.rank, l.name, l.color])));
    const list = (stored?.levels || stored || []) as any[];
    expect(list.map((l) => [l.rank, l.name, l.color])).toEqual([[1, "PUBLIC", "#15803d"], [2, "INTERNAL", "#1d4ed8"], [3, "CONFIDENTIAL", "#b45309"], [4, "RESTRICTED", "#b91c1c"]]);
    const link = await getKvs("classification-assets-link");
    expect([link?.schemaId, link?.objectTypeId, link?.objectTypeName, link?.objectKeys?.length], "the link record").toEqual(["68", "76", "Classification Level", 4]);
    // the Levels section of the tab now shows the imported list
    await expect.poll(async () => app.locator('[data-testid="cls-tab"] input[aria-label="Level name"]').evaluateAll((els) => els.map((e: any) => e.value)), { timeout: 20000, message: "the Levels editor shows the imported list without a reload" }).toEqual(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);
    // the pickers are gone once the link stands: the section is the receipt, not the wizard
    await expect(section.locator('[data-testid="cls-assets-types"]')).toHaveCount(0);
    await page.screenshot({ path: "test-results/classification-assets-3-imported.png" });

    await section.locator('[data-testid="cls-assets-reimport"]').click();
    await expect(section.locator('[data-testid="cls-assets-done"]').or(err)).toBeVisible({ timeout: 40000 });
    await fail("re-import");
    await section.locator('[data-testid="cls-assets-unlink"]').click();
    await expect.poll(async () => await getKvs("classification-assets-link"), { timeout: 20000, message: "unlinked" }).toBeFalsy();
    expect((await getKvs("classification-levels")), "unlink keeps the levels").toBeTruthy();
  } finally {
    if (globalBefore) await setKvs("admin-settings-global", globalBefore); else await delKvs("admin-settings-global").catch(() => {});
    if (levelsBefore) await setKvs("classification-levels", levelsBefore); else await delKvs("classification-levels").catch(() => {});
    if (linkBefore) await setKvs("classification-assets-link", linkBefore); else await delKvs("classification-assets-link").catch(() => {});
  }
});

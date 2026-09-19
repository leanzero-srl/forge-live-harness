// CLS-1 (UX critique 2026-09-19, owner decision: classification OFF by default). Before the fix
// there was no switch: every page carried "Unclassified" in the byline chip, the ribbon's left
// block and the details modal, on a site that never set classification up. After the fix the
// site setting `classificationEnabled` (default false) and the per-space `classification: "off"`
// override decide, in ONE pure rule (classificationActive), what every surface shows:
//   off → byline = seal count / "Sentinel Vault", ribbon = brand block (no level), modal = no
//         Classification section, classification-set-page refused, stored levels KEPT.
// Server half: page-details-summary / ribbon-summary / classification-* / the byline property
// through the hook's invoke seam (no browser, no profile). Browser half: the page in both states,
// the steward console's switch and the space console's override. FAILS before, PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { setupWorkflowPage, loadPage, shotRibbon, inv, getKvs, setKvs, delKvs, norm, strip, SPACE, MIHAI } from "./_wf";
import { openDetailsModal, findDevChip } from "./_door";
// @ts-ignore
import { BASE, spaceIdByKey } from "../../data/confluence.mjs";

const OUT = process.env.OUT_DIR || "evidence/cls1-classification-off";
const GLOBAL = "admin-settings-global";
const SPACE_REC = `admin-settings-space-${SPACE}`;
const PROP = "sentinel-byline";
test.describe.configure({ timeout: 900_000 });

const auth = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
async function readByline(pageId: string): Promise<{ title: string; icon: string; tooltip: string } | null> {
  const r = await fetch(`${BASE}/wiki/api/v2/pages/${pageId}/properties?key=${PROP}`, { headers: { Authorization: auth, Accept: "application/json" } });
  if (!r.ok) throw new Error(`property read → ${r.status}`);
  return ((await r.json()) as any).results?.[0]?.value || null;
}
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;

/** Site setting + space override as the spec wants them; returns a restore for both records. */
async function settingsBed() {
  const before = { global: await getKvs(GLOBAL), space: await getKvs(SPACE_REC) };
  const site = async (enabled: boolean | null) => {
    const rec = { ...(before.global || {}) };
    if (enabled === null) delete rec.classificationEnabled; else rec.classificationEnabled = enabled;
    await setKvs(GLOBAL, rec);
  };
  const space = async (mode: "inherit" | "off" | null) => {
    const rec = { ...(before.space || {}) };
    if (mode === null) delete rec.classification; else rec.classification = mode;
    await setKvs(SPACE_REC, rec);
  };
  const restore = async () => {
    if (before.global == null) await delKvs(GLOBAL).catch(() => {}); else await setKvs(GLOBAL, before.global);
    if (before.space == null) await delKvs(SPACE_REC).catch(() => {}); else await setKvs(SPACE_REC, before.space);
  };
  return { before, site, space, restore };
}

test("CLS-1 server: off by default on every surface, on brings the level back, a space can opt out, stored levels are kept", async () => {
  const bed = await setupWorkflowPage("cls1-server");
  const P = bed.pageId;
  const s = await settingsBed();
  try {
    // ── OFF (the never-set default) ──────────────────────────────────────────────────────────
    await s.site(null); await s.space(null);
    await delKvs(`classification-page-${P}`).catch(() => {});
    const r0 = await inv("refreshByline", { pageId: P, force: "1" });
    const b0 = await readByline(P);
    console.log("### OFF byline:", JSON.stringify(b0), "wrote:", r0.result?.wrote);
    expect(b0?.title, "OFF: the chip carries the workflow state alone (WF-6), never a level").toBe("Draft");
    expect(b0?.tooltip, "OFF: the tooltip mentions no classification").not.toMatch(/classif/i);
    const sum0 = await call("page-details-summary", { pageId: P });
    console.log("### OFF summary.classification:", JSON.stringify(sum0?.classification));
    expect(sum0?.ok).toBe(true);
    expect(sum0?.classification?.enabled, "OFF: the modal is told classification is off").toBe(false);
    expect(sum0?.classification?.levels ?? [], "OFF: no levels are offered").toEqual([]);
    const rib0 = await call("ribbon-summary", { pageId: P });
    console.log("### OFF ribbon.classification:", JSON.stringify(rib0?.classification), "mode:", rib0?.ribbonMode);
    expect(rib0?.classification?.enabled, "OFF: the ribbon is told classification is off").toBe(false);
    expect(rib0?.classification?.level ?? null).toBeNull();
    const get0 = await call("classification-get-page", { pageId: P });
    expect(get0?.enabled, "OFF: classification-get-page says so").toBe(false);
    const set0 = await call("classification-set-page", { pageId: P, levelId: "restricted" });
    console.log("### OFF set-page:", JSON.stringify(set0));
    expect(set0?.ok, "OFF: a page cannot be classified").toBe(false);
    expect(set0?.reason).toBe("Classification is off on this site");
    expect(await getKvs(`classification-page-${P}`), "OFF: the refused write stored nothing").toBeFalsy();
    const prov0 = await call("classification-provider", {});
    expect(prov0?.enabled, "OFF: the provider answer carries the switch for the console").toBe(false);

    // ── ON ───────────────────────────────────────────────────────────────────────────────────
    await s.site(true);
    const r1 = await inv("refreshByline", { pageId: P, force: "1" });
    const b1 = await readByline(P);
    console.log("### ON byline:", JSON.stringify(b1), "wrote:", r1.result?.wrote);
    expect(b1?.title, "ON: Level · State again").toBe("Unclassified · Draft");
    const sum1 = await call("page-details-summary", { pageId: P });
    expect(sum1?.classification?.enabled, "ON: the modal gets the block").toBe(true);
    expect((sum1?.classification?.levels || []).length, "ON: levels are offered").toBeGreaterThan(0);
    const set1 = await call("classification-set-page", { pageId: P, levelId: "restricted" });
    expect(set1?.ok, `ON: classify works (${JSON.stringify(set1).slice(0, 120)})`).toBe(true);
    expect((await readByline(P))?.title).toBe("Restricted · Draft");
    const rib1 = await call("ribbon-summary", { pageId: P });
    expect(rib1?.classification?.level?.id, "ON: the ribbon carries the level").toBe("restricted");

    // ── the space opts out while the site is on: the stored level is hidden, not deleted ──────
    await s.space("off");
    await inv("refreshByline", { pageId: P, force: "1" });
    const b2 = await readByline(P);
    console.log("### SPACE-OFF byline:", JSON.stringify(b2));
    expect(b2?.title, "space off: the level is not shown").toBe("Draft");
    const set2 = await call("classification-set-page", { pageId: P, levelId: "public" });
    expect(set2?.ok).toBe(false);
    expect(set2?.reason).toBe("Classification is off in this space");
    expect((await getKvs(`classification-page-${P}`))?.levelId, "space off: the stored override is KEPT").toBe("restricted");
    const sum2 = await call("page-details-summary", { pageId: P });
    expect(sum2?.classification?.enabled).toBe(false);
    expect(sum2?.classification?.reason, "space off: the modal can say which switch").toBe("space");

    // ── back to inherit: the kept level is shown again, untouched ─────────────────────────────
    await s.space("inherit");
    await inv("refreshByline", { pageId: P, force: "1" });
    expect((await readByline(P))?.title, "inherit again: the stored level returns as it was").toBe("Restricted · Draft");

    // ── site off again: the space cannot turn it on by itself ─────────────────────────────────
    await s.site(false); await s.space("inherit");
    await inv("refreshByline", { pageId: P, force: "1" });
    expect((await readByline(P))?.title, "site off wins over the space").toBe("Draft");
    const sd = await call("classification-set-space-default", { spaceIds: [String(await spaceIdByKey(SPACE))], levelId: "public" });
    console.log("### site off set-space-default:", JSON.stringify(sd).slice(0, 200));
    expect(sd?.results?.[0]?.ok, "site off: a space default cannot be written either").toBe(false);
    expect(sd?.results?.[0]?.reason).toBe("Classification is off on this site");
  } finally {
    await delKvs(`classification-page-${P}`).catch(() => {});
    await s.restore();
    await bed.restore();
  }
});

test("CLS-1 browser: the page, the site console and the space console in both states", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("cls1-browser");
  const P = bed.pageId;
  const s = await settingsBed();
  const shot = async (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
  const dark = async (frame: any) => { await page.evaluate(() => { document.documentElement.dataset.colorMode = "dark"; }); await frame.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark")); await page.waitForTimeout(400); };
  try {
    // ── OFF: the page ────────────────────────────────────────────────────────────────────────
    await s.site(null); await s.space(null);
    await inv("refreshByline", { pageId: P, force: "1" });
    let r = await loadPage(page, P);
    expect(r, "the ribbon renders (the page has a workflow)").toBeTruthy();
    await expect(r!.frame.locator('[data-testid="ribbon-level"]'), "OFF: no level block on the ribbon").toHaveCount(0);
    await expect(r!.frame.locator('[data-testid="ribbon-brand"]'), "OFF: the left block is the app's name").toContainText("Sentinel Vault");
    const ribbonOff = norm(await r!.frame.locator('[data-testid="ribbon-bar"]').innerText());
    console.log("### OFF ribbon:", ribbonOff);
    expect(ribbonOff).not.toMatch(/classif/i);
    await shotRibbon(page, r!.el, `${OUT}/01-off-ribbon.png`);
    const chipOff = await findDevChip(page);
    const chipOffText = norm(await chipOff.innerText());
    console.log("### OFF chip:", chipOffText);
    expect(chipOffText, "OFF: the chip says the state alone, never Unclassified").toMatch(/^Draft \(Development\)/);
    const box = await chipOff.boundingBox();
    await page.screenshot({ path: `${OUT}/02-off-chip.png`, clip: box ? { x: Math.max(0, box.x - 260), y: Math.max(0, box.y - 40), width: 700, height: 110 } : undefined });
    let app = await openDetailsModal(page);
    await expect(app.locator('[data-testid="pd-classification"]'), "OFF: the modal has no Classification section").toHaveCount(0);
    expect(strip(await app.locator(".pd-body").innerHTML()), "OFF: the modal body never says classif…").not.toMatch(/classif/i);
    await shot("03-off-modal");
    await dark(app); await shot("03b-off-modal-dark");

    // ── ON: the page ─────────────────────────────────────────────────────────────────────────
    await s.site(true);
    await inv("refreshByline", { pageId: P, force: "1" });
    r = await loadPage(page, P);
    await expect(r!.frame.locator('[data-testid="ribbon-level"]'), "ON: the level block is back").toHaveText("Unclassified");
    await shotRibbon(page, r!.el, `${OUT}/04-on-ribbon.png`);
    const chipOn = await findDevChip(page);
    console.log("### ON chip:", norm(await chipOn.innerText()));
    expect(norm(await chipOn.innerText())).toMatch(/^Unclassified · Draft/);
    app = await openDetailsModal(page);
    await expect(app.locator('[data-testid="pd-classification"]'), "ON: the modal has the section").toBeVisible();
    await shot("05-on-modal");

    // ── the site console: the switch, the tab's banner ───────────────────────────────────────
    await s.site(null);
    const T = getTarget("sentinel-steward-console");
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const sc = await enterForgeSurface(page, { surface: "custom", readySelector: ".admin-title", timeout: 60_000 });
    if (sc.kind !== "custom") throw new Error("expected Custom UI");
    const con = sc.frame;
    const row = con.locator('[data-testid="sv-row-classificationEnabled"]');
    await expect(row, "the Settings tab has the Classification switch").toBeVisible({ timeout: 30_000 });
    expect(norm(await row.innerText())).toMatch(/Classification levels/);
    await expect(con.locator('[data-testid="sv-row-ribbonMode"]'), "OFF: the ribbon-mode choice (a classification control) is hidden").toHaveCount(0);
    await row.scrollIntoViewIfNeeded();
    await shot("06-console-switch-off");
    await con.locator('[data-testid="tab-classification"]').click();
    const banner = con.locator('[data-testid="cls-off-banner"]');
    await expect(banner, "OFF: the Classification tab says it is off and where to turn it on").toBeVisible({ timeout: 40_000 });
    console.log("### tab banner:", norm(await banner.innerText()));
    await expect(con.locator('[data-testid="cls-tab"]')).toHaveAttribute("data-enabled", "false");
    await shot("07-console-tab-off");
    await dark(con); await shot("07b-console-tab-off-dark");

    // ── the space console: the override under the site switch ────────────────────────────────
    await s.site(true);
    const R = getTarget("sentinel-vault-realm");
    await page.goto(R.deepLink(R.envId)!, { waitUntil: "domcontentloaded" });
    const rc = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 60_000 });
    if (rc.kind !== "custom") throw new Error("expected Custom UI");
    const realm = rc.frame;
    await realm.locator("button.tab-button", { hasText: "Access Control" }).click();
    const card = realm.locator('[data-testid="sv-classification-card"]');
    await expect(card, "the space console offers the classification override").toBeVisible({ timeout: 30_000 });
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('[data-testid="sv-classification-inherit"]')).toHaveAttribute("aria-checked", "true");
    await shot("08-space-console-inherit");
    await card.locator('[data-testid="sv-classification-off"]').click();
    await realm.locator('[data-testid="sv-save-realm-prefs"]').click();
    await expect.poll(async () => (await getKvs(SPACE_REC))?.classification, { timeout: 30_000 }).toBe("off");
    // The save re-renders the console behind a spinner; the evidence is the card after it comes back.
    await expect(realm.locator('[data-testid="sv-classification-off"]')).toHaveAttribute("aria-checked", "true", { timeout: 60_000 });
    await realm.locator('[data-testid="sv-classification-card"]').scrollIntoViewIfNeeded();
    await shot("09-space-console-off-saved");
    await dark(realm); await shot("09b-space-console-dark");
  } finally {
    await delKvs(`classification-page-${P}`).catch(() => {});
    await s.restore();
    await bed.restore();
  }
});

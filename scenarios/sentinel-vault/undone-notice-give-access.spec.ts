// Tester report 2026-09-17, the parts only a real browser proves (dev env, real Confluence):
//   1. "Give edit access…" from the panel's ⋯ on a seal I own: dialog → search → pick → granted →
//      the person appears under "Editors with access" → Revoke.
//   2. A tampered sealed section, opened in VIEW mode by the person who tampered: the macro calls
//      guard-page-now, the section is put back while they are on the page, and the macro says so
//      with "Open my version"; the ribbon's Restored row carries "See my version".
// @covers resolver:grant-edit-access resolver:search-grantees resolver:guard-page-now surface:section-setup surface:doc-ribbon
import { test, expect } from "../../fixtures/forge";
import type { Frame, Page } from "@playwright/test";
import { BASE_URL } from "../../config/env";
import { getTestState } from "../../testhook/client";
import { findDevPanel } from "./_door";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, writeAdf, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const FIXTURE_PAGE = process.env.SV_PAGE_ID || "265912321";
const FIXTURE_ATT = "att265945089";
const DEV = "17516615";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const OUT = "test-results/undone-give-access";
const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const call = async (key: string, actor: string, payload: any = {}) => (await getTestState("sentinel-vault", { what: "invoke", fn: "invoke", key, actor, payload: JSON.stringify(payload) })).result;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 420_000, retries: 1 });

test("panel: Give edit access… → search → granted → listed → revoked", async ({ page }) => {
  // start clean: no grant for either Gabriela identity
  const grantsBefore = await call("list-edit-grants", MIHAI, { attachmentId: FIXTURE_ATT });
  for (const g of grantsBefore.grants || []) await call("revoke-edit-grant", MIHAI, { attachmentId: FIXTURE_ATT, editorAccountId: g.editorAccountId });

  await page.goto(`${BASE_URL}/wiki/spaces/${SPACE}/pages/${FIXTURE_PAGE}`, { waitUntil: "domcontentloaded" });
  let panel: any = null;
  await expect.poll(async () => { panel = await findDevPanel(page); return !!panel && (await panel.locator(".artifact-card").count()) > 0; }, { timeout: 120_000, message: "the dev inline panel rendered its cards" }).toBe(true);
  const card = panel.locator(".artifact-card", { hasText: "sv-aql-sealed-fixture" }).first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('[data-primary="release"]'), "the fixture is sealed by me").toBeVisible({ timeout: 30_000 });

  await card.locator('[data-testid="sv-kebab"]').click();
  const item = panel.locator('[data-testid="sv-kebab-give-access"]');
  await expect(item, "⋯ offers Give edit access… on a seal I own").toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${OUT}/1-menu.png` });
  await item.click();

  const dlg = panel.locator('[data-testid="sv-give-access"]');
  await expect(dlg, "the dialog opened").toBeVisible({ timeout: 10_000 });
  const confirm = dlg.locator('[data-testid="sv-give-access-confirm"]');
  await expect(confirm, "nothing to give until a person is picked").toBeDisabled();
  await dlg.locator('[data-testid="sv-give-access-search"]').fill("Gabriela");
  const option = dlg.locator('[data-testid="sv-give-access-option"]').first();
  await expect(option, "the people search answered").toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/2-search.png` });
  const pickedName = (await option.innerText()).trim();
  await option.click();
  await expect(dlg.locator('[data-testid="sv-give-access-picked"]')).toContainText(pickedName);
  await page.screenshot({ path: `${OUT}/3-picked.png` });
  await confirm.click();
  await expect(dlg, "the dialog closes on success").toBeHidden({ timeout: 20_000 });

  const inbox = card.locator('[data-testid="sv-grants-inbox"]');
  await expect(inbox, "Editors with access lists the person").toContainText(pickedName, { timeout: 20_000 });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/4-granted.png` });
  const live = await call("list-edit-grants", MIHAI, { attachmentId: FIXTURE_ATT });
  console.log(`### grants after the dialog: ${JSON.stringify(live.grants)}`);
  expect((live.grants || []).length, "exactly one grant, written by the real resolver").toBe(1);
  expect([live.grants[0].grantedBy, live.grants[0].direct]).toEqual([MIHAI, true]);

  await inbox.getByRole("button", { name: /Revoke/ }).click();
  await expect.poll(async () => ((await call("list-edit-grants", MIHAI, { attachmentId: FIXTURE_ATT })).grants || []).length, { timeout: 20_000, message: "Revoke removed the grant" }).toBe(0);
  await page.screenshot({ path: `${OUT}/5-revoked.png` });
});

async function findSectionFrame(page: Page, timeoutMs = 90_000): Promise<Frame> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    for (const fr of page.frames()) {
      if (!fr.url().includes(DEV)) continue;
      if ((await fr.locator(".sec-frame:not(.sec-loading)").count().catch(() => 0)) > 0) return fr;
    }
    await page.waitForTimeout(800);
  }
  throw new Error("section macro frame not found");
}

test("view: my tampered sealed section is put back while I look at the page, and I am told where my text is", async ({ page }) => {
  const original = (await getKvs("admin-settings-global")) || null;
  await setKvs("admin-settings-global", { ...(original || {}), enableContentProtection: true, enableDocRibbons: true, enableFlashMessages: true });
  const spaceId = await spaceIdByKey(SPACE);
  let proven = false;
  try {
    for (let attempt = 1; attempt <= 3 && !proven; attempt++) {
      const created = await createPage({ spaceId, title: `HARNESS undone-notice ${Date.now()}`, adf: doc(paragraph("intro"), heading("SECTION ALPHA", 2), paragraph("alpha body content"), paragraph("footer paragraph")) });
      const PAGE = String(created.id);
      let SECTION: string | null = null;
      try {
        const lh = await inv("listPageHeadings", { pageId: PAGE, actor: GABI });
        const alpha = (lh.result?.headings || []).find((h: any) => h.text === "SECTION ALPHA");
        const sr = await inv("sealSection", { pageId: PAGE, hi: String(alpha.index), htext: "SECTION ALPHA", actor: GABI }); // GABRIELA owns it
        expect(sr.result?.success, `sealed as Gabriela (${sr.result?.reason || "ok"})`).toBe(true);
        SECTION = sr.result.sectionId;
        await call("guard-page-now", GABI, { pageId: PAGE }); // the seal's own write is judged; marker at the sealed version

        // I (Mihai) type into the sealed section and publish — over REST, as the editor would
        const before = await readPage(PAGE);
        const adf = JSON.parse(JSON.stringify(before.adf));
        const wrap = adf.content.find((n: any) => n.type === "bodiedExtension");
        wrap.content.push(paragraph("TEXT MIHAI TYPED INTO GABRIELAS SECTION"));
        await writeAdf(PAGE, adf);
        const tamperV = (await readPage(PAGE)).version;

        await page.goto(`${BASE_URL}/wiki/spaces/${SPACE}/pages/${PAGE}`, { waitUntil: "domcontentloaded" });
        const frame = await findSectionFrame(page);
        const notice = frame.locator('[data-testid="sec-undone"]');
        const shown = await notice.waitFor({ state: "visible", timeout: 45_000 }).then(() => true).catch(() => false);
        const now = await readPage(PAGE);
        const restored = !JSON.stringify(now.adf).includes("TEXT MIHAI TYPED");
        console.log(`### attempt ${attempt}: notice=${shown} restored=${restored} v${tamperV}→v${now.version}`);
        expect(restored, "the sealed section was put back while the page was open — not 20 minutes later").toBe(true);
        // Whoever put it back — the view-time guard or a page event that was on time — the person
        // who lost the text is told (the notice reads the dispatch record, not the race result).
        expect(shown, "the macro tells me my edit was undone, whichever path restored it").toBe(true);
        proven = true;

        const text = (await notice.innerText()).replace(/\s+/g, " ");
        console.log(`### macro notice: ${text}`);
        expect(text).toMatch(/Your edit to this section was undone/);
        expect(text).toMatch(/not lost/);
        expect(text).toMatch(/Request edit/);
        await expect(frame.locator('[data-testid="sec-undone-version"]'), "Open my version is offered").toBeVisible();
        await frame.locator(".sec-frame").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${OUT}/6-macro-undone-notice.png` });

        // the ribbon: Restored + See my version (it re-evaluates after the guard)
        let ribbon: Frame | null = null;
        await expect.poll(async () => {
          for (const fr of page.frames()) {
            if (fr.url().includes(DEV) && (await fr.locator('[data-testid="ribbon-my-version"]').count().catch(() => 0)) > 0) { ribbon = fr; return true; }
          }
          return false;
        }, { timeout: 60_000, message: "the ribbon shows the Restored row with See my version" }).toBe(true);
        const bar = (await ribbon!.locator('[data-testid="ribbon-bar"]').innerText()).replace(/\s+/g, " ");
        console.log(`### ribbon: ${bar}`);
        expect(bar).toMatch(/Restored/);
        expect(bar).toMatch(new RegExp(`See my version \\(v${tamperV}\\)`));
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${OUT}/7-ribbon-restored.png` });

        // the link lands on the version that holds my text
        await ribbon!.locator('[data-testid="ribbon-my-version"]').click();
        await page.waitForURL(new RegExp(`pageVersion=${tamperV}`), { timeout: 30_000 });
        await expect(page.locator("body")).toContainText("TEXT MIHAI TYPED INTO GABRIELAS SECTION", { timeout: 30_000 });
        await page.screenshot({ path: `${OUT}/8-my-version.png` });
      } finally {
        if (SECTION) { await delKvs(`section-protection-${SECTION}`).catch(() => {}); await delKvs(`section-snapshot-${SECTION}`).catch(() => {}); }
        await delKvs(`page-guard-${PAGE}`).catch(() => {});
        await deletePage(PAGE).catch(() => {});
      }
    }
    expect(proven, "in three tries the view-time guard won the race at least once and the notice was seen").toBe(true);
  } finally {
    if (original) await setKvs("admin-settings-global", original);
  }
});

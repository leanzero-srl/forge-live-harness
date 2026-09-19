// Tester batch 2026-09-19 — the parts only a browser proves (dev, real Confluence, Mihai):
//   1. the panel's group numbers are the whole page's (13), not the cards on screen (10);
//   5. with "Sign seal actions" on, Release opens the code prompt; the current code releases;
//   6. "Open My work" from the page-details modal lands on the My work page (env-aware path).
import { test, expect } from "../../fixtures/forge";
import { BASE_URL } from "../../config/env";
import { getTestState } from "../../testhook/client";
import { findDevPanel, openDetailsModal } from "./_door";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, uploadAttachment } from "../../data/confluence.mjs";
// @ts-ignore
import { paragraph } from "../../data/adf.mjs";
// @ts-ignore
import { totp } from "/Users/mihaiperdum/Projects/Sentinel Vault/src/server/shared/totp.js";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const OUT = "test-results/tester-batch-ui";
const call = async (key: string, actor: string, payload: any = {}) => (await getTestState("sentinel-vault", { what: "invoke", fn: "invoke", key, actor, payload: JSON.stringify(payload) })).result;
const hookFn = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

test.describe.configure({ timeout: 480_000, retries: 1 });
let originalGlobal: any = null;
const withGlobal = async (patch: Record<string, any>) => setKvs("admin-settings-global", { ...(originalGlobal || {}), ...patch });
test.beforeAll(async () => { originalGlobal = (await getKvs("admin-settings-global")) || null; });
test.afterAll(async () => { if (originalGlobal) await setKvs("admin-settings-global", originalGlobal); else await delKvs("admin-settings-global"); });

test("1 + 5 + 6: counts, signed Release, Open My work", async ({ page }) => {
  const spaceId = await spaceIdByKey(SPACE);
  const created = await createPage({ spaceId, title: `HARNESS tester-batch ${Date.now()}`, adf: doc(paragraph("thirteen attachments")) });
  const PAGE = String(created.id);
  const ids: string[] = [];
  // Mihai's signature device on dev: keep whatever is there, enrol a fresh one we hold the secret of, put the original back
  const SIG_KEYS = [`sig-secret-${MIHAI}`, `sig-enroll-${MIHAI}`, `sig-last-${MIHAI}`, `sig-fail-${MIHAI}`];
  const saved: Record<string, any> = {};
  for (const k of SIG_KEYS) saved[k] = await getKvs(k);
  try {
    for (let i = 1; i <= 13; i++) ids.push((await uploadAttachment(PAGE, `tb-${i}.txt`, `file ${i}`)).attachmentId);
    for (const id of ids.slice(0, 2)) await setKvs(`protection-${id}`, { attachmentId: id, lockedBy: MIHAI, lockedByName: "Mihai Perdum", attachmentName: `tb-${ids.indexOf(id) + 1}.txt`, contentId: PAGE, spaceKey: SPACE, expiresAt: inDays(1) });
    await hookFn("ensurePanel", { pageId: PAGE });
    for (const k of SIG_KEYS) await delKvs(k);
    const enr = await call("enroll-signature", MIHAI);
    expect(enr.success).toBe(true);
    expect((await call("confirm-signature-enrollment", MIHAI, { code: totp(enr.secret) })).success).toBe(true);
    await withGlobal({ signSealActions: true });

    await page.goto(`${BASE_URL}/wiki/spaces/${SPACE}/pages/${PAGE}`, { waitUntil: "domcontentloaded" });
    let panel: any = null;
    await expect.poll(async () => { panel = await findDevPanel(page); return !!panel && (await panel.locator(".artifact-card").count()) > 0; }, { timeout: 120_000, message: "the dev panel rendered cards" }).toBe(true);
    // ── 1: numbers ──
    await expect(panel.locator('[data-testid="sv-count-available"]'), "Available says 11 (13 on the page, 2 sealed) although only 8 available cards are on screen").toHaveText("11", { timeout: 30_000 });
    await expect(panel.locator('[data-testid="sv-count-sealed"]')).toHaveText("2");
    const cards = await panel.locator(".artifact-card").count();
    console.log(`### cards on screen: ${cards} (available says 11, sealed says 2)`);
    // (the panel merges the KVS seal phase with the paged list, so the card count on screen varies — the numbers must not)
    await panel.locator('[data-testid="sv-count-available"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/1-counts.png` });

    // ── 5: signed Release ──
    const card = panel.locator(".artifact-card", { hasText: "tb-1.txt" }).first();
    await card.scrollIntoViewIfNeeded();
    await card.locator('[data-primary="release"]').click();
    const dlg = panel.locator('[data-testid="sv-sign-dialog"]');
    await expect(dlg, "Release asks for the authenticator code").toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${OUT}/2-sign-prompt.png` });
    await dlg.locator('[data-testid="sv-sign-code"]').fill("000000");
    await dlg.locator('[data-testid="sv-sign-confirm"]').click();
    await expect(dlg.locator('[data-testid="sv-sign-error"]'), "a wrong code is refused inside the dialog").toBeVisible({ timeout: 15_000 });
    await expect(card.locator('[data-primary="release"]'), "…and the seal stands").toBeVisible();
    await page.screenshot({ path: `${OUT}/3-sign-wrong.png` });
    await dlg.locator('[data-testid="sv-sign-code"]').fill(totp(enr.secret, Date.now() + 30_000));
    await dlg.locator('[data-testid="sv-sign-confirm"]').click();
    await expect(dlg, "the dialog closes").toBeHidden({ timeout: 20_000 });
    await expect.poll(async () => !(await getKvs(`protection-${ids[0]}`)), { timeout: 20_000, message: "the signed release removed the seal" }).toBe(true);
    await expect(card.locator('[data-primary="seal"]'), "the card offers Seal again").toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: `${OUT}/4-released.png` });

    // ── 6: Open My work ──
    const app = await openDetailsModal(page);
    const btn = app.locator('[data-testid="pd-open-my-work"]');
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await btn.click();
    await page.waitForURL(/\/wiki\/apps\/c30bf71e-4287-4872-954d-db49cc68f0ff\/[0-9a-f-]{36}\/my-work/, { timeout: 60_000 });
    console.log(`### Open My work → ${page.url()}`);
    await expect(page.locator("body"), "the My work page rendered, not Confluence's 404").not.toContainText("Well, this is awkward", { timeout: 30_000 });
    await expect.poll(async () => page.frames().some((f) => /my-work/.test(f.url())), { timeout: 60_000, message: "the My work iframe mounted" }).toBe(true);
    await page.screenshot({ path: `${OUT}/5-my-work.png` });
  } finally {
    for (const k of SIG_KEYS) { if (saved[k]) await setKvs(k, saved[k]); else await delKvs(k).catch(() => {}); }
    for (const id of ids.slice(0, 2)) await delKvs(`protection-${id}`).catch(() => {});
    await deletePage(PAGE).catch(() => {});
  }
});

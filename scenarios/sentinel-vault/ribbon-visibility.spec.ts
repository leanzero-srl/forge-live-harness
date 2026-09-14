// Bug 2.4 — the page ribbon (confluence:pageBanner `doc-ribbon`) must APPEAR on every page that has a
// seal (attachment OR section) and stay CLOSED on a page with nothing to show — including a page that
// has attachments but no seal (the old rule showed "N attachments — none sealed"). Visibility is now a
// bridge decision (view.close()/view.open()) driven by the `ribbon-summary` resolver; the viewer can
// dismiss the row and the SAME state stays dismissed for the session. The row is ONE line ≤ 48px.
// GOTCHA: wolfaenpak has BOTH the dev (17516615) and prod installs active, so TWO banners render —
// every assertion here targets the DEV iframe by env id.
// @covers resolver:ribbon-summary manifest:confluence:pageBanner:sentinel-vault-ribbon
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, uploadAttachment, BASE } from "../../data/confluence.mjs";
// @ts-ignore
import { buildBodiedExtensionNode, paragraph, heading, hashAdf } from "../../data/adf.mjs";
// @ts-ignore
import { request } from "../../data/jira.mjs";
import { mkdirSync } from "node:fs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DEV = "17516615";
const OUT = "/tmp/sv-ribbon-visibility";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const SENTINEL_APP = "ari:cloud:ecosystem::app/c30bf71e-4287-4872-954d-db49cc68f0ff";
const SENTINEL_ENV = process.env.SENTINEL_ENV_ID || "17516615-12ef-4790-8ce2-29151b7ee9ac";
const setKvs = (key: string, value: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(value) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const link = (text: string, href: string) => ({ type: "paragraph", content: [{ type: "text", text, marks: [{ type: "link", attrs: { href } }] }] });
const pageUrl = (id: string) => `${BASE}/wiki/pages/viewpage.action?pageId=${id}`;
const IFR = 'iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]';

test.describe.configure({ timeout: 240_000, retries: 1 });

/** The dev ribbon frame that has rendered its bar, or null after `ms`. */
async function findRibbon(page: any, ms: number) {
  const ifr = page.locator(IFR);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const n = await ifr.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
      if (!src.includes(DEV)) continue;
      const cf = ifr.nth(i).contentFrame();
      if ((await cf.locator('[data-testid="ribbon-bar"]').count().catch(() => 0)) > 0) return { frame: cf, el: ifr.nth(i) };
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

/** True when, across the whole settle window, NO dev iframe ever rendered the bar. */
async function ribbonStaysHidden(page: any, ms: number) {
  const seen = await findRibbon(page, ms);
  return seen === null;
}

const fixtures: { pages: string[]; kvs: string[] } = { pages: [], kvs: [] };
let sealedPage: any, emptyPage: any, sectionPage: any, unsealedPage: any, attachmentId = "";

test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  const spaceId = await spaceIdByKey(SPACE);
  const ts = Date.now();
  // (a) ONE sealed attachment, NO macro
  sealedPage = await createPage({ spaceId, title: `HARNESS sv-ribbon-sealed ${ts}`, adf: doc(heading("Sealed", 2), paragraph("one sealed attachment, no macro")) });
  fixtures.pages.push(sealedPage.id);
  const att = await uploadAttachment(sealedPage.id, "ribbon-seal.txt", "harness ribbon bytes");
  attachmentId = att.attachmentId;
  await setKvs(`protection-${attachmentId}`, {
    contentId: sealedPage.id, attachmentId, sealedFileId: att.fileId, lockedBy: MIHAI, lockedByName: "Mihai",
    attachmentName: "ribbon-seal.txt", spaceId, timestamp: new Date().toISOString(), expiresAt: null,
  });
  fixtures.kvs.push(`protection-${attachmentId}`);
  // (b) a page with NOTHING, linking to the sealed one (the SPA hop)
  emptyPage = await createPage({ spaceId, title: `HARNESS sv-ribbon-empty ${ts}`, adf: doc(heading("Empty", 2), link("GO-TO-SEALED", `${BASE}/wiki/spaces/${SPACE}/pages/${sealedPage.id}`)) });
  fixtures.pages.push(emptyPage.id);
  // (c) whose only seal is a SECTION (seeded exactly as sealed-section.spec.ts does)
  const sectionId = `harness-rib-${ts.toString(36)}`;
  const body = [paragraph("SEALED SECTION BODY")];
  const wrapper = buildBodiedExtensionNode(SENTINEL_APP, SENTINEL_ENV, "sentinel-vault-sealed-section", { params: { sectionId }, content: body as any });
  sectionPage = await createPage({ spaceId, title: `HARNESS sv-ribbon-section ${ts}`, adf: doc(heading("Section", 2), wrapper, paragraph("footer")) });
  fixtures.pages.push(sectionPage.id);
  const contentHash = hashAdf(body);
  await setKvs(`section-protection-${sectionId}`, { sectionId, pageId: sectionPage.id, lockedBy: MIHAI, lockedByName: "Mihai", contentHash, originalIndex: 1, sealedVersion: 1, sectionTitle: "S", expiresAt: null });
  await setKvs(`section-snapshot-${sectionId}`, { wrapperNode: wrapper, bodyContent: body, hash: contentHash, version: 1, originalIndex: 1 });
  fixtures.kvs.push(`section-protection-${sectionId}`, `section-snapshot-${sectionId}`);
  await request("POST", `/wiki/api/v2/pages/${sectionPage.id}/properties`, { raw: true, body: { key: "section-protection-", value: [{ sectionId, lockedBy: MIHAI, expiresAt: null }] } });
  // (d) attachments but NO seal
  unsealedPage = await createPage({ spaceId, title: `HARNESS sv-ribbon-unsealed ${ts}`, adf: doc(heading("Unsealed", 2), paragraph("an attachment, nothing sealed")) });
  fixtures.pages.push(unsealedPage.id);
  await uploadAttachment(unsealedPage.id, "plain.txt", "not sealed");
});

test.afterAll(async () => {
  for (const k of fixtures.kvs) await delKvs(k).catch(() => {});
  for (const id of fixtures.pages) await deletePage(id).catch(() => {});
});

test("(a)+(f) a page with ONE sealed attachment and no macro shows the ribbon on hard load, in one row ≤ 48px", async ({ page }) => {
  await page.goto(pageUrl(sealedPage.id), { waitUntil: "domcontentloaded" });
  const rib = await findRibbon(page, 45_000);
  await page.screenshot({ path: `${OUT}/a-sealed.png` });
  expect(rib, "the dev ribbon renders its bar on a page whose only content is a sealed attachment").toBeTruthy();
  const status = rib!.frame.locator('[data-testid="ribbon-status"]');
  await expect(status, "the status names the seal").toHaveText(/1 attachment sealed on this page/i, { timeout: 20_000 });
  const text = (await status.innerText()).trim();
  console.log("### (a) status:", JSON.stringify(text));
  // (f) ONE row ≤ 48px — measure the bar itself and the iframe the host sized around it.
  const bar = rib!.frame.locator('[data-testid="ribbon-bar"]');
  const box = await bar.boundingBox();
  const frameBox = await rib!.el.boundingBox();
  console.log(`### (f) bar height=${box?.height} iframe height=${frameBox?.height}`);
  expect(box, "the bar is measurable").toBeTruthy();
  expect(box!.height, "the visible row is at most 48px tall").toBeLessThanOrEqual(48);
  await expect(rib!.frame.locator(".ribbon-action", { hasText: "Manage Attachments" }), "Manage Attachments stays in the row").toBeVisible();
  await expect(rib!.frame.locator('[data-testid="ribbon-dismiss"]'), "the dismiss control is in the row").toBeVisible();
});

test("(b) SPA-navigating from a page with nothing to the sealed page shows the ribbon", async ({ page }) => {
  await page.goto(pageUrl(emptyPage.id), { waitUntil: "domcontentloaded" });
  expect(await ribbonStaysHidden(page, 25_000), "the empty page never renders the dev ribbon bar").toBeTruthy();
  let loads = 0;
  page.on("load", () => { loads += 1; });
  await page.locator('a:has-text("GO-TO-SEALED")').first().click();
  const rib = await findRibbon(page, 60_000);
  await page.screenshot({ path: `${OUT}/b-after-spa.png` });
  console.log(`### (b) full page loads after the click: ${loads} (0 = SPA navigation); url=${page.url()}`);
  expect(rib, "the ribbon appears after navigating to the sealed page").toBeTruthy();
  await expect(rib!.frame.locator('[data-testid="ribbon-status"]')).toHaveText(/1 attachment sealed on this page/i, { timeout: 20_000 });
});

test("(c) a page whose only seal is a SECTION shows the ribbon", async ({ page }) => {
  await page.goto(pageUrl(sectionPage.id), { waitUntil: "domcontentloaded" });
  const rib = await findRibbon(page, 45_000);
  await page.screenshot({ path: `${OUT}/c-section.png` });
  expect(rib, "the dev ribbon renders for a section-only seal").toBeTruthy();
  const status = rib!.frame.locator('[data-testid="ribbon-status"]');
  await expect(status, "the status counts the sealed section").toHaveText(/1 section sealed/i, { timeout: 20_000 });
  console.log("### (c) status:", JSON.stringify((await status.innerText()).trim()));
});

test("(d) a page with attachments but no seal keeps the ribbon closed", async ({ page }) => {
  await page.goto(pageUrl(unsealedPage.id), { waitUntil: "domcontentloaded" });
  const hidden = await ribbonStaysHidden(page, 30_000);
  await page.screenshot({ path: `${OUT}/d-unsealed.png` });
  expect(hidden, "no dev iframe renders the ribbon bar on an attachments-but-no-seal page").toBeTruthy();
});

test("(e) dismiss closes the ribbon and the same state stays closed across a reload", async ({ page }) => {
  await page.goto(pageUrl(sealedPage.id), { waitUntil: "domcontentloaded" });
  const rib = await findRibbon(page, 45_000);
  expect(rib, "the ribbon is visible before dismissing").toBeTruthy();
  await rib!.frame.locator('[data-testid="ribbon-dismiss"]').click();
  await expect(rib!.frame.locator('[data-testid="ribbon-bar"]'), "the bar is gone after dismiss").toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/e-dismissed.png` });
  await page.reload({ waitUntil: "domcontentloaded" });
  const hidden = await ribbonStaysHidden(page, 30_000);
  await page.screenshot({ path: `${OUT}/e-reloaded.png` });
  expect(hidden, "after a reload the same dismissed state does not come back").toBeTruthy();
});

// 5.0 ribbon (mockup docs/mockups/sv-status-surfaces.html §2 "Exceptions only" / §3 "Always show
// classification"). In "exceptions" the row opens for a level ≥ the threshold, for something waiting
// on the viewer (a request, an approval, an active grant, a seal the viewer does NOT own → "Locked ·
// Request edit"), for an active alert, or a workflow/validation state — and stays CLOSED otherwise,
// including a page whose only seal is the viewer's own with nothing waiting, and a page with
// attachments but no seal. In "always" the classification block is always there ("Unclassified" in
// grey when none) and the right half is EMPTY until something is urgent. Visibility is a bridge
// decision (view.close()/view.open()) driven by `ribbon-summary`; the viewer can dismiss the row and
// the SAME state stays dismissed for the session. The row is ONE line ≤ 48px, no left rail.
// The seals here are seeded as GABRIELA's (a real account) so the harness user (Mihai) is the
// collaborator who hits a seal he does not own — journey 2 of the mockup.
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
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55"; // real account; the seal OWNER here, so Mihai is locked out
const GLOBAL = "admin-settings-global";
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const clsAs = (fn: string, actor: string, payload: Record<string, unknown>) =>
  getTestState("sentinel-vault", { what: "invoke", fn: `classification.${fn}`, actor, payload: JSON.stringify(payload) });
const setRibbonSettings = async (patch: Record<string, unknown>) => {
  const cur = await getKvs(GLOBAL);
  await setKvs(GLOBAL, { ...(cur || {}), ...patch });
};
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

let originalGlobal: any = null;
test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  // Pin the steward setting the whole file assumes (mode "exceptions", threshold 4 = Restricted);
  // restored EXACTLY in afterAll. (j) flips the mode inside its own try/finally.
  originalGlobal = await getKvs(GLOBAL);
  await setKvs(GLOBAL, { ...(originalGlobal || {}), ribbonMode: "exceptions", ribbonThresholdRank: 4 });
  const spaceId = await spaceIdByKey(SPACE);
  const ts = Date.now();
  // (a) ONE sealed attachment, NO macro
  sealedPage = await createPage({ spaceId, title: `HARNESS sv-ribbon-sealed ${ts}`, adf: doc(heading("Sealed", 2), paragraph("one sealed attachment, no macro")) });
  fixtures.pages.push(sealedPage.id);
  const att = await uploadAttachment(sealedPage.id, "ribbon-seal.txt", "harness ribbon bytes");
  attachmentId = att.attachmentId;
  await setKvs(`protection-${attachmentId}`, {
    contentId: sealedPage.id, attachmentId, sealedFileId: att.fileId, lockedBy: GABI, lockedByName: "Gabriela Perdum",
    attachmentName: "ribbon-seal.txt", spaceId, timestamp: new Date().toISOString(), expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
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
  await setKvs(`section-protection-${sectionId}`, { sectionId, pageId: sectionPage.id, lockedBy: GABI, lockedByName: "Gabriela Perdum", contentHash, originalIndex: 1, sealedVersion: 1, sectionTitle: "Pricing", expiresAt: null });
  await setKvs(`section-snapshot-${sectionId}`, { wrapperNode: wrapper, bodyContent: body, hash: contentHash, version: 1, originalIndex: 1 });
  fixtures.kvs.push(`section-protection-${sectionId}`, `section-snapshot-${sectionId}`);
  await request("POST", `/wiki/api/v2/pages/${sectionPage.id}/properties`, { raw: true, body: { key: "section-protection-", value: [{ sectionId, lockedBy: GABI, expiresAt: null }] } });
  // (d) attachments but NO seal
  unsealedPage = await createPage({ spaceId, title: `HARNESS sv-ribbon-unsealed ${ts}`, adf: doc(heading("Unsealed", 2), paragraph("an attachment, nothing sealed")) });
  fixtures.pages.push(unsealedPage.id);
  await uploadAttachment(unsealedPage.id, "plain.txt", "not sealed");
});

test.afterAll(async () => {
  if (originalGlobal) await setKvs(GLOBAL, originalGlobal).catch(() => {}); else await delKvs(GLOBAL).catch(() => {});
  for (const k of fixtures.kvs) await delKvs(k).catch(() => {});
  for (const id of fixtures.pages) await deletePage(id).catch(() => {});
});

test("(a)+(f) a page with ONE sealed attachment the viewer does not own shows the Locked row on hard load, in one row ≤ 48px, no left rail", async ({ page }) => {
  await page.goto(pageUrl(sealedPage.id), { waitUntil: "domcontentloaded" });
  const rib = await findRibbon(page, 45_000);
  await page.screenshot({ path: `${OUT}/a-sealed.png` });
  expect(rib, "the dev ribbon renders its bar on a page whose only content is a seal the viewer does not own").toBeTruthy();
  const bar = rib!.frame.locator('[data-testid="ribbon-bar"]');
  await expect(rib!.frame.locator('[data-testid="ribbon-pill"]'), "ONE state pill: Locked").toHaveText("Locked", { timeout: 20_000 });
  const status = rib!.frame.locator('[data-testid="ribbon-status"]');
  await expect(status, "the sentence names the file, the owner and the expiry").toHaveText(/ribbon-seal\.txt is sealed by Gabriela Perdum until \S+ \d{2}:\d{2}/i, { timeout: 20_000 });
  const text = (await status.innerText()).trim();
  console.log("### (a) status:", JSON.stringify(text), "state=", await bar.getAttribute("data-state"), "level=", await bar.getAttribute("data-level"));
  expect(await bar.getAttribute("data-state")).toBe("locked");
  // (f) ONE row ≤ 48px — measure the bar itself and the iframe the host sized around it.
  const box = await bar.boundingBox();
  const frameBox = await rib!.el.boundingBox();
  console.log(`### (f) bar height=${box?.height} iframe height=${frameBox?.height}`);
  expect(box, "the bar is measurable").toBeTruthy();
  expect(box!.height, "the visible row is at most 48px tall").toBeLessThanOrEqual(48);
  await expect(rib!.frame.locator('[data-testid="ribbon-request-edit"]'), "Request edit (quiet) is in the Locked row").toBeVisible();
  await expect(rib!.frame.locator('[data-testid="ribbon-open"]'), "Open (primary) is in the row").toBeVisible();
  await expect(rib!.frame.locator('[data-testid="ribbon-dismiss"]'), "the dismiss control is in the row").toBeVisible();
  const borderLeft = await bar.evaluate((e: Element) => getComputedStyle(e).borderLeftWidth);
  expect(borderLeft, "no left rail (uniform border)").toBe(await bar.evaluate((e: Element) => getComputedStyle(e).borderTopWidth));
  // The left block is the classification: with a seal on the page it carries the LOCK glyph.
  expect(await rib!.frame.locator('[data-testid="ribbon-class"] .rb-glyph').getAttribute("data-glyph"), "lock glyph on a page with a seal").toBe("lock");
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
  await expect(rib!.frame.locator('[data-testid="ribbon-status"]')).toHaveText(/ribbon-seal\.txt is sealed by Gabriela Perdum/i, { timeout: 20_000 });
});

test("(c) a page whose only seal is a SECTION shows the ribbon", async ({ page }) => {
  await page.goto(pageUrl(sectionPage.id), { waitUntil: "domcontentloaded" });
  const rib = await findRibbon(page, 45_000);
  await page.screenshot({ path: `${OUT}/c-section.png` });
  expect(rib, "the dev ribbon renders for a section-only seal").toBeTruthy();
  await expect(rib!.frame.locator('[data-testid="ribbon-pill"]'), "Locked pill for a section the viewer does not own").toHaveText("Locked", { timeout: 20_000 });
  const status = rib!.frame.locator('[data-testid="ribbon-status"]');
  await expect(status, "the sentence names the section and its owner (no expiry)").toHaveText(/Pricing is sealed by Gabriela Perdum with no expiry/i, { timeout: 20_000 });
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

// P1-7 — a summary the ribbon could NOT read is an error row with Retry, never a silent close. The
// resolver's failure branches (asApp() attachment listing 5xx, a thrown listing) cannot be provoked
// from a browser against a healthy tenant — the page-unreadable branch only fires for a PAYLOAD id
// without a context id, and the banner always has a context id — so the surface's stub seam
// (`window.__svRibbonSummaryStub`, mirrors the section macro's) stands in for the resolver answer.
// The second half proves Retry: the stub is removed from the live frame and the real summary lands.
test("(g) a failed summary renders the error row with Retry; Retry recovers the real status", async ({ page }) => {
  await page.addInitScript(() => { (window as any).__svRibbonSummaryStub = { ok: false, reason: "attachments-http-500", attachments: 0, sealedAttachments: 0, sectionSeals: 0, trashedSeals: 0 }; });
  await page.goto(pageUrl(sealedPage.id), { waitUntil: "domcontentloaded" });
  const rib = await findRibbon(page, 45_000);
  await page.screenshot({ path: `${OUT}/g-error.png` });
  expect(rib, "the ribbon renders a row when the summary fails (does not close)").toBeTruthy();
  const err = rib!.frame.locator('[data-testid="ribbon-error"]');
  await expect(err, "the error sentence").toHaveText("Sentinel Vault could not check this page", { timeout: 20_000 });
  const bar = rib!.frame.locator('[data-testid="ribbon-bar"]');
  expect(await bar.getAttribute("data-state")).toBe("error");
  const box = await bar.boundingBox();
  console.log(`### (g) error row height=${box?.height}`);
  expect(box!.height, "the error row is still one row ≤ 48px").toBeLessThanOrEqual(48);
  const retry = rib!.frame.locator('[data-testid="ribbon-retry"]');
  await expect(retry).toBeVisible();
  await expect(rib!.frame.locator('[data-testid="ribbon-dismiss"]'), "the viewer can still dismiss").toBeVisible();
  const borderLeft = await bar.evaluate((e: Element) => getComputedStyle(e).borderLeftWidth);
  const borderAll = await bar.evaluate((e: Element) => [getComputedStyle(e).borderTopWidth, getComputedStyle(e).borderTopColor].join(" "));
  console.log(`### (g) border-left=${borderLeft} border-top=${borderAll}`);
  expect(borderLeft, "no left rail (uniform border)").toBe(await bar.evaluate((e: Element) => getComputedStyle(e).borderTopWidth));
  // Retry with the seam removed → the real resolver answers and the seal count appears. The host
  // can re-create the banner iframe (a fresh document re-runs the init script and re-arms the
  // stub — seen once, 2026-09-15: the first attempt stayed on the error row for 30 s), so the
  // removal + Retry is repeated against whatever dev ribbon frame is live until the status lands.
  const status = rib!.frame.locator('[data-testid="ribbon-status"]');
  let recovered = false;
  for (let attempt = 1; attempt <= 4 && !recovered; attempt++) {
    for (const fr of page.frames()) {
      if (!fr.url().includes(DEV)) continue;
      await fr.evaluate(() => { delete (window as any).__svRibbonSummaryStub; }).catch(() => {});
    }
    const btn = rib!.frame.locator('[data-testid="ribbon-retry"]');
    if (await btn.count()) await btn.click().catch(() => {});
    try { await expect(status).toHaveText(/ribbon-seal\.txt is sealed by Gabriela Perdum/i, { timeout: 10_000 }); recovered = true; }
    catch (_) { console.log(`### (g) retry attempt ${attempt}: status not yet real (frames=${page.frames().filter((f) => f.url().includes(DEV)).length})`); }
  }
  expect(recovered, "after Retry the real status names the seal").toBe(true);
  expect(await rib!.frame.locator('[data-testid="ribbon-error"]').count(), "the error row is gone").toBe(0);
  await page.screenshot({ path: `${OUT}/g-after-retry.png` });
});

// P1-7 — before the first decision the row is a text-free skeleton, never "No attachments" copy
// that then flips. A never-resolving stub freezes the ribbon in that state so it can be measured.
test("(h) first paint is a text-free skeleton row ≤ 48px", async ({ page }) => {
  await page.addInitScript(() => { (window as any).__svRibbonSummaryStub = () => new Promise(() => {}); });
  await page.goto(pageUrl(sealedPage.id), { waitUntil: "domcontentloaded" });
  const ifr = page.locator(IFR);
  let skel: any = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 45_000 && !skel) {
    const n = await ifr.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
      if (!src.includes(DEV)) continue;
      const cf = ifr.nth(i).contentFrame();
      if ((await cf.locator('[data-testid="ribbon-skeleton"]').count().catch(() => 0)) > 0) { skel = { frame: cf, el: ifr.nth(i) }; break; }
    }
    if (!skel) await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: `${OUT}/h-skeleton.png` });
  expect(skel, "the dev ribbon renders the skeleton row while the summary is pending").toBeTruthy();
  const row = skel.frame.locator('[data-testid="ribbon-skeleton"]');
  const text = (await row.innerText()).trim();
  const box = await row.boundingBox();
  const frameBox = await skel.el.boundingBox();
  console.log(`### (h) skeleton text=${JSON.stringify(text)} height=${box?.height} iframe height=${frameBox?.height}`);
  expect(text, "the skeleton carries no text").toBe("");
  if (box) expect(box.height, "skeleton row ≤ 48px").toBeLessThanOrEqual(48);
  expect(await skel.frame.locator('[data-testid="ribbon-bar"]').count(), "no real bar (and no status copy) painted yet").toBe(0);
});

// 5.0 (i) — "exceptions" mode, trigger (a): a page whose level meets the threshold opens the row
// even with NOTHING sealed and nothing waiting. The override is set through the classification
// resolver as Mihai (the hook's actor seam), so the left block reads "Restricted · set on this page"
// in the level's solid colour; the right half carries no pill (the level's own description is the
// sentence), and the glyph is the DOT (no seal on this page).
test("(i) exceptions mode + a Restricted page override → the row opens with the red 'Restricted · set on this page' block", async ({ page }) => {
  const pid = unsealedPage.id; // attachments but no seal: closed in (d)
  const set = await clsAs("set-page", MIHAI, { pageId: pid, levelId: "restricted" });
  expect(set?.result?.ok, `set-page restricted ok: ${JSON.stringify(set?.result)}`).toBe(true);
  try {
    await page.goto(pageUrl(pid), { waitUntil: "domcontentloaded" });
    const rib = await findRibbon(page, 45_000);
    await page.screenshot({ path: `${OUT}/i-restricted.png` });
    expect(rib, "the row opens for a Restricted page with no seal").toBeTruthy();
    const bar = rib!.frame.locator('[data-testid="ribbon-bar"]');
    const cls = rib!.frame.locator('[data-testid="ribbon-class"]');
    await expect(rib!.frame.locator('[data-testid="ribbon-level"]')).toHaveText("Restricted", { timeout: 20_000 });
    await expect(rib!.frame.locator('[data-testid="ribbon-source"]')).toHaveText(/set on this page/);
    const bg = await cls.evaluate((e: Element) => getComputedStyle(e).backgroundColor);
    const color = await cls.evaluate((e: Element) => getComputedStyle(e).color);
    console.log(`### (i) class block bg=${bg} color=${color} state=${await bar.getAttribute("data-state")} mode=${await bar.getAttribute("data-mode")} glyph=${await cls.locator(".rb-glyph").getAttribute("data-glyph")}`);
    expect(bg, "solid Restricted red (#B91C1C)").toBe("rgb(185, 28, 28)");
    expect(color, "white text on the level colour").toBe("rgb(255, 255, 255)");
    expect(await bar.getAttribute("data-mode")).toBe("exceptions");
    expect(await bar.getAttribute("data-state"), "nothing urgent — the row is open on the threshold alone").toBe("none");
    expect(await rib!.frame.locator('[data-testid="ribbon-pill"]').count(), "no state pill").toBe(0);
    expect(await cls.locator(".rb-glyph").getAttribute("data-glyph"), "dot glyph: no seal on this page").toBe("dot");
    await expect(rib!.frame.locator('[data-testid="ribbon-status"]'), "the level's description is the sentence").toHaveText(/Highest sensitivity/i);
    expect(await rib!.frame.locator('[data-testid="ribbon-request-edit"]').count(), "no Request edit outside the Locked state").toBe(0);
    await expect(rib!.frame.locator('[data-testid="ribbon-open"]')).toBeVisible();
    const box = await bar.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(48);
  } finally {
    await clsAs("set-page", MIHAI, { pageId: pid, levelId: null }).catch(() => {});
  }
});

// 5.0 (j) — "always" mode: an unclassified page with no seal and nothing waiting still renders the
// row — "Unclassified" in the neutral grey block — and the right half is EMPTY (mockup §3 decision).
test("(j) always mode on an unclassified page with no seals → 'Unclassified' grey block, empty right half, ≤ 48px", async ({ page }) => {
  const pid = emptyPage.id;
  const before = await clsAs("get-page", MIHAI, { pageId: pid });
  const effective = before?.result?.effective || { level: null, source: "none" };
  console.log("### (j) effective classification of the empty page before:", JSON.stringify(effective));
  await setRibbonSettings({ ribbonMode: "always" });
  try {
    await page.goto(pageUrl(pid), { waitUntil: "domcontentloaded" });
    const rib = await findRibbon(page, 45_000);
    await page.screenshot({ path: `${OUT}/j-always.png` });
    expect(rib, "the row opens in always mode with nothing sealed").toBeTruthy();
    const bar = rib!.frame.locator('[data-testid="ribbon-bar"]');
    const cls = rib!.frame.locator('[data-testid="ribbon-class"]');
    expect(await bar.getAttribute("data-mode")).toBe("always");
    if (!effective.level) {
      await expect(rib!.frame.locator('[data-testid="ribbon-level"]')).toHaveText("Unclassified", { timeout: 20_000 });
      expect(await rib!.frame.locator('[data-testid="ribbon-source"]').count(), "no source for an unclassified page").toBe(0);
      const bg = await cls.evaluate((e: Element) => getComputedStyle(e).backgroundColor);
      console.log(`### (j) grey block bg=${bg}`);
      expect(bg, "neutral grey block (#475569)").toBe("rgb(71, 85, 105)");
    } else {
      // The space carries a default level today: the block shows THAT level (still nothing urgent).
      await expect(rib!.frame.locator('[data-testid="ribbon-level"]')).toHaveText(effective.level.name, { timeout: 20_000 });
      console.log("### (j) NOTE: the space has a default level, so 'Unclassified' could not be asserted on this run.");
    }
    expect(await bar.getAttribute("data-state"), "nothing urgent").toBe("none");
    expect(await rib!.frame.locator('[data-testid="ribbon-pill"]').count(), "no pill").toBe(0);
    expect(await rib!.frame.locator('[data-testid="ribbon-status"]').count(), "no sentence: the right half is EMPTY").toBe(0);
    const bodyText = (await rib!.frame.locator('[data-testid="ribbon-body"]').innerText()).trim();
    console.log(`### (j) right half text=${JSON.stringify(bodyText)}`);
    expect(bodyText, "the right half carries no text").toBe("");
    await expect(rib!.frame.locator('[data-testid="ribbon-open"]')).toBeVisible();
    const box = await bar.boundingBox();
    console.log(`### (j) height=${box?.height}`);
    expect(box!.height).toBeLessThanOrEqual(48);
  } finally {
    await setRibbonSettings({ ribbonMode: "exceptions", ribbonThresholdRank: 4 });
  }
});

// 5.0 (k) — "exceptions" mode: an Internal page (rank 2 < threshold 4) with no seal and nothing
// waiting keeps the row CLOSED.
test("(k) exceptions mode, an Internal page with no seals → closed", async ({ page }) => {
  const pid = emptyPage.id;
  const set = await clsAs("set-page", MIHAI, { pageId: pid, levelId: "internal" });
  expect(set?.result?.ok, `set-page internal ok: ${JSON.stringify(set?.result)}`).toBe(true);
  try {
    await page.goto(pageUrl(pid), { waitUntil: "domcontentloaded" });
    const hidden = await ribbonStaysHidden(page, 30_000);
    await page.screenshot({ path: `${OUT}/k-internal-closed.png` });
    expect(hidden, "an Internal page below the threshold with nothing urgent never renders the bar").toBeTruthy();
  } finally {
    await clsAs("set-page", MIHAI, { pageId: pid, levelId: null }).catch(() => {});
  }
});

// 5.0 (l) — journey 2, the collaborator's first frame → second frame: Request edit opens an inline
// reason field in the row, Send calls request-edit-access, and the row re-evaluates to
// "Waiting for {owner}". Runs LAST because it changes the sealed page's state for the viewer.
test("(l) Request edit → inline reason → Send → the row becomes 'Waiting for Gabriela Perdum'", async ({ page }) => {
  const reqKey = `edit-request-${attachmentId}-${MIHAI}`;
  const idxKey = `editreq-owner-${GABI}-${attachmentId}-${MIHAI}`;
  await delKvs(reqKey).catch(() => {});
  try {
    await page.goto(pageUrl(sealedPage.id), { waitUntil: "domcontentloaded" });
    const rib = await findRibbon(page, 45_000);
    expect(rib).toBeTruthy();
    await expect(rib!.frame.locator('[data-testid="ribbon-pill"]')).toHaveText("Locked", { timeout: 20_000 });
    await rib!.frame.locator('[data-testid="ribbon-request-edit"]').click();
    const reason = rib!.frame.locator('[data-testid="ribbon-ask-reason"]');
    await expect(reason, "the inline reason field replaces the sentence").toBeVisible();
    const bar = rib!.frame.locator('[data-testid="ribbon-bar"]');
    const askBox = await bar.boundingBox();
    console.log(`### (l) row height with the reason field open=${askBox?.height}`);
    expect(askBox!.height, "still one row while asking").toBeLessThanOrEqual(48);
    await reason.fill("harness: totals need fixing");
    await page.screenshot({ path: `${OUT}/l-asking.png` });
    await rib!.frame.locator('[data-testid="ribbon-ask-send"]').click();
    await expect(rib!.frame.locator('[data-testid="ribbon-pill"]'), "the pill flips to Waiting for the owner").toHaveText("Waiting for Gabriela Perdum", { timeout: 30_000 });
    await expect(rib!.frame.locator('[data-testid="ribbon-status"]')).toHaveText(/Your edit request on ribbon-seal\.txt was sent/i);
    expect(await rib!.frame.locator('[data-testid="ribbon-request-edit"]').count(), "Request edit is gone once sent").toBe(0);
    await page.screenshot({ path: `${OUT}/l-waiting.png` });
    const rec = await getKvs(reqKey);
    console.log("### (l) request record:", JSON.stringify(rec));
    expect(rec?.status, "the request record is pending").toBe("pending");
    expect(rec?.ownerAccountId).toBe(GABI);
  } finally {
    await delKvs(reqKey).catch(() => {});
    await delKvs(idxKey).catch(() => {});
  }
});

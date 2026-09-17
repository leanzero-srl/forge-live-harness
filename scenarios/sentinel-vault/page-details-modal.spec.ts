// 5.0 — the byline CHIP (confluence:contentBylineItem `sentinel-vault-byline`, rendered by
// Confluence from the `sentinel-byline` content property) and the DETAILS MODAL it opens
// (resource page-details, resolver page-details-summary). Proven in the REAL page:
//   1. on the fixture page (one sealed attachment owned by Mihai) the chip text carries the level
//      or "Unclassified", its icon is the app's data: SVG with the LOCK, and clicking it opens the
//      modal whose Overview lists the fixture seal with primary action "Release";
//   2. setting the page override to Restricted FROM THE MODAL rewrites the property to
//      "Restricted · set on this page" and the chip says so after a reload;
//   3. a throwaway page with no seals gets the dot icon (no lock) and no "Release" row.
// The refresh seam (`fn=refreshByline`) is the SAME function every seal/section/classification
// write calls with one line; the REST property read is the truth the chip renders from.
// @covers resolver:page-details-summary resolver:classification-set-page resolver:seal-artifact manifest:confluence:contentBylineItem:sentinel-vault-byline manifest:confluence:contentAction:sentinel-vault-seal-action
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, purgePage, uploadAttachment, BASE } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
import { mkdirSync } from "node:fs";

const PAGE_ID = process.env.SV_PAGE_ID || "265912321";
const ATT = process.env.SV_ATTACHMENT_ID || "att265945089";
const SPACE = process.env.SENTINEL_SPACE_KEY || "WFH";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const DEV_ENV = "17516615";
const OUT = "/tmp/sv-page-details";
const PROP = "sentinel-byline";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const pageUrl = (id: string) => `${BASE}/wiki/pages/viewpage.action?pageId=${id}`;

const auth = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
async function readByline(pageId: string): Promise<{ title: string; icon: string; tooltip: string } | null> {
  const r = await fetch(`${BASE}/wiki/api/v2/pages/${pageId}/properties?key=${PROP}`, { headers: { Authorization: auth, Accept: "application/json" } });
  if (!r.ok) throw new Error(`property read → ${r.status}`);
  return ((await r.json()) as any).results?.[0]?.value || null;
}
const decodeIcon = (icon: string) => decodeURIComponent(icon.replace(/^data:image\/svg\+xml;utf8,/, ""));

// The byline item Confluence renders (DOM dump 2026-09-15): button[data-testid="byline-forge-app-button"]
// whose text is the property title plus the environment suffix (" (Development)" on dev), holding
// img[data-testid="byline-forge-app-image"] with the property's icon src verbatim.
async function findChip(page: any, title: string) {
  // The STAGING control install (2026-09-15) renders its own chip with the same title, and it
  // comes FIRST in the byline row — `.first()` on the title alone clicked "… (Staging)" and the
  // dev modal never opened. The dev chip is the one whose text also says "(Development)".
  const el = page.locator('button[data-testid="byline-forge-app-button"]', { hasText: title }).filter({ hasText: "(Development)" }).first();
  await el.waitFor({ state: "visible", timeout: 45000 });
  return el;
}

async function openModal(page: any, chip: any) {
  await chip.click();
  // The modal hosts our Custom UI iframe (dev env id in its src).
  // Same locator as _door.ts: any iframe of the dev env. The narrower data-testid/title pair this
  // spec used stopped matching Confluence's modal iframe (2026-09-17) while _door.ts kept working.
  const ifr = page.locator(`iframe[src*="${DEV_ENV}"]`);
  let app: any = null;
  await expect.poll(async () => {
    const n = await ifr.count();
    for (let i = 0; i < n; i++) {
      const f = ifr.nth(i).contentFrame();
      if ((await f.locator('[data-testid="pd-modal"][data-ready="1"]').count().catch(() => 0)) > 0) { app = f; return true; }
    }
    return false;
  }, { timeout: 60000, message: "the page-details modal boots past its summary load" }).toBe(true);
  return app;
}

test.describe.configure({ timeout: 300_000, retries: 1 });

test("byline chip renders from the property, opens the modal, lists the fixture seal with Release; override → chip updates", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const seal = await getKvs(`protection-${ATT}`);
  expect(seal?.lockedBy, `fixture seal protection-${ATT} owned by Mihai (run cd test-harness && npm run ensure-fixture)`).toBe(MIHAI);
  expect(String(seal?.contentId), "fixture seal sits on the fixture page").toBe(PAGE_ID);
  // Start from no page override so the source is known.
  await delKvs(`classification-page-${PAGE_ID}`).catch(() => {});

  // 1. The property the chip renders from — written by the same function every writer calls.
  const rr = await inv("refreshByline", { pageId: PAGE_ID, force: "1" });
  expect(rr.result?.wrote, `refreshByline wrote the property (got ${JSON.stringify(rr.result)})`).toBe(true);
  const before = await readByline(PAGE_ID);
  expect(before, "sentinel-byline property exists").toBeTruthy();
  console.log("### byline before:", JSON.stringify(before));
  expect(before!.title, "title is a level with its source, or Unclassified").toMatch(/^(Unclassified|.+ · (space default|set on this page))$/);
  expect(before!.title, "no override yet → not 'set on this page'").not.toMatch(/set on this page/);
  expect(before!.icon.startsWith("data:image/svg+xml"), "icon is the data: SVG").toBe(true);
  expect(decodeIcon(before!.icon), "one live seal on the page → the LOCK glyph").toContain("<rect");
  expect(Object.keys(before!).sort(), "property carries exactly title/icon/tooltip").toEqual(["icon", "title", "tooltip"]);

  // 2. The chip in the real page.
  await page.goto(pageUrl(PAGE_ID), { waitUntil: "domcontentloaded" });
  const chip = await findChip(page, before!.title);
  await chip.scrollIntoViewIfNeeded();
  const box = await chip.boundingBox();
  await page.screenshot({ path: `${OUT}/1-chip.png`, clip: box ? { x: Math.max(0, box.x - 260), y: Math.max(0, box.y - 40), width: 700, height: 110 } : undefined });
  // Icon experiment: does Confluence render our data: URI? Report what the DOM holds near the chip.
  const iconInfo = await chip.locator('img[data-testid="byline-forge-app-image"]').evaluate((i: HTMLImageElement) => ({ src: i.src.slice(0, 40), w: i.naturalWidth, h: i.naturalHeight, complete: i.complete, shown: i.getBoundingClientRect().width }));
  expect(iconInfo.src.startsWith("data:image/svg+xml"), "Confluence renders the data: SVG icon verbatim").toBe(true);
  expect(iconInfo.w, "…and the image actually decoded").toBeGreaterThan(0);
  console.log("### chip icon DOM:", JSON.stringify(iconInfo));

  // 3. Open the modal; Overview lists the fixture seal with primary "Release".
  const app = await openModal(page, chip);
  await expect(app.locator('[data-testid="pd-title"]')).not.toHaveText(/Loading/);
  const row = app.locator('[data-testid="pd-seal-row"][data-kind="attachment"]', { hasText: (seal.attachmentName || "").slice(0, 12) });
  await expect(row, "the sealed fixture is listed").toBeVisible({ timeout: 20000 });
  await expect(row.locator('[data-testid="pd-primary"]'), "…with the primary action Release").toHaveText("Release");
  expect(await row.getAttribute("data-primary")).toBe("release");
  expect(await row.innerText(), "the row says who holds it").toContain("Sealed by you");
  await expect(app.locator('[data-testid="pd-level-pill"]'), "classification pill renders").toBeVisible();
  await expect(app.locator('[data-testid="pd-recent"] [data-testid="sv-activity-feed"]'), "recent activity feed renders").toBeVisible();
  await page.screenshot({ path: `${OUT}/2-modal-overview.png` });

  // 4. Set the page override to Restricted from the modal.
  await expect(app.locator('[data-testid="pd-level-picker"]'), "Mihai can edit the page → the picker is shown").toBeVisible();
  await app.locator('[data-testid="pd-level-picker"]').click();
  await app.locator('[data-testid="pd-level-option-restricted"]').click();
  await expect(app.locator('[data-testid="pd-level-pill"]')).toHaveAttribute("data-level", "restricted", { timeout: 20000 });
  await expect(app.locator('[data-testid="pd-level-desc"]')).toContainText("Set on this page");
  await page.screenshot({ path: `${OUT}/3-modal-restricted.png` });
  const after = await readByline(PAGE_ID);
  console.log("### byline after override:", JSON.stringify(after));
  expect(after!.title, "the property was rewritten by classification-set-page").toBe("Restricted · set on this page");
  expect(decodeIcon(after!.icon), "…still the lock (the seal is still there)").toContain("<rect");

  // 5. Reload: the chip says so.
  await page.reload({ waitUntil: "domcontentloaded" });
  const chip2 = await findChip(page, "Restricted · set on this page");
  await chip2.scrollIntoViewIfNeeded();
  const box2 = await chip2.boundingBox();
  await page.screenshot({ path: `${OUT}/4-chip-restricted.png`, clip: box2 ? { x: Math.max(0, box2.x - 260), y: Math.max(0, box2.y - 40), width: 700, height: 110 } : undefined });

  // Tabs render: Attachments (the door to the overlay) and Activity (chips + feed).
  const app2 = await openModal(page, chip2);
  await app2.locator('[data-testid="pd-tab-attachments"]').click();
  await expect(app2.locator('[data-testid="pd-open-overlay"]')).toBeVisible();
  await app2.locator('[data-testid="pd-tab-activity"]').click();
  await expect(app2.locator('[data-testid="pd-chip-seals"]')).toBeVisible();
  await expect(app2.locator('[data-testid="pd-activity-tab"] [data-testid="sv-activity-row"]').first(), "the page has activity rows").toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: `${OUT}/5-modal-activity.png` });

  // Restore: Use space default from the modal (the modal's own control), then confirm the property.
  await app2.locator('[data-testid="pd-tab-overview"]').click();
  await app2.locator('[data-testid="pd-use-space-default"]').click();
  await expect(app2.locator('[data-testid="pd-level-desc"]')).not.toContainText("Set on this page", { timeout: 20000 });
  const restored = await readByline(PAGE_ID);
  console.log("### byline restored:", JSON.stringify(restored));
  expect(restored!.title).not.toMatch(/set on this page/);
  expect(await getKvs(`classification-page-${PAGE_ID}`), "no page override left behind").toBeFalsy();
});

test("a page with no seals gets the dot icon (no lock) and no seal rows", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const spaceId = await spaceIdByKey(SPACE);
  const p = await createPage({ spaceId, title: `HARNESS sv-byline-noseals ${Date.now()}`, adf: doc(heading("Plain", 2), paragraph("nothing sealed here")) });
  try {
    const rr = await inv("refreshByline", { pageId: p.id, force: "1" });
    expect(rr.result?.wrote, `refreshByline wrote (got ${JSON.stringify(rr.result)})`).toBe(true);
    const b = await readByline(p.id);
    console.log("### throwaway byline:", JSON.stringify(b));
    expect(b!.title).toMatch(/^(Unclassified|.+ · space default)$/);
    expect(decodeIcon(b!.icon), "no seals → the DOT, not the lock").not.toContain("<rect");
    expect(decodeIcon(b!.icon)).toContain('r="3"');
    await page.goto(pageUrl(p.id), { waitUntil: "domcontentloaded" });
    const chip = await findChip(page, b!.title);
    await chip.scrollIntoViewIfNeeded();
    const box = await chip.boundingBox();
    await page.screenshot({ path: `${OUT}/6-chip-noseals.png`, clip: box ? { x: Math.max(0, box.x - 260), y: Math.max(0, box.y - 40), width: 700, height: 110 } : undefined });
    const app = await openModal(page, chip);
    await expect(app.locator('[data-testid="pd-seals-empty"]'), "no seal rows, the empty copy instead").toBeVisible({ timeout: 20000 });
    expect(await app.locator('[data-testid="pd-seal-row"]').count()).toBe(0);
    await page.screenshot({ path: `${OUT}/7-modal-noseals.png` });
  } finally {
    await purgePage(p.id).catch(() => {});
  }
});

// ── "Seal attachments…" — the content action in the page ⋯ menu (Part 3c journey 1) ────────────
// Confluence's page header ⋯ button and the Forge action's menu item (DOM dump 2026-09-15 — see
// /tmp/sv-page-details/diag-menu.json). The action opens the SAME resource in mode "seal".
async function openSealAction(page: any) {
  // Confluence's page ⋯ button has no aria-label/testid; it is `#more-actions-trigger` with the
  // text "More actions" (found by DOM dump on 2026-09-15).
  // Two "More actions" buttons exist in the DOM (one hidden); take the visible one.
  const more = page.getByRole("button", { name: "More actions" }).filter({ visible: true }).last();
  await more.waitFor({ state: "visible", timeout: 45000 });
  await more.click();
  // Forge content actions sit under the ⋯ menu's "Apps" submenu (data-testid third-party-button);
  // on dev the item reads "Seal attachments… (Development)".
  const apps = page.locator('[data-testid="third-party-button"], [role="menuitem"]:has-text("Apps")').first();
  await apps.waitFor({ state: "visible", timeout: 20000 });
  await apps.click();
  const item = page.locator('[role="menuitem"], [role="menu"] button, [role="menu"] a').filter({ hasText: /Seal attachments/ }).filter({ hasText: "(Development)" }).first(); // the staging install lists the same item first
  await item.waitFor({ state: "visible", timeout: 20000 });
  await item.click();
  // Same locator as _door.ts: any iframe of the dev env. The narrower data-testid/title pair this
  // spec used stopped matching Confluence's modal iframe (2026-09-17) while _door.ts kept working.
  const ifr = page.locator(`iframe[src*="${DEV_ENV}"]`);
  let app: any = null;
  await expect.poll(async () => {
    const n = await ifr.count();
    for (let i = 0; i < n; i++) {
      const f = ifr.nth(i).contentFrame();
      if ((await f.locator('[data-testid="pd-modal"][data-mode="seal"][data-ready="1"]').count().catch(() => 0)) > 0) { app = f; return true; }
    }
    return false;
  }, { timeout: 60000, message: "the seal action opens the page-details resource in mode seal" }).toBe(true);
  return app;
}

test("Seal attachments… from the page ⋯ menu: two uploaded files, select both, seal → Sealed · yours, KVS records, byline lock", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const spaceId = await spaceIdByKey(SPACE);
  const p = await createPage({ spaceId, title: `HARNESS sv-seal-action ${Date.now()}`, adf: doc(heading("Seal me", 2), paragraph("two files below")) });
  const a1 = await uploadAttachment(p.id, `sv-seal-action-one-${Date.now()}.txt`, "first file");
  const a2 = await uploadAttachment(p.id, `sv-seal-action-two-${Date.now()}.txt`, "second file");
  try {
    await page.goto(pageUrl(p.id), { waitUntil: "domcontentloaded" });
    const app = await openSealAction(page);
    await expect(app.locator('[data-testid="pd-title"]')).toContainText("Seal attachments");
    const rows = app.locator('[data-testid="pd-attachment-row"]');
    await expect(rows, "both uploads are listed as rows").toHaveCount(2, { timeout: 30000 });
    await expect(app.locator('[data-testid="pd-lozenge"]'), "nothing sealed yet → no lozenge").toHaveCount(0);
    await expect(app.locator('[data-testid="pd-duration"]'), "duration picker shows the space default").toContainText("Space default");
    await expect(app.locator('[data-testid="pd-seal-go"]'), "primary button disabled until a row is selected").toBeDisabled();
    await app.locator('[data-testid="pd-select-all"]').check();
    await expect(app.locator('[data-testid="pd-seal-go"]')).toHaveText("Seal 2 attachments");
    await app.locator('[data-testid="pd-note"]').fill("harness seal-action note");
    await page.screenshot({ path: `${OUT}/8-seal-action-before.png` });
    await app.locator('[data-testid="pd-seal-go"]').click();
    await expect(app.locator('[data-testid="pd-seal-result"]'), "the result line reports both").toContainText("2 attachments sealed", { timeout: 60000 });
    await expect(app.locator('[data-testid="pd-lozenge"]'), "both rows read Sealed · yours").toHaveCount(2);
    for (const t of await app.locator('[data-testid="pd-lozenge"]').allInnerTexts()) expect(t).toMatch(/Sealed · yours/i);
    expect(await app.locator('[data-testid="pd-attachment-check"]:disabled').count(), "sealed rows are no longer selectable").toBe(2);
    await expect(app.locator('[data-testid="pd-seal-go"]'), "nothing left to seal → button disabled").toBeDisabled();
    await expect(app.locator('[data-testid="pd-dropzone"]'), "the upload dropzone stays available").toBeVisible();
    await page.screenshot({ path: `${OUT}/9-seal-action-after.png` });
    // Truth in KVS and on the byline.
    for (const a of [a1, a2]) {
      const rec = await getKvs(`protection-${a.attachmentId}`);
      expect(rec?.lockedBy, `protection-${a.attachmentId} owned by Mihai`).toBe(MIHAI);
      expect(rec?.note, "the note is on the record").toBe("harness seal-action note");
    }
    const b = await readByline(p.id);
    console.log("### seal-action byline:", JSON.stringify(b));
    expect(decodeIcon(b!.icon), "two live seals → the LOCK on the byline").toContain("<rect");
    expect(b!.tooltip).toContain("2 seals on this page");
    // One state, one action (mockup decision 5): for the owner the PRIMARY is Release; ⋯ holds Extend.
    // Re-resolve the modal frame by CONTENT: sealing re-mounts the ribbon iframe and the dev-iframe
    // index the earlier handle was built on is stale after that.
    const fresh = await (async () => {
      const ifr2 = page.locator(`iframe[src*="${DEV_ENV}"]`);
      let found: any = null;
      await expect.poll(async () => { const n = await ifr2.count(); for (let i = 0; i < n; i++) { const f = ifr2.nth(i).contentFrame(); if ((await f.locator('[data-testid="pd-attachment-row"]').count().catch(() => 0)) > 0) { found = f; return true; } } return false; }, { timeout: 30000 }).toBe(true);
      return found;
    })();
    const first = fresh.locator('[data-testid="pd-attachment-row"]').first();
    await first.locator('[data-testid="pd-kebab"]').click();
    await expect(fresh.locator('[data-testid="pd-menu-extend"]'), "⋯ offers Extend to the owner").toBeVisible();
    await expect(fresh.locator('[data-testid="pd-menu-release"]'), "Release is NOT in ⋯ — it is the primary").toHaveCount(0);
    // Close the menu INSIDE the app frame (a host-page Escape never reaches the iframe).
    await first.locator('[data-testid="pd-kebab"]').click();
    await expect(fresh.locator('[data-testid="pd-menu-extend"]')).toHaveCount(0);
    await first.locator('[data-testid="pd-primary"][data-action="release"]').click();
    await expect(fresh.locator('[data-testid="pd-lozenge"]'), "Release drops one lozenge").toHaveCount(1, { timeout: 30000 });
  } finally {
    for (const a of [a1, a2]) await delKvs(`protection-${a.attachmentId}`).catch(() => {});
    await purgePage(p.id).catch(() => {});
  }
});

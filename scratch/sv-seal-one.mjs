// Seal ONE attachment via the doc-ribbon "Manage Attachments" overlay (the live door on this
// production install of Sentinel Vault on leanzero-demo — the newer byline-chip / content-action
// doors seen in the dev harness specs are NOT present in this installed version).
import { chromium } from "@playwright/test";

const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-sentinel-vault";
const BASE = "https://leanzero-demo.atlassian.net";
const OUT = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/sentinel-vault";

const PAGE_ID = process.argv[2] || "851969";
const FILENAME = process.argv[3] || "Information-Security-Policy-v3.2.pdf";
const TAG = process.argv[4] || "secdoc-infosec";

async function findRibbon(page) {
  const ifr0 = page.locator('iframe[title*="Embedded app content"]');
  const n0 = await ifr0.count().catch(() => 0);
  for (let i = 0; i < n0; i++) {
    const cf = ifr0.nth(i).contentFrame();
    const cand = cf.locator(".ribbon-bar");
    if (await cand.count().catch(() => 0)) return { cf, ribbon: cand };
  }
  return null;
}

async function findOverlay(page) {
  const ifr = page.locator('iframe[title*="Embedded app content"]');
  const n = await ifr.count().catch(() => 0);
  let best = null, bestArea = 0;
  for (let i = 0; i < n; i++) {
    const box = await ifr.nth(i).boundingBox().catch(() => null);
    const area = box ? box.width * box.height : 0;
    const cf = ifr.nth(i).contentFrame();
    if ((await cf.locator(".modal-container").count().catch(() => 0)) > 0 && area > bestArea) { bestArea = area; best = cf; }
  }
  return best;
}

const context = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1440, height: 900 } });
const page = context.pages()[0] || (await context.newPage());
try {
  console.log(`\n=== SEAL: page ${PAGE_ID} — ${FILENAME} ===`);
  await page.goto(`${BASE}/wiki/pages/viewpage.action?pageId=${PAGE_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  const r0 = await findRibbon(page);
  if (!r0) throw new Error("ribbon not found");
  const statusBefore = (await r0.ribbon.locator(".ribbon-status").innerText().catch(() => "")).trim();
  console.log("### ribbon status BEFORE:", JSON.stringify(statusBefore));
  await page.screenshot({ path: `${OUT}/20-${TAG}-before-ribbon.png`, fullPage: false });

  await r0.ribbon.locator(".ribbon-action").click();
  await page.waitForTimeout(5000);

  const overlay = await findOverlay(page);
  if (!overlay) throw new Error("overlay modal not found");
  await page.screenshot({ path: `${OUT}/21-${TAG}-overlay-before-seal.png`, fullPage: true });

  const card = overlay.locator(".artifact-card", { hasText: FILENAME });
  await card.waitFor({ state: "visible", timeout: 15000 });
  const statusPill = card.locator(".status-lozenge");
  const before = (await statusPill.innerText().catch(() => "")).trim();
  console.log("### card status pill BEFORE:", JSON.stringify(before));
  const sealBtn = card.locator(".action-btn", { hasText: "Seal" });
  const releaseBtn = card.locator(".action-btn", { hasText: /Release|Extend/i });
  if ((await sealBtn.count()) > 0) {
    await sealBtn.click();
    console.log("### clicked Seal");
  } else {
    console.log("### no Seal button found — dumping card text:", await card.innerText().catch(() => ""));
  }
  await page.waitForTimeout(3000);
  const after = (await overlay.locator(".artifact-card", { hasText: FILENAME }).locator(".status-lozenge").innerText().catch(() => "")).trim();
  console.log("### card status pill AFTER seal click:", JSON.stringify(after));
  await page.screenshot({ path: `${OUT}/22-${TAG}-overlay-after-seal.png`, fullPage: true });
  const cardHtml = await overlay.locator(".artifact-card", { hasText: FILENAME }).innerHTML().catch(() => "");
  console.log("### card HTML after seal:", cardHtml.slice(0, 1500));

  // close overlay
  await overlay.locator(".modal-close, .modal-footer .btn-primary").first().click().catch(() => {});
  await page.waitForTimeout(1000);

  // RELOAD + re-verify
  await page.goto(`${BASE}/wiki/pages/viewpage.action?pageId=${PAGE_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const r1 = await findRibbon(page);
  const statusAfterReload = (await r1.ribbon.locator(".ribbon-status").innerText().catch(() => "")).trim();
  console.log("### ribbon status AFTER RELOAD:", JSON.stringify(statusAfterReload));
  await page.screenshot({ path: `${OUT}/23-${TAG}-after-reload-ribbon.png`, fullPage: false });

  await r1.ribbon.locator(".ribbon-action").click();
  await page.waitForTimeout(4000);
  const overlay2 = await findOverlay(page);
  const card2 = overlay2.locator(".artifact-card", { hasText: FILENAME });
  const finalStatus = (await card2.locator(".status-lozenge").innerText().catch(() => "")).trim();
  console.log("### FINAL status pill after reload + reopen:", JSON.stringify(finalStatus));
  await page.screenshot({ path: `${OUT}/24-${TAG}-overlay-after-reload.png`, fullPage: true });
  const card2Html = await card2.innerHTML().catch(() => "");
  console.log("### card2 HTML:", card2Html.slice(0, 1500));
} finally {
  await context.close();
}

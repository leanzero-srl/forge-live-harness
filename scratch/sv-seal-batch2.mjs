// Seal the real attachments across ENG, PROD, PEOPLE, SALES via the doc-ribbon "Manage Attachments"
// overlay (the live door on this production install of Sentinel Vault on leanzero-demo — same
// mechanics as sv-seal-one.mjs, looped over multiple pages in one persistent browser context).
import { chromium } from "@playwright/test";

const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-sentinel-vault";
const BASE = "https://leanzero-demo.atlassian.net";
const OUT = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/sentinel-vault";

const TARGETS = [
  { pageId: "884762", filename: "architecture-diagram.png", tag: "eng-archdiagram" },
  { pageId: "983041", filename: "q3-platform-reliability-report.pdf", tag: "eng-q3report" },
  { pageId: "1671175", filename: "atlas-idp-catalog-mockup-v2.png", tag: "prod-atlasidp" },
  { pageId: "1703937", filename: "voyager-onboarding-mockup-v3.png", tag: "prod-voyagermockup" },
  { pageId: "1441825", filename: "voyager-onboarding-research-report.pdf", tag: "prod-voyagerresearch" },
  { pageId: "294930", filename: "harborlight-org-chart.png", tag: "people-orgchart" },
  { pageId: "1409025", filename: "Case-Study-Meridian-Retail-Group.pdf", tag: "sales-meridian" },
  { pageId: "1441793", filename: "Case-Study-Cascade-Health-Systems.pdf", tag: "sales-cascade" },
  { pageId: "1540097", filename: "Harborlight-Atlas-Platform-Pricing-2026.pdf", tag: "sales-pricing" },
];

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

async function sealOne(page, { pageId: PAGE_ID, filename: FILENAME, tag: TAG }) {
  console.log(`\n=== SEAL: page ${PAGE_ID} — ${FILENAME} (${TAG}) ===`);
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
  if ((await sealBtn.count()) > 0) {
    await sealBtn.click();
    console.log("### clicked Seal");
  } else {
    console.log("### no Seal button found — dumping card text:", await card.innerText().catch(() => ""));
    throw new Error(`no Seal button for ${TAG}`);
  }
  await page.waitForTimeout(3000);
  const after = (await overlay.locator(".artifact-card", { hasText: FILENAME }).locator(".status-lozenge").innerText().catch(() => "")).trim();
  console.log("### card status pill AFTER seal click:", JSON.stringify(after));
  await page.screenshot({ path: `${OUT}/22-${TAG}-overlay-after-seal.png`, fullPage: true });

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
  await overlay2.locator(".modal-close, .modal-footer .btn-primary").first().click().catch(() => {});
  await page.waitForTimeout(500);

  return { pageId: PAGE_ID, filename: FILENAME, tag: TAG, statusBefore, statusAfterReload, finalStatus };
}

const context = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1440, height: 900 } });
const page = context.pages()[0] || (await context.newPage());
const results = [];
try {
  for (const t of TARGETS) {
    try {
      const r = await sealOne(page, t);
      results.push(r);
    } catch (e) {
      console.log(`### FAILED sealing ${t.tag}:`, e.message);
      results.push({ ...t, error: e.message });
    }
  }
} finally {
  await context.close();
}
console.log("\n\n### FINAL SUMMARY:", JSON.stringify(results, null, 2));

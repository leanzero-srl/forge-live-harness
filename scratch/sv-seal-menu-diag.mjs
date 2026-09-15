import { chromium } from "@playwright/test";

const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-sentinel-vault";
const BASE = "https://leanzero-demo.atlassian.net";
const OUT = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/sentinel-vault";
const PAGE_ID = "851969"; // Information Security Policy (SECDOC)

const context = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1440, height: 900 } });
const page = context.pages()[0] || (await context.newPage());
try {
  await page.goto(`${BASE}/wiki/pages/viewpage.action?pageId=${PAGE_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/10-page-before-menu.png`, fullPage: false });

  const more = page.getByRole("button", { name: "More actions" }).filter({ visible: true }).last();
  console.log("### more actions count:", await more.count().catch(() => -1));
  await more.waitFor({ state: "visible", timeout: 20000 });
  await more.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/11-more-actions-menu.png`, fullPage: false });
  const menuText = await page.locator('[role="menu"]').first().innerText().catch(() => "NO MENU");
  console.log("### more-actions menu text:", JSON.stringify(menuText));

  const apps = page.locator('[data-testid="third-party-button"], [role="menuitem"]:has-text("Apps")').first();
  console.log("### apps submenu trigger count:", await apps.count().catch(() => -1));
  if (await apps.count().catch(() => 0)) {
    await apps.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/12-apps-submenu.png`, fullPage: false });
    const subText = await page.locator('[role="menu"]').last().innerText().catch(() => "NO SUBMENU");
    console.log("### apps submenu text:", JSON.stringify(subText));
  }
} finally {
  await context.close();
}

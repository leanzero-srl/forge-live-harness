import { chromium } from "@playwright/test";

const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-sentinel-vault";
const BASE = "https://leanzero-demo.atlassian.net";
const OUT = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/sentinel-vault";
const PAGE_ID = "851969"; // Information Security Policy (SECDOC)

const context = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1440, height: 900 } });
const page = context.pages()[0] || (await context.newPage());
try {
  await page.goto(`${BASE}/wiki/pages/viewpage.action?pageId=${PAGE_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const ifr0 = page.locator('iframe[title*="Embedded app content"]');
  const n0 = await ifr0.count().catch(() => 0);
  console.log("### embedded app iframes:", n0);
  let btn = null;
  for (let i = 0; i < n0; i++) {
    const cf = ifr0.nth(i).contentFrame();
    const cand = cf.getByRole("button", { name: /Manage Attachments/i }).first();
    if (await cand.count().catch(() => 0)) { btn = cand; console.log(`  found in iframe#${i}`); break; }
  }
  if (!btn) { console.log("### not found inside embedded iframes; trying top-level"); btn = page.getByRole("button", { name: /Manage Attachments/i }).first(); }
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/14-manage-attachments-clicked.png`, fullPage: true });

  const ifr = page.locator("iframe");
  const m = await ifr.count().catch(() => 0);
  console.log("### iframes after click:", m);
  for (let i = 0; i < m; i++) {
    const src = await ifr.nth(i).getAttribute("src").catch(() => "");
    const title = await ifr.nth(i).getAttribute("title").catch(() => "");
    const box = await ifr.nth(i).boundingBox().catch(() => null);
    console.log(`  iframe#${i} title=${JSON.stringify(title)} box=${JSON.stringify(box)} src=${(src||"").slice(0,100)}`);
  }
  // dump text of the largest iframe
  let best = -1, bestArea = 0;
  for (let i = 0; i < m; i++) {
    const box = await ifr.nth(i).boundingBox().catch(() => null);
    const area = box ? box.width*box.height : 0;
    if (area > bestArea) { bestArea = area; best = i; }
  }
  if (best >= 0) {
    const cf = ifr.nth(best).contentFrame();
    const txt = await cf.locator("body").innerText().catch(() => "NO TEXT");
    console.log("### largest iframe body text:", JSON.stringify(txt.slice(0, 2000)));
    const html = await cf.locator("body").innerHTML().catch(() => "NO HTML");
    console.log("### largest iframe body HTML (3000-9000):", html.slice(3000, 9000));
  }
} finally {
  await context.close();
}

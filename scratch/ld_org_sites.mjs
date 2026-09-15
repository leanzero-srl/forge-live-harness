import { chromium } from "@playwright/test";
const PROFILE = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto("https://admin.atlassian.com/o/217bc256-kddj-14b3-kkdk-jb6bk7692jbk/products", { waitUntil: "load", timeout: 20000 }).catch(e => console.log("ERR:", e.message));
await page.waitForTimeout(2500);
console.log("URL:", page.url());
const bodyText = await page.evaluate(() => document.body.innerText).catch(()=>"");
console.log(bodyText.slice(0, 2500));
await page.screenshot({ path: "scratch/org-products.png", fullPage: true }).catch(()=>{});
await context.close();

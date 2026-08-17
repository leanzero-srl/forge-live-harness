import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = await chromium.launchPersistentContext(path.join(ROOT, ".auth", "profile"), { headless: false, viewport: { width: 1440, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto("https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=299762223", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10000);
  const count = await page.locator('text=Attachment Locker').count();
  console.log(count === 0 ? "CLEAN: no Attachment Locker anywhere on the page" : "STILL PRESENT: " + count + " matches");
  await page.screenshot({ path: "/tmp/sv-upm/byline-after.png" });
} finally { await ctx.close(); }

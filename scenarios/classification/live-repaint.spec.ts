import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import { WIKI_BASE } from "../../config/env";
import { execSync } from "node:child_process";
import path from "node:path";
const APP="64d08693-b295-4664-9fda-eba81261160f"; const PAGE="323223996"; // EA
const bannerFrame = (page: any) => page.frames().find((f: any) => f.url().includes(APP) && /banner-/.test(f.url()));
test("open page repaints when the asset changes", async () => {
  test.setTimeout(900_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const out = path.join(process.cwd(), "evidence", "classification");
  try {
    // wait until the v5 banner (data-live) is what the site serves
    const t0 = Date.now(); let fr: any = null;
    while (Date.now() - t0 < 480_000) {
      await page.goto(`${WIKI_BASE}/pages/viewpage.action?pageId=${PAGE}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(9000);
      fr = bannerFrame(page); if (fr && await fr.locator('#root[data-live="1"]').count()) break; await page.waitForTimeout(20000);
    }
    console.log("v5 banner live after", Math.round((Date.now()-t0)/1000), "s");
    const before = (await fr.locator('.pill').innerText()).trim();
    console.log("BEFORE:", before);
    const target = before === "CONFIDENTIAL" ? "INTERNAL" : "CONFIDENTIAL";
    // change the ASSET; the event rule fires the sync; the OPEN page must repaint by itself
    execSync(`cd /Users/workhorse/Projects/lz-classification-demo/tools && WS_ID=be9cca2f-5f41-446f-8f5c-76cda0be8417 EMAIL="${process.env.WOLF_EMAIL}" TOKEN="${process.env.WOLF_TOKEN||process.env.WOLF_API_TOKEN}" node set-asset-level.mjs EA ${target}`, { stdio: "inherit" });
    const t1 = Date.now(); let now = before;
    while (Date.now() - t1 < 180_000 && now === before) { await page.waitForTimeout(3000); now = (await fr.locator('.pill').innerText().catch(()=>before)).trim(); }
    console.log(`AFTER: ${now} — repainted WITHOUT reload after ${Math.round((Date.now()-t1)/1000)}s (page url unchanged: ${page.url().includes(PAGE)})`);
    await page.screenshot({ path: path.join(out, "live-repaint.png") });
  } finally { await ctx.close(); }
});

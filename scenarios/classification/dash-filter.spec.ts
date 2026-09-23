import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import path from "node:path";
const APP="64d08693-b295-4664-9fda-eba81261160f";
test("dashboard polish + filter", async () => {
  test.setTimeout(600_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const out = path.join(process.cwd(), "evidence", "classification");
  try {
    const t0 = Date.now(); let fr: any = null;
    while (Date.now() - t0 < 420_000) {   // wait until the NEW build (has data-f tiles) is live
      await page.goto(process.env.DASH_URL!, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(12000);
      fr = null; for (const f of page.frames()) if (f.url().includes(APP) && await f.locator('.hero[data-v="4"]').count()) { fr = f; break; }
      if (fr) break;
      await page.waitForTimeout(20000);
    }
    console.log("new build live after", Math.round((Date.now()-t0)/1000), "s");
    await page.screenshot({ path: path.join(out, "dash-polished.png") });
    // Custom UI is an iframe INSIDE Forge's wrapper iframe; both carry the app id. Pick the one with tiles.
    const t1 = Date.now(); fr = null;
    while (Date.now() - t1 < 60_000 && !fr) {
      for (const f of page.frames()) { if (f.url().includes(APP) && await f.locator('button.tile[data-f]').count()) { fr = f; break; } }
      if (!fr) await page.waitForTimeout(1500);
    }
    if (!fr) throw new Error("no frame with tiles; frames=" + page.frames().map(f=>f.url().slice(0,80)).join(" | "));
    await page.screenshot({ path: path.join(out, "dash-polished.png") });
    await fr.locator('button.tile[data-f="CONFIDENTIAL"]').first().click(); await page.waitForTimeout(900);
    const txt = await fr.evaluate(() => document.body.innerText);
    console.log("FILTERED:", (txt.match(/Showing \d+ of \d+/)||[''])[0], "| rows with CONFIDENTIAL pill:", (txt.match(/CONFIDENTIAL/g)||[]).length);
    await page.screenshot({ path: path.join(out, "dash-filtered.png") });
    await fr.locator('.legend button[data-f="RESTRICTED"]').first().scrollIntoViewIfNeeded();
    await fr.locator('.legend button[data-f="RESTRICTED"]').first().click(); await page.waitForTimeout(900);
    const t2 = await fr.evaluate(() => document.body.innerText);
    console.log("LEGEND FILTER:", (t2.match(/Showing \d+ of \d+/)||[''])[0], "| active tile:", await fr.locator('.tile.on').getAttribute('data-f'));
    await page.screenshot({ path: path.join(out, "dash-filtered-2.png") });
  } finally { await ctx.close(); }
});

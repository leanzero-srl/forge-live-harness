import { open, appFrame, shot, openPlan, APP, P2_NAME } from "./drive.mjs";
import { pick, receipt, download, publish } from "./pub.mjs";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
await openPlan(page, f, P2_NAME);
await f.locator('button:has-text("Planning")').first().click(); await page.waitForTimeout(4000);
await f.locator('button:has-text("Sponsor reports")').first().click(); await page.waitForTimeout(4000);
await pick(page, f, "LZ780 archive");
await publish(page, f, "archive-2", shot);      // republish UNCHANGED
await pick(page, f, "LZ780 storyline");
await receipt(page, f, "storyline");
await download(page, f, "storyline-download");
await publish(page, f, "storyline-1", shot);
await publish(page, f, "storyline-2", shot);    // republish UNCHANGED
await ctx.close();

import { open, shot } from "./drive.mjs";
const { ctx, page } = await open();
for (const [id, name] of [["345083666","25-conf-storyline"],["345505793","26-conf-archive"]]) {
  await page.goto(`https://wolfaenpak.atlassian.net/wiki/spaces/LZC4/pages/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  await shot(page, name);
  const t = await page.locator('#main-content, [data-test-id="ak-renderer-document"], main').first().innerText().catch(()=>"");
  console.log("=== "+name+" ===\n"+t.slice(0,1400));
}
await ctx.close();

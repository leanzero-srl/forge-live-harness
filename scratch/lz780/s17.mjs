// Item 4: prove the resolver answer `unchanged:true` on a republish of an untouched report
import { open, appFrame, shot, openPlan, APP, P2_NAME } from "./drive.mjs";
import { pick, publish } from "./pub.mjs";
const { ctx, page } = await open();
const bodies = [];
page.on('response', async (res) => {
  const u = res.url();
  if (!/invoke|gateway/.test(u)) return;
  try { const t = await res.text(); if (/pageId|unchanged|confluence/i.test(t)) bodies.push(t.slice(0, 1500)); } catch {}
});
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
await openPlan(page, f, P2_NAME);
await f.locator('button:has-text("Planning")').first().click(); await page.waitForTimeout(4000);
await f.locator('button:has-text("Sponsor reports")').first().click(); await page.waitForTimeout(4000);
await pick(page, f, process.env.REPORT || "LZ780 storyline");
bodies.length = 0;
await publish(page, f, "unchanged-probe", shot);
console.log("\n=== INVOKE BODIES ===");
for (const b of bodies) console.log(b.replace(/\s+/g,' ').slice(0,900), "\n---");
await ctx.close();

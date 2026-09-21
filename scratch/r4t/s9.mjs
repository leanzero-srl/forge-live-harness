import { open, appFrame, shot, APP, PLAN_NAME } from "./drive.mjs";
import { rest } from "./rest.mjs";
import { setDates } from "../../data/jira-build.mjs";
const P = process.env.PLAN;
const fc = { startDate:"customfield_10015", dueDate:"duedate", duration:"customfield_10180", buffer:"customfield_10181" };
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
for (let i=0;i<40;i++){ const t=await f.locator('body').innerText(); if(t.includes(PLAN_NAME)) break; await page.waitForTimeout(2000); }
await f.locator(`text=${PLAN_NAME}`).first().click();
for (let i=0;i<40;i++){ if(await f.locator('[data-testid="derived-count-chip"]').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);
await f.locator('[data-testid="derived-count-chip"]').first().click();
const d = f.locator('[data-testid="derived-review-dialog"]');
await d.waitFor({ timeout: 20000 });
await d.locator('[data-testid="derived-review-past-toggle"]').click(); await page.waitForTimeout(500);
const rowP = () => d.locator('[data-testid="derived-review-row"][data-key="WFH-3682"] [data-testid="derived-review-jira"]').innerText();
console.log("before P jira =", await rowP());
const t0 = Date.now();
await setDates("WFH-3682", { start: "2026-10-26", due: "2026-10-30", duration: 5, buffer: "No" }, fc);
await rest(`resource=plans&id=${P}&action=index`, { method: "POST" });
console.log("jira changed + reindex queued");
let amberAt=null;
for (let i=0;i<90;i++){
  await page.waitForTimeout(1000);
  if (!amberAt && await d.locator('[data-testid="derived-review-moved"]').count()) { amberAt=((Date.now()-t0)/1000).toFixed(1); break; }
}
console.log("AMBER at", amberAt, "s; P jira now =", await rowP().catch(()=>"-"));
if (amberAt) {
  console.log("amber text:", await d.locator('[data-testid="derived-review-moved"]').innerText());
  console.log("adopt disabled while amber:", await d.locator('[data-testid="derived-review-adopt"]').isDisabled());
  await shot(page, "14-amber-reachable");
  await d.locator('[data-testid="derived-review-moved"] button').click(); await page.waitForTimeout(600);
  console.log("after ack: amber=", await d.locator('[data-testid="derived-review-moved"]').count(), "adopt disabled=", await d.locator('[data-testid="derived-review-adopt"]').isDisabled());
} else { await shot(page, "14-amber-none"); console.log(await d.innerText()); }
await ctx.close();

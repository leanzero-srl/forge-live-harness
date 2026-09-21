// Item 2: F16 dialog fingerprint — a JIRA-side change to a listed row must announce itself
import { open, appFrame, shot, openPlan, APP, P1_NAME } from "./drive.mjs";
import { setDates } from "../../data/jira-build.mjs";
import { hook } from "./rest.mjs";
const fc = { startDate:"customfield_10015", dueDate:"duedate", duration:"customfield_10180", buffer:"customfield_10181" };
const PLAN = process.env.PLAN_ID;
const KEY = "WFH-3708";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
await openPlan(page, f, P1_NAME);
await f.locator('[data-testid="derived-count-chip"]').click();
const d = f.locator('[data-testid="derived-review-dialog"]');
await d.waitFor({ timeout: 20000 });
await page.waitForTimeout(1000);
const rowText = async () => {
  const r = d.locator(`[data-testid="derived-review-row"][data-key="${KEY}"]`);
  return { jira: await r.locator('[data-testid="derived-review-jira"]').innerText(),
           sched: await r.locator('[data-testid="derived-review-schedule"]').innerText(),
           delta: await r.locator('[data-testid="derived-review-delta"]').innerText(),
           wd: await r.locator('[data-testid="derived-review-delta"]').getAttribute("data-wd") };
};
console.log("BEFORE", JSON.stringify(await rowText()));
console.log("moved block before:", await d.locator('[data-testid="derived-review-moved"]').count());
console.log("adopt disabled before:", await d.locator('[data-testid="derived-review-adopt"]').isDisabled());
await shot(page, "f16-01-open");
// Change the row IN JIRA, then re-index
const t0 = Date.now();
await setDates(KEY, { start: "2026-10-26", due: "2026-10-30", duration: 5, buffer: "No" }, fc);
console.log("jira write done at", ((Date.now()-t0)/1000).toFixed(1), "s");
const ix = await hook(`what=refreshPlan&planId=${PLAN}`);
console.log("reindex ok=", ix.ok, "at", ((Date.now()-t0)/1000).toFixed(1), "s");
let seen = 0;
for (let i = 0; i < 90; i++) {
  if (await d.locator('[data-testid="derived-review-moved"]').count()) { seen = Date.now(); break; }
  await page.waitForTimeout(1000);
}
console.log("AMBER BLOCK after", seen ? ((seen-t0)/1000).toFixed(1)+"s" : "NEVER (90s)");
if (seen) {
  console.log("moved text:", JSON.stringify(await d.locator('[data-testid="derived-review-moved"]').innerText()));
  console.log("adopt disabled while moved:", await d.locator('[data-testid="derived-review-adopt"]').isDisabled());
  await shot(page, "f16-02-amber");
  await d.locator('[data-testid="derived-review-moved"] button').click();
  await page.waitForTimeout(800);
  console.log("AFTER ack:", JSON.stringify(await rowText()));
  console.log("adopt disabled after ack:", await d.locator('[data-testid="derived-review-adopt"]').isDisabled());
  console.log("SUBTITLE now:", JSON.stringify(await d.locator('[data-testid="derived-review-subtitle"]').innerText()));
  await shot(page, "f16-03-after-ack");
}
await ctx.close();

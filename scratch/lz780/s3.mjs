// Item 1c: bulk bar counts adoptable only; Item 1d: dialog subtitle adds to the chip
import { open, appFrame, shot, openPlan, APP, P1_NAME } from "./drive.mjs";
const NAME = process.env.PLAN_NAME || P1_NAME, TAG = process.env.TAG || "p1";
const DONE_KEY = process.env.DONE_KEY || "WFH-3710", LEAF_KEY = process.env.LEAF_KEY || "WFH-3708";
const { ctx, page } = await open();
await page.goto(APP, { waitUntil: "domcontentloaded" });
const f = await appFrame(page);
await openPlan(page, f, NAME);
await f.locator('button:has-text("Table")').first().click();
await page.waitForTimeout(4000);
const pick = async (key) => {
  const row = f.locator(`[data-testid="table-row"][data-row-key="${key}"]`).first();
  await row.scrollIntoViewIfNeeded();
  await row.locator('[role="checkbox"], input[type="checkbox"], button[title^="Select"]').first().click();
  await page.waitForTimeout(900);
};
const bulk = async (tag) => {
  const b = f.locator('[data-testid="bulk-adopt-derived"]');
  const n = await b.count();
  if (!n) { console.log(`BULK ${tag}: (button absent)`); return; }
  console.log(`BULK ${tag}: label=${JSON.stringify(await b.innerText())} data-count=${await b.getAttribute("data-count")} disabled=${await b.isDisabled()} title=${JSON.stringify(await b.getAttribute("title"))}`);
};
await pick(DONE_KEY); await shot(page, `${TAG}-bulk-done-only`); await bulk("done row only");
await pick(LEAF_KEY); await shot(page, `${TAG}-bulk-done-plus-leaf`); await bulk("done + adoptable");
// clear selection and open the review dialog from the chip
await pick(DONE_KEY); await pick(LEAF_KEY);
await f.locator('[data-testid="derived-count-chip"]').click();
await f.locator('[data-testid="derived-review-dialog"]').waitFor({ timeout: 20000 });
await page.waitForTimeout(1200);
const d = f.locator('[data-testid="derived-review-dialog"]');
console.log("SUBTITLE:", JSON.stringify(await d.locator('[data-testid="derived-review-subtitle"]').innerText()));
console.log("SELECT-ALL LINE:", JSON.stringify((await d.innerText()).split("\n").slice(0,8)));
const rows = await d.locator('[data-testid="derived-review-row"]').all();
for (const r of rows) console.log("ROW", await r.getAttribute("data-key"), "sel=", await r.getAttribute("data-selected"));
console.log("FINISH:", JSON.stringify(await d.locator('[data-testid="derived-review-finish"]').innerText()));
console.log("ADOPT:", JSON.stringify(await d.locator('[data-testid="derived-review-adopt"]').innerText()), "disabled=", await d.locator('[data-testid="derived-review-adopt"]').isDisabled());
await shot(page, `${TAG}-review-dialog`);
for (const g of ["past","done","parents"]) {
  const t = f.locator(`[data-testid="derived-review-${g}-toggle"]`);
  if (await t.count()) { console.log("GROUP", g, JSON.stringify(await t.innerText())); }
  else console.log("GROUP", g, "ABSENT");
}
await ctx.close();

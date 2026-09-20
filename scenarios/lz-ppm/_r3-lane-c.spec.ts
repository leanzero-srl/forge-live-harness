// ROUND-3 item 3 on bed 2: 14 overdue tickets present, and "Read the comments" must
// still read the HOLD-UP ticket's comments (the ladder is hold-ups, then finish,
// then overdue). WFH-X is the named hold-up of the only non-uniform zero-room beat.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
// @ts-ignore
import { get, post, request } from "../../data/jira.mjs";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const bed = JSON.parse(fs.readFileSync(`${OUT}/bed2.json`, "utf8"));
const HOLDUP = bed.x[0];
const MARK = `R3NOTE-${Date.now().toString(36)}`;
const C1 = `${MARK} The regulator confirmed the audit slot slipped to the last week of March, so this window cannot start earlier.`;
const C2 = `${MARK} Legal signed off on the submission pack; the only open item is the regulator's own calendar.`;
const adf = (t: string) => ({ type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const posted: string[] = [];

test("C1 two comments on the hold-up, then Read the comments shows them on its beat", async ({ page }) => {
  for (const t of [C1, C2]) {
    const r: any = await post(`/rest/api/3/issue/${HOLDUP}/comment`, { body: adf(t) });
    posted.push(r.id);
  }
  console.log("POSTED on", HOLDUP, posted.join(","));
  const overdue = bed.o.length;
  console.log("OVERDUE TICKETS IN PLAN:", overdue);
  expect(overdue).toBeGreaterThanOrEqual(13);

  await page.setViewportSize({ width: 1600, height: 1300 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no frame");
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.planName }).first().click();
  await page.waitForTimeout(7000);
  if (!/Gantt/i.test(await body(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.locator('[data-testid="view-tab-storyline"]').first().click();
  await frame.locator('[data-testid="storyline-view"]').waitFor({ state: "visible", timeout: 240_000 });
  await page.waitForTimeout(4000);
  const btn = frame.locator('[data-testid="storyline-notes-build"]');
  console.log("NOTES BUTTON:", await txt(btn), "count", await btn.count());
  await btn.click({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const dlg = frame.locator('[role="dialog"]').first();
  const dtext = (await txt(dlg)).replace(/\n/g, " | ");
  console.log("CONFIRM:", dtext);
  fs.writeFileSync(`${OUT}/C1-confirm.txt`, dtext);
  await page.screenshot({ path: `${OUT}/C1-confirm.png` });
  await dlg.getByRole("button", { name: /Read them|Read the comments|Continue/i }).first().click();
  for (let i = 0; i < 140; i++) {
    if (!/Reading the comments/i.test(await body(frame))) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(6000);
  console.log("BUILD BAR AFTER:", (await txt(frame.locator('[data-testid="storyline-build"]'))).replace(/\n/g, " | "));
  await page.screenshot({ path: `${OUT}/C1-after.png`, fullPage: true });
  const bars = await frame.locator('[data-testid="storyline-beat"]').all();
  let found = "";
  for (let i = 0; i < bars.length; i++) {
    await bars[i].click(); await page.waitForTimeout(1300);
    const c = frame.locator('[data-testid="beat-card"]').first();
    const notes = c.locator('[data-testid="beat-notes"]');
    if (await notes.count()) {
      const nt = await txt(notes);
      const chips = await c.locator('[data-testid="beat-note"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-note-key"), text: e.textContent })));
      console.log(`--- BEAT ${i} NOTES\n${nt}\nCHIPS: ${JSON.stringify(chips, null, 1)}`);
      found += `BEAT ${i}\nverdict=${await txt(c.locator('[data-testid="beat-verdict"]'))}\n${nt}\nCHIPS=${JSON.stringify(chips)}\n\n`;
      await page.screenshot({ path: `${OUT}/C1-notes-beat-${i}.png` });
    }
    await bars[i].click(); await page.waitForTimeout(300);
  }
  fs.writeFileSync(`${OUT}/C1-notes.txt`, found || "(no beat showed notes)");
  console.log(found ? "NOTES RENDERED" : "NO BEAT SHOWED NOTES");
  console.log("HOLDUP_IN_NOTES=" + found.includes(HOLDUP));
  expect(found.length).toBeGreaterThan(0);
  expect(found, `the hold-up ${HOLDUP} must carry notes`).toContain(HOLDUP);
});

test.afterAll(async () => {
  for (const id of posted) {
    await request("DELETE", `/rest/api/3/issue/${HOLDUP}/comment/${id}`, { raw: true }).then(() => console.log("deleted comment", id)).catch((e: any) => console.log("comment delete FAILED", id, e.message));
  }
  const left: any = await get(`/rest/api/3/issue/${HOLDUP}?fields=comment`);
  const n = (left.fields?.comment?.comments || []).length;
  console.log("COMMENTS_LEFT_ON_HOLDUP=" + n);
});

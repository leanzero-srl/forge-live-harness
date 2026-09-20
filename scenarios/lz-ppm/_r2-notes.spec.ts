// ROUND-2 item 4: press "Read the comments" on the Storyline build bar and read
// "What the tickets say" on the beat that holds WFH-3280.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6720";
const bed = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("N1 read the comments", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
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
  await frame.locator('[data-testid="storyline-view"]').waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(4000);
  const btn = frame.locator('[data-testid="storyline-notes-build"]');
  console.log("NOTES BUTTON:", await txt(btn), "count", await btn.count());
  await btn.click({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const dlg = frame.locator('[role="dialog"]').first();
  const dtext = (await txt(dlg)).replace(/\n/g, " | ");
  console.log("CONFIRM DIALOG:", dtext);
  fs.writeFileSync(`${OUT}/N1-confirm.txt`, dtext);
  await page.screenshot({ path: `${OUT}/N1-confirm.png` });
  await dlg.getByRole("button", { name: /Read them/i }).first().click();
  for (let i = 0; i < 100; i++) {
    if (!/Reading the comments/i.test(await body(frame))) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(5000);
  console.log("BUILD BAR AFTER:", (await txt(frame.locator('[data-testid="storyline-build"]'))).replace(/\n/g, " | "));
  await page.screenshot({ path: `${OUT}/N1-after.png`, fullPage: true });
  // find the beat that holds WFH-3280
  const slots = await frame.locator('[data-testid="storyline-beat-slot"]').all();
  let found = "";
  for (let i = 0; i < slots.length; i++) {
    await slots[i].click().catch(() => {});
    await page.waitForTimeout(1200);
    const c = frame.locator('[data-testid="beat-card"]').first();
    const t = await txt(c);
    const notes = c.locator('[data-testid="beat-notes"]');
    if (await notes.count()) {
      const nt = await txt(notes);
      const chips = await c.locator('[data-testid="beat-note"]').evaluateAll((els: any[]) =>
        els.map((e) => ({ key: e.getAttribute("data-note-key"), text: e.textContent })));
      console.log(`--- BEAT ${i} HAS NOTES\n${nt}\nCHIPS: ${JSON.stringify(chips, null, 1)}`);
      found += `BEAT ${i}\n${t}\nCHIPS=${JSON.stringify(chips)}\n\n`;
      await page.screenshot({ path: `${OUT}/N1-beat-notes-${i}.png` });
    }
  }
  fs.writeFileSync(`${OUT}/N1-notes.txt`, found || "(no beat showed notes)");
  console.log(found ? "NOTES RENDERED" : "NO BEAT SHOWED NOTES");
  expect(found.length).toBeGreaterThan(0);
});

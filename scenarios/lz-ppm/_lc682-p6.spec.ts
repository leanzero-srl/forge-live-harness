// RETEST dev 6.82.0 — the STANDING WITNESS (f59ee69f): does a clean-looking Discard All
// leave a draft behind, and if a row survives in KVS, does it come BACK to the user?
// p5 measured clearDrafts -> cleared: 1 after a Discard All that reverted every bar and
// read "Saved". Cleared-1 alone is not harm; the harm is the edits returning on reload.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
// @ts-ignore
import { loadEnv } from "../../data/env.mjs";
import * as fs from "fs";

loadEnv();
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots";
const NAME = "LC682 Lag Bed";
const PLAN = "plan-test-mu9h1p8f-pxi5vy";
const HEAD = "WFH-3487";
test.describe.configure({ retries: 0, timeout: 2_700_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
async function hook(what: string, params: Record<string, string> = {}) {
  const u = new URL(process.env.LZ_PPM_TESTHOOK_URL!);
  u.searchParams.set("what", what);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${process.env.HARNESS_SECRET}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("p6 — a draft after Discard All, and whether it comes back", async ({ page }) => {
  const R: any = {};
  const wr = () => fs.writeFileSync(`${OUT}/p6-results.json`, JSON.stringify(R, null, 2));
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  R.draftAtStart = await hook("clearDrafts", { planId: PLAN });
  const open = async () => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = s.frame;
    await page.waitForTimeout(4000);
    await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
    await page.waitForTimeout(3000);
    await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
    await page.waitForTimeout(19000);
    const f: any = await (await frame.locator(":root").elementHandle())!.ownerFrame();
    return { frame, f };
  };
  let { frame, f } = await open();
  const toGantt = async () => { await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {}); await page.waitForTimeout(9000); };
  const readBars = async () => {
    const o: any = {};
    for (const b of await frame.locator('[data-testid="gantt-bar"]').all())
      o[(await b.getAttribute("data-key"))!] = `${await b.getAttribute("data-bar-start")}..${await b.getAttribute("data-bar-due")}`;
    return o;
  };
  const toolbar = async () => {
    const bodyT = await txt(frame.locator("body"));
    const sv = frame.locator('[data-testid="plan-save-btn"]');
    return { saveText: (await txt(sv)).replace(/\n/g, " "), saveState: await sv.getAttribute("data-save-state").catch(() => null), hasChanges: await sv.getAttribute("data-has-changes").catch(() => null), applySeen: /Apply\s+\d+\s+change/.test(bodyT), draftBanner: /draft|restored|unsaved/i.test(bodyT) };
  };

  await toGantt();
  R.barsBefore = await readBars();
  R.toolbarBefore = await toolbar();
  // stage the head +7 calendar days
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${HEAD}"]`).first();
  const box = (await bar.boundingBox())!;
  const dx = Math.round((box.width / 5) * 7);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (const fr of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * fr, cy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(6000);
  R.barsStaged = await readBars();
  R.toolbarStaged = await toolbar();
  wr();
  console.log("STAGED", JSON.stringify(R.barsStaged), JSON.stringify(R.toolbarStaged));
  // let the 60 s autosave fire, and prove a draft exists
  await page.waitForTimeout(80000);
  R.toolbarAfterAutosave = await toolbar();
  console.log("AFTER AUTOSAVE", JSON.stringify(R.toolbarAfterAutosave));
  // Discard All from inside the Apply review
  await frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(7000);
  R.reviewModal = await frame.locator('[data-testid="apply-review-modal"]').count();
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(15000);
  R.toolbarAfterDiscard = await toolbar();
  await toGantt();
  R.barsAfterDiscard = await readBars();
  wr();
  console.log("AFTER DISCARD", JSON.stringify(R.barsAfterDiscard), JSON.stringify(R.toolbarAfterDiscard));
  await page.screenshot({ path: `${OUT}/p6-a-after-discard.png` });

  // ---- the question: reload, reopen, is the discarded edit back? ----
  ({ frame, f } = await open());
  await toGantt();
  R.barsAfterReload = await readBars();
  R.toolbarAfterReload = await toolbar();
  wr();
  console.log("AFTER RELOAD", JSON.stringify(R.barsAfterReload), JSON.stringify(R.toolbarAfterReload));
  await page.screenshot({ path: `${OUT}/p6-b-after-reload.png` });
  R.clearAtExit = await hook("clearDrafts", { planId: PLAN });
  console.log("CLEAR AT EXIT", JSON.stringify(R.clearAtExit));
  wr();
  expect(Object.keys(R.barsBefore).length).toBe(3);
});

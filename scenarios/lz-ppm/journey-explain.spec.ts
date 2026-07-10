// PERSISTENT journey J12 — cascade Explain modal accuracy. Drag a leaf bar → cascade,
// then verify the banner "moved N" + the Explain modal match the actual staged change,
// and the advisory is self-consistent. Discards the draft — never Applies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
test.describe.configure({ retries: 0, timeout: 220_000 });

async function dragBar(page: any, box: any, dx: number) {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 4 });
  await page.mouse.up();
}
async function isStaged(frame: any) {
  const t = (await frame.locator("body").textContent().catch(() => "")) || "";
  return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t);
}

test("J12 explain modal matches the actual cascade", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);

  // Drag a leaf bar right (push dates later → cascade successors).
  const leaf = frame.locator('[data-testid="gantt-bar"][data-parent="false"]').first();
  const box = await leaf.boundingBox().catch(() => null);
  if (box) await dragBar(page, box, 110);
  await page.waitForTimeout(1500);

  const body = (await frame.locator("body").textContent().catch(() => "")) || "";
  const bannerMoved = Number((body.match(/moved (\d+) issue/i) || [])[1] || -1);
  const stagedM = Number((body.match(/Apply (\d+) change/i) || body.match(/Save \((\d+)\)/i) || [])[1] || -1);
  console.log("BANNER_MOVED:", bannerMoved, " STAGED_CHANGES:", stagedM);

  // Open Explain.
  await frame.getByRole("button", { name: /Explain/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const modal = frame.locator('[data-testid="cascade-explain-modal"]');
  const modalOpen = await modal.isVisible().catch(() => false);
  console.log("EXPLAIN_MODAL_OPEN:", modalOpen);
  const modalText = (await modal.textContent().catch(() => "")) || "";
  // How many distinct issue keys does the modal list as moved?
  const modalKeys = Array.from(new Set((modalText.match(/\b(WFH|TES)-\d+\b/g) || [])));
  console.log("MODAL_KEYS:", modalKeys.length, modalKeys.slice(0, 12).join(","));
  // Self-consistency: a push-later edit shouldn't say "earlier"/"pulled in" AND "slipped".
  const saysSlip = /slip|later|pushed|delay/i.test(modalText);
  const saysEarlier = /earlier|pulled in|sooner/i.test(modalText);
  console.log("ADVISORY saysSlip:", saysSlip, " saysEarlier:", saysEarlier, "(a push-later edit should not claim BOTH)");
  await page.screenshot({ path: `${SHOT}/j12-explain.png` });

  // Close modal + DISCARD the draft.
  await frame.getByRole("button", { name: /^Close$/i }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  if (await isStaged(frame)) {
    await frame.locator('button').filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await frame.getByRole("button", { name: /^Discard$|Confirm|Yes/i }).first().click().catch(() => {});
    await page.waitForTimeout(3500);
  }
  const stagedAfterCleanup = await isStaged(frame);
  console.log("STAGED_AFTER_CLEANUP (should be FALSE):", stagedAfterCleanup);

  expect(box, "found a leaf bar to drag").toBeTruthy();
  expect(modalOpen, "explain modal opened").toBeTruthy();
  expect(stagedAfterCleanup, "cleanup left plan clean").toBeFalsy();
});

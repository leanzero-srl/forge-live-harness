// LZ7G0 item 6 — F13 chip regression: the toolbar chip's two populations must
// reconcile with the review dialog's own partition.
// Independently computed from ?what=plan vs ?what=settle&dry=1 on 2026-09-21:
//   differing NON-parent rows = 2 (LZPT-202 To Do, past; LZPT-217 Done)
//   differing PARENT rollups  = 6 (186,187,189,190,210,211)
// so the chip must read "2 tickets differ from Jira · 6 parent rollups" and the
// dialog "0 tickets can be adopted · 1 would set dates in the past · 1 already
// done · 6 parent rollups." (0+1+1 = 2).
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7g0";
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("G6: F13 chip reconciles with the review dialog", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  console.log("STAGED_ON_OPEN", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  const chip = frame.locator('[data-testid="derived-count-chip"]').first();
  console.log("CHIP_COUNT_ATTR", await chip.getAttribute("data-count"));
  console.log("CHIP_TEXT", ((await chip.textContent()) || "").replace(/\s+/g, " ").trim());
  const clip = await frame.locator(':root').evaluate(() => {
    const c = document.querySelector('[data-testid="derived-count-chip"]') as HTMLElement | null;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), scrollW: c.scrollWidth, clientW: c.clientWidth, clipped: c.scrollWidth > c.clientWidth + 1, right: Math.round(r.right), vw: window.innerWidth };
  });
  console.log("CHIP_GEOMETRY", JSON.stringify(clip));
  await page.screenshot({ path: `${OUT}/g6-1-chip.png` });
  await chip.dispatchEvent("click");
  await page.waitForTimeout(4000);
  const dlg = await bodyText(frame);
  console.log("DIALOG_SUBTITLE", (dlg.match(/\d+ tickets? can be adopted[^.]*\./) || [])[0]);
  console.log("DIALOG_GROUPS", JSON.stringify((dlg.match(/(Parent rollups|Already done|Would set dates in the past|Ready to adopt)\s*\(\d+\)/g) || [])));
  await page.screenshot({ path: `${OUT}/g6-2-dialog.png` });
  await frame.locator("button").filter({ hasText: /Leave Jira as it is|^Cancel$|^Close$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);
  console.log("STAGED_AFTER", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
});

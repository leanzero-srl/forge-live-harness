// LZ770B A1-UI — a SAVED edit survives the Re-index button, and the confirm names the count.
// Bed: my own WFH LZ770B plan (Epic + 3-chain + loose leaf). Never Applies to Jira.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const BED = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
const PLAN = "[harness-test] LZ770B saved-edit bed";
const LEAF = BED.l1; // WFH-3705, the loose leaf
test.describe.configure({ retries: 0, timeout: 600_000 });

const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";
const rowAttrs = async (f: any, key: string) => {
  const r = f.locator(`[data-testid="table-row"][data-row-key="${key}"]`).first();
  return { start: await r.getAttribute("data-row-start"), due: await r.getAttribute("data-row-due"), dur: await r.getAttribute("data-row-duration") };
};

test("LZ770B A1-UI: table edit → Save → Re-index confirm → edit survives", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(6000);
  expect((await bodyText(frame)).match(/rev\s*v([\d.]+)/)?.[1]).toBe("4.58.644");

  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);

  console.log("BEFORE_EDIT", JSON.stringify(await rowAttrs(frame, LEAF)));

  // --- edit the loose leaf's DURATION 5 -> 8 in the Table ---
  const row = frame.locator(`[data-testid="table-row"][data-row-key="${LEAF}"]`).first();
  await row.getByText(/^5d$/).first().click();
  await page.waitForTimeout(600);
  const input = row.locator('input[inputmode="numeric"]').first();
  await input.fill("8");
  await input.press("Enter");
  await page.waitForTimeout(2500);
  console.log("AFTER_EDIT", JSON.stringify(await rowAttrs(frame, LEAF)));
  const staged = await bodyText(frame);
  console.log("STAGED_TEXT", /Apply \d+ change/.exec(staged)?.[0], /Save \(\d+\)/.exec(staged)?.[0]);
  await page.screenshot({ path: `${OUT}/a1-03-edited.png` });

  // --- SAVE ---
  const t0 = Date.now();
  await frame.locator('[data-testid="plan-save-btn"]').first().click();
  await page.waitForTimeout(4000);
  const saveMs = Date.now() - t0;
  console.log("SAVE_WALL_MS(incl 4s settle)", saveMs);
  console.log("AFTER_SAVE", JSON.stringify(await rowAttrs(frame, LEAF)), "hasChanges=", await frame.locator('[data-testid="plan-save-btn"]').first().getAttribute("data-has-changes").catch(() => "?"));
  const afterSaveText = await bodyText(frame);
  console.log("AFTER_SAVE_NAG", /Save \(\d+\)/.exec(afterSaveText)?.[0] ?? "none", "| apply:", /Apply \d+ change/.exec(afterSaveText)?.[0] ?? "none");
  await page.screenshot({ path: `${OUT}/a1-04-saved.png` });

  // --- RE-INDEX: the confirm must appear and NAME the count ---
  await frame.getByRole("button", { name: /^Re-index/i }).first().click();
  await page.waitForTimeout(2000);
  const dialogText = (await bodyText(frame)).replace(/\s+/g, " ");
  const m = dialogText.match(/This plan has (\d+) rows? edited but not yet applied to Jira\.[^?]*\?/);
  console.log("CONFIRM_TEXT", m?.[0] ?? "NO CONFIRM FOUND");
  await page.screenshot({ path: `${OUT}/a1-05-confirm.png` });
  expect(m, "Re-index confirm names the at-risk count").toBeTruthy();
  console.log("CONFIRM_COUNT", m![1]);

  await frame.getByRole("button", { name: /^Re-index$/ }).last().click();
  await page.waitForTimeout(12000);
  const after = await rowAttrs(frame, LEAF);
  console.log("AFTER_REINDEX", JSON.stringify(after));
  await page.screenshot({ path: `${OUT}/a1-06-after-reindex.png` });
  expect(after.dur, "the saved duration survives the Re-index").toBe("8");
});

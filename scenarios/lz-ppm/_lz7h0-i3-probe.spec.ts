// LZ7H0 final probe — a FRESH load after the Discard All of item 2: is anything
// still staged? Plus item 3's user-visible surface for `createdByName`.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7h0";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz7h0/bed.json", "utf8"));
const { planName: PLAN } = bed;
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("H3: fresh load — staged state and the plan card", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: PLAN }).first();
  console.log("CARD_TEXT", ((await card.textContent().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 400));
  console.log("CARD_HAS_AUTHOR", /Mihai Perdum/.test(((await card.textContent().catch(() => "")) || "")));
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.screenshot({ path: `${OUT}/h3-00-card.png` }).catch(() => {});
  await page.screenshot({ path: `${OUT}/h3-00-cards-full.png` });
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(12000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  const t = await bodyText(frame);
  console.log("STAGED_ON_FRESH_OPEN", JSON.stringify((t.match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || [])));
  console.log("SAVE_BTN", JSON.stringify(((await frame.locator('[data-testid="plan-save-btn"]').first().textContent().catch(() => null)) || null)));
  await page.screenshot({ path: `${OUT}/h3-01-fresh-open.png` });
});

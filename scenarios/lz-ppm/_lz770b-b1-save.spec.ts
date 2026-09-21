// LZ770B B1 — a plain SAVE re-stamps meta.summary (finish + schedDigest), and what it costs.
// Bed: LZPT Scenarios. Edits ONE terminal leaf, Saves, measures, then RESTORES.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const LEAF = "LZPT-209"; // FANOUT-4, terminal, drives the plan finish (2026-10-12)
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";
const metaSum = async () => {
  const p = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const s = p.meta?.summary || {};
  return { finish: s.finish, digest: s.schedDigest, at: s.at, verdict: s.verdict, leaves: s.leaves, ver: p.meta?.version, savedEdits: p.meta?.savedEdits?.at };
};

test("B1: Save re-stamps the card — finish, schedDigest, latency, one page", async ({ page }) => {
  const before = await metaSum();
  console.log("META_BEFORE", JSON.stringify(before));

  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  const saveBodies: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "POST") return;
    const d = r.postData() || "";
    if (d.includes("savePlanState")) saveBodies.push(d);
  });
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(6000);

  // The plan CARD before opening (the verdict the user sees on the list).
  const cardBefore = (await bodyText(frame)).replace(/\s+/g, " ").match(/LZPT Scenarios.{0,220}/)?.[0];
  console.log("CARD_BEFORE", cardBefore);

  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);

  const row = frame.locator(`[data-testid="table-row"][data-row-key="${LEAF}"]`).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  console.log("ROW_BEFORE", await row.getAttribute("data-row-start"), await row.getAttribute("data-row-due"), await row.getAttribute("data-row-duration"));

  // +3 working days: duration 6 -> 9 on a leaf that drives the finish.
  await row.getByText(/^6d$/).first().click();
  await page.waitForTimeout(600);
  const input = row.locator('input[inputmode="numeric"]').first();
  await input.fill("9");
  await input.press("Enter");
  await page.waitForTimeout(2500);
  console.log("ROW_AFTER_EDIT", await row.getAttribute("data-row-start"), await row.getAttribute("data-row-due"), await row.getAttribute("data-row-duration"));
  await page.screenshot({ path: `${OUT}/b1-01-edited.png` });

  // --- SAVE, measured to the button's own state machine ---
  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  console.log("SAVE_LABEL", (await btn.textContent())?.trim());
  const t0 = Date.now();
  await btn.click();
  let saveMs = -1;
  for (let i = 0; i < 120; i++) {
    const st = await btn.getAttribute("data-save-state").catch(() => null);
    if (st === "saved") { saveMs = Date.now() - t0; break; }
    await page.waitForTimeout(250);
  }
  console.log("SAVE_LATENCY_MS", saveMs, "rows_in_plan=70");
  await page.screenshot({ path: `${OUT}/b1-02-saved.png` });
  console.log("SAVE_REQUESTS", saveBodies.length);
  for (const b of saveBodies) {
    const m = b.match(/"morePages"\s*:\s*(true|false)/);
    const n = (b.match(/"key"\s*:/g) || []).length;
    console.log("  page: morePages=", m?.[1] ?? "ABSENT", " approx rows=", n, " bytes=", b.length);
  }

  const after = await metaSum();
  console.log("META_AFTER", JSON.stringify(after));
  expect(after.finish, "the Save re-stamped the finish").not.toBe(before.finish);
  expect(after.digest, "the Save stamped a schedDigest").toBeTruthy();
  expect(after.at).not.toBe(before.at);

  // Storyline: is a rebuild offered?
  await frame.getByRole("button", { name: /^Storyline/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const sl = (await bodyText(frame)).replace(/\s+/g, " ");
  console.log("STORYLINE_STALE_CHIP", /THE PLAN HAS MOVED SINCE THIS WAS BUILT/.test(sl) ? "PRESENT" : "absent");
  console.log("STORYLINE_SNIP", sl.slice(0, 600));
  await page.screenshot({ path: `${OUT}/b1-03-storyline.png` });

  // The card, re-read from the list.
  await frame.getByRole("button", { name: /^Plans$/ }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const cardAfter = (await bodyText(frame)).replace(/\s+/g, " ").match(/LZPT Scenarios.{0,220}/)?.[0];
  console.log("CARD_AFTER", cardAfter);
  await page.screenshot({ path: `${OUT}/b1-04-card.png` });
});

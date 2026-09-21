// LZ770B B1-discard — Discard All on LZPT, re-Save the clean state, prove 0 edited rows.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";

test("B1-discard: LZPT discarded and re-saved clean", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(6000);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply \d+ change/.exec((await bodyText(frame)).replace(/\s+/g, " "))?.[0] ?? "none");

  for (let i = 0; i < 4; i++) {
    const t = (await bodyText(frame)).replace(/\s+/g, " ");
    if (!/Apply \d+ change/.test(t)) break;
    await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  const afterDiscard = (await bodyText(frame)).replace(/\s+/g, " ");
  console.log("AFTER_DISCARD", /Apply \d+ change/.exec(afterDiscard)?.[0] ?? "none", "|", /Save \(\d+\)/.exec(afterDiscard)?.[0] ?? "none");
  await page.screenshot({ path: `${OUT}/b1-06-discarded.png` });

  if (/Save \(\d+\)/.test(afterDiscard)) {
    const btn = frame.locator('[data-testid="plan-save-btn"]').first();
    const t0 = Date.now();
    await btn.click();
    let ms = -1;
    for (let i = 0; i < 120; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") { ms = Date.now() - t0; break; } await page.waitForTimeout(250); }
    console.log("SAVE_LATENCY_MS_CLEAN", ms);
    await page.waitForTimeout(3000);
  }
  const final = (await bodyText(frame)).replace(/\s+/g, " ");
  console.log("FINAL_STAGED", /Apply \d+ change/.exec(final)?.[0] ?? "none", "|", /Save \(\d+\)/.exec(final)?.[0] ?? "none");
  await page.screenshot({ path: `${OUT}/b1-07-clean.png` });

  const p = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const edited = (p.issues || []).filter((i: any) => ["startDate", "dueDate", "duration", "buffer"].some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? "")));
  console.log("EDITED_ROWS", edited.length, edited.map((i: any) => `${i.key}:${i.duration}/${i._original?.duration}`).join(","));
  console.log("META", JSON.stringify({ finish: p.meta?.summary?.finish, digest: p.meta?.summary?.schedDigest, ver: p.meta?.version, savedEdits: p.meta?.savedEdits }));
  expect(edited.length).toBe(0);
});

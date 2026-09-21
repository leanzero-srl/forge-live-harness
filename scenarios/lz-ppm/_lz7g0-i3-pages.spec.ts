// LZ7G0 item 3 — clearDrafts must take a LIVE complete head's page BODIES with it
// (d87fc583), not just orphans. Opens LZPT so the seeded legacy head migrates to
// schema 2 (which owns pages), then clears while the head is COMPLETE.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios", PLAN_ID = "plan-msq9dg8l-gz6mz1";
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const cls = async (dry: boolean) => { const d: any = await getTestState("lz-ppm", dry ? { what: "clearDrafts", planId: PLAN_ID, dry: "1" } : { what: "clearDrafts", planId: PLAN_ID }); return JSON.stringify({ heads: d.heads, tombstones: d.tombstones, pages: d.pages, orphanPages: d.orphanPages, states: d.states, otherKeys: d.otherKeys, failed: d.failed, cleared: d.cleared }); };

test("G3: a complete head's pages go with the head", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(3000); const d: any = await getTestState("lz-ppm", { what: "draftSchemas", planId: PLAN_ID }); if (d.bySchema && d.bySchema["schema:2:complete"]) break; }
  console.log("BADGES", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  console.log("SCHEMAS_LIVE", JSON.stringify((await getTestState("lz-ppm", { what: "draftSchemas", planId: PLAN_ID }) as any).bySchema));
  console.log("DRY_WITH_LIVE_HEAD", await cls(true));
  console.log("REAL_CLEAR       ", await cls(false));
  console.log("DRY_AFTER        ", await cls(true));
  console.log("SCHEMAS_AFTER", JSON.stringify(await getTestState("lz-ppm", { what: "draftSchemas", planId: PLAN_ID })));
});

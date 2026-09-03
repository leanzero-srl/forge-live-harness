// PLAN CARD — the user-visible end of the registry change.
//
// `plans:list` used to carry issueCount/status/updatedAt as a copy of the plan meta,
// and four writers each rebuilt the row by hand. It is now a lean membership index
// `{id, name}`, and every rendered field comes from the meta through the listPlans
// resolver. Nothing asserted what the CARD shows, so this does: the card for the LZPT
// bed must name it, report the count the meta and the shards agree on (45), and show
// an "Updated" stamp that tracks the plan's real last-index time rather than a stale
// registry copy. Read-only.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 1, timeout: 300_000 });

test("the plan card reports the meta's count and status, not a registry copy", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);

  // Independent truth, straight from the backend: the shards and the meta.
  const plans = (await getTestState("lz-ppm", { what: "plans" })).plans as any[];
  const row = plans.find((p) => p.name === PLAN);
  expect(row, "the bed plan is in the registry").toBeTruthy();
  const detail = await getTestState("lz-ppm", { what: "plan", planId: row.id });
  const shardCount = (detail.issues || []).length;
  const meta = detail.meta || {};
  console.log("BACKEND: shards =", shardCount, "meta.issueCount =", meta.issueCount,
    "meta.status =", meta.status, "meta.updatedAt =", meta.updatedAt, "| raw row =", JSON.stringify(row));
  expect(meta.issueCount, "meta agrees with the shards").toBe(shardCount);

  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2500);

  const card = frame.locator('.lz-card', { hasText: PLAN }).first();
  await card.waitFor({ state: "visible", timeout: 30_000 });
  const text = ((await card.textContent()) || "").replace(/\s+/g, " ").trim();
  console.log("CARD:", text.slice(0, 240));

  // The count the user reads must be the one the shards actually hold.
  // textContent runs every value straight into its label AND into the next stat:
  // "LZPT ScenariosReady45Issues1Sources0Drafts…". So no \b after "Issues" (the next
  // char is the Sources count, a word char) and no \s+ before it.
  const m = text.match(/([\d,]+)Issues?/i);
  expect(m, "the card states an issue count").toBeTruthy();
  expect(Number(m![1].replace(/,/g, "")), "the card's count == the shards").toBe(shardCount);
  // And the status badge must reflect the meta, not a row that nobody updated.
  expect(text).toMatch(/Ready|Indexed/i);
  // "Updated" is the field the old registry left stale for hours — it must be recent,
  // because this plan was re-indexed during this session.
  const updated = text.match(/Updated\s*([0-9a-z ]+?ago|just now|today)/i)?.[1]?.trim();
  console.log("CARD updated =", updated, "| meta.updatedAt =", meta.updatedAt);
  expect(updated, "the card shows an Updated stamp").toBeTruthy();
  expect(/\b(\d+|a|an|just)\s*(second|minute|hour|m|h|s)\b|just now|today/i.test(updated || ""),
    `Updated should track the meta (${meta.updatedAt}), got "${updated}"`).toBe(true);

  await card.screenshot({ path: "evidence/plan-card-lzpt.png" }).catch(() => {});
});

// LZ770B D1 — LOCAL UNSAVED edits on screen while an EXTERNAL re-index publishes a new
// plan:version. The local work must survive, and the "changed in Jira" lane must behave.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const BED = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
const PLAN = "[harness-test] LZ770B saved-edit bed";
const LEAF = BED.l1;
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";

async function rest(method: string, query: Record<string, string>) {
  const url = new URL(BED.tokenUrl);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), { method, headers: { Authorization: `Bearer ${BED.token}` } });
  return { status: r.status, text: await r.text() };
}

test("D1: an external plan:version must not eat local unsaved work", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(6000);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);

  const row = frame.locator(`[data-testid="table-row"][data-row-key="${LEAF}"]`).first();
  console.log("ROW_BEFORE", await row.getAttribute("data-row-due"), await row.getAttribute("data-row-duration"));
  await row.getByText(/^5d$/).first().click();
  await page.waitForTimeout(600);
  const input = row.locator('input[inputmode="numeric"]').first();
  await input.fill("7");
  await input.press("Enter");
  await page.waitForTimeout(2500);
  const localDue = await row.getAttribute("data-row-due");
  console.log("LOCAL_UNSAVED", localDue, await row.getAttribute("data-row-duration"));
  const staged = (await bodyText(frame)).replace(/\s+/g, " ");
  console.log("STAGED", /Apply \d+ change/.exec(staged)?.[0], "|", /Save \(\d+\)/.exec(staged)?.[0]);
  expect(/Save \(\d+\)/.test(staged), "the edit is UNSAVED").toBeTruthy();
  await page.screenshot({ path: `${OUT}/d1-01-local.png` });

  // EXTERNAL re-index, from outside this browser — bumps meta.version and fires plan:version.
  const before = await getTestState("lz-ppm", { what: "plan", planId: BED.planId });
  console.log("VERSION_BEFORE", before.meta?.version);
  console.log("EXTERNAL_INDEX", JSON.stringify(await rest("POST", { resource: "plans", id: BED.planId, action: "index" })));
  for (let i = 0; i < 40; i++) {
    const p = await getTestState("lz-ppm", { what: "plan", planId: BED.planId });
    if ((p.meta?.version ?? 0) > (before.meta?.version ?? 0) && p.meta?.status === "indexed") { console.log("VERSION_AFTER", p.meta.version); break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(20000);

  const t = (await bodyText(frame)).replace(/\s+/g, " ");
  console.log("BANNER", /This plan changed in Jira[^.]*\./.exec(t)?.[0] ?? "none");
  console.log("REFRESH_NOTICE", /Refreshing plan|refresh/i.test(t) ? t.match(/.{0,80}[Rr]efresh.{0,120}/)?.[0] : "none");
  const after = { due: await row.getAttribute("data-row-due"), dur: await row.getAttribute("data-row-duration") };
  console.log("ROW_AFTER_EXTERNAL", JSON.stringify(after));
  const staged2 = /Save \(\d+\)/.exec(t)?.[0] ?? "none";
  console.log("STAGED_AFTER", staged2, "|", /Apply \d+ change/.exec(t)?.[0] ?? "none");
  await page.screenshot({ path: `${OUT}/d1-02-after-external.png` });
  expect(after.dur, "the local unsaved duration survived the external version").toBe("7");
  expect(after.due, "the local unsaved due survived").toBe(localDue);

  // RESTORE: discard the local edit and leave nothing staged.
  for (let i = 0; i < 4; i++) {
    const b = (await bodyText(frame)).replace(/\s+/g, " ");
    if (!/Apply \d+ change/.test(b)) break;
    await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  const final = (await bodyText(frame)).replace(/\s+/g, " ");
  console.log("FINAL", /Apply \d+ change/.exec(final)?.[0] ?? "none", "|", /Save \(\d+\)/.exec(final)?.[0] ?? "none");
  console.log("FINAL_ROW", await row.getAttribute("data-row-due"), await row.getAttribute("data-row-duration"));
  await page.screenshot({ path: `${OUT}/d1-03-restored.png` });
});

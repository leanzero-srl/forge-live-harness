// PERSISTENT journey — #9 "removing a link does not say what was freed".
// The fix: all three unlink entry points toast the freed item and its remaining
// constraint state ("Unlinked A → B. B is now unconstrained." / "... still has N
// other predecessors."). Assert the toast names the freed successor. Discards after.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 1, timeout: 260_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }

test("LZPT unlink: the toast names the freed work item", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2000);

  const keyMap: Record<string, string> = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }) });
    const d = await res.json(); const m: Record<string, string> = {}; for (const i of d.issues || []) m[i.fields.summary] = i.key; return m;
  });
  const c1 = keyMap["CHAIN-1 kickoff"], c2 = keyMap["CHAIN-2 build"];
  expect(c1 && c2, "keys resolved").toBeTruthy();

  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  const discardAll = async () => {
    for (let i = 0; i < 3; i++) { if (!(await isStaged(frame))) break; await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {}); await page.waitForTimeout(1200); await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {}); await page.waitForTimeout(2000); }
  };
  await discardAll();

  try {
    // Remove CHAIN-1 → CHAIN-2 via CHAIN-2's editor remove-× (same path as J-dep-edit).
    await frame.locator(`[data-testid="gantt-bar"][data-key="${c2}"]`).first().click();
    await page.waitForTimeout(1000);
    await frame.locator(`[aria-label="Remove dependency ${c1}"]`).first().dispatchEvent("click");
    await page.waitForTimeout(700);
    await frame.getByRole("button", { name: /^Remove$/i }).first().click().catch(async () => {
      await frame.getByRole("button", { name: /^Remove$/i }).first().dispatchEvent("click").catch(() => {});
    });

    // The toast must NAME the freed successor and state its constraint status.
    let toastText = "";
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(700);
      const t = await bodyText(frame);
      const m = t.match(/Unlinked[^.]*\./);
      if (m) { toastText = t; break; }
    }
    const named = new RegExp(`Unlinked\\s+${c1}\\s*→\\s*${c2}`).test(toastText);
    const status = new RegExp(`${c2}\\s+(is now unconstrained|still has \\d+ other predecessor)`).test(toastText);
    console.log("TOAST named:", named, "status:", status);
    expect(named, `toast names the unlinked pair ${c1} → ${c2}`).toBeTruthy();
    expect(status, "toast states the freed item's constraint status").toBeTruthy();
  } finally {
    await discardAll();
    console.log("FINAL staged:", await isStaged(frame));
  }
});

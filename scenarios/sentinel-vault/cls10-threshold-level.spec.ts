// CLS-10 (UX critique 2026-09-19). Before the fix the ribbon threshold was a NUMBER input ("rank",
// 1..99) while every other classification control picks a level chip, and renaming or re-ranking a
// level silently changed what the threshold meant. After the fix the site console shows "Show the
// banner from <level>" as a level picker (`ribbonThresholdLevel`, a level id); the rank is resolved
// against the scheme at read time (ribbon-summary answers `threshold.rank` from the level), and the
// stored rank stays as the API's / older installs' fallback with no row of its own. Server half
// through the hook (site settings restored); browser half on the site console. FAILS before, PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, inv, getKvs, setKvs, delKvs, norm, MIHAI } from "./_wf";
import { getTarget } from "../../config/targets";
import { enterForgeSurface, ensureInViewport } from "../../forge/frame";

const OUT = process.env.OUT_DIR || "evidence/cls10-threshold-level";
const GLOBAL = "admin-settings-global";
test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;

test("CLS-10 server: the threshold is a level — its rank is resolved from the scheme; an unknown level falls back to the stored rank", async () => {
  const bed = await setupWorkflowPage("cls10-server");
  const P = bed.pageId;
  const before = await getKvs(GLOBAL);
  try {
    const on = { ...(before || {}), classificationEnabled: true, ribbonMode: "exceptions", ribbonThresholdRank: 4 };
    await setKvs(GLOBAL, { ...on, ribbonThresholdLevel: "confidential" });
    const r1 = await call("ribbon-summary", { pageId: P }, MIHAI);
    console.log("### threshold (confidential):", JSON.stringify(r1?.threshold));
    expect(r1?.threshold?.rank, "Confidential is rank 3 in the default scheme").toBe(3);
    expect(r1?.threshold?.from).toBe("level");
    expect(r1?.ribbonThresholdLevel).toBe("confidential");
    await setKvs(GLOBAL, { ...on, ribbonThresholdLevel: "no-such-level" });
    const r2 = await call("ribbon-summary", { pageId: P }, MIHAI);
    console.log("### threshold (unknown level):", JSON.stringify(r2?.threshold));
    expect(r2?.threshold?.rank, "an unknown level → the stored rank").toBe(4);
    expect(r2?.threshold?.from).toBe("rank");
    // the write boundary: a site admin stores a level id through store-policy; a number is refused
    const w1 = await call("store-policy", { scope: "global", data: { ribbonThresholdLevel: "internal" } }, MIHAI);
    expect(w1?.success, `store-policy level (${JSON.stringify(w1).slice(0, 120)})`).toBe(true);
    expect((await getKvs(GLOBAL))?.ribbonThresholdLevel).toBe("internal");
    const w2 = await call("store-policy", { scope: "global", data: { ribbonThresholdLevel: 3 } }, MIHAI);
    console.log("### number refused:", JSON.stringify(w2));
    expect(w2?.success).toBe(false);
    expect(w2?.reason).toMatch(/level id/);
  } finally {
    if (before == null) await delKvs(GLOBAL).catch(() => {}); else await setKvs(GLOBAL, before);
    await bed.restore();
  }
});

test("CLS-10 browser: the site console asks 'Show the banner from' with a level picker, and no rank number", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const before = await getKvs(GLOBAL);
  try {
    await setKvs(GLOBAL, { ...(before || {}), classificationEnabled: true, enableDocRibbons: true, ribbonThresholdLevel: "confidential" });
    const T = getTarget("sentinel-steward-console");
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const sc = await enterForgeSurface(page, { surface: "custom", readySelector: ".admin-title", timeout: 60_000 });
    if (sc.kind !== "custom") throw new Error("expected Custom UI");
    const con = sc.frame;
    const row = con.locator('[data-testid="sv-row-ribbonThresholdLevel"]');
    await expect(row, "the level row exists").toBeVisible({ timeout: 30_000 });
    const text = norm(await row.innerText());
    console.log("### row:", text);
    expect(text).toMatch(/Show the banner from/);
    expect(text).not.toMatch(/rank/i);
    await expect(con.locator('[data-testid="sv-row-ribbonThresholdRank"]'), "the rank fallback has no row").toHaveCount(0);
    await expect(con.locator('[data-testid="ribbon-threshold-rank"]'), "no number input").toHaveCount(0);
    const picker = row.locator('[data-testid="sv-level-ribbonThresholdLevel"]');
    await expect(picker).toBeVisible();
    // the level list arrives from classification-provider a beat after the settings
    await expect(picker, "the picker shows the chosen level as a chip").toContainText(/Confidential/, { timeout: 20_000 });
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/01-console-level-picker.png` });
    // pick Internal and Save → stored as the level id
    await picker.locator(".mini-select-value").click();
    await picker.locator('[role="option"]', { hasText: "Internal" }).click();
    expect(norm(await picker.innerText())).toMatch(/Internal/);
    await page.screenshot({ path: `${OUT}/02-console-picked-internal.png` });
    await con.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/02b-console-picked-internal-dark.png` });
    await con.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "light"));
    // the host scroller is a DIV the iframe cannot scroll — wheel the Save into view first
    const save = con.getByRole("button", { name: /Save/i }).first();
    await ensureInViewport(page, save);
    await save.click();
    await expect.poll(async () => (await getKvs(GLOBAL))?.ribbonThresholdLevel, { timeout: 30_000 }).toBe("internal");
  } finally {
    if (before == null) await delKvs(GLOBAL).catch(() => {}); else await setKvs(GLOBAL, before);
  }
});

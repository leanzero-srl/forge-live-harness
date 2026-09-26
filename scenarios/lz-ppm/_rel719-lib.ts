// Shared helpers for the dev 7.19.0 release proof (_rel719-*.spec.ts). Evidence goes OUTSIDE the
// repo, to ~/lz-ppm-builds/quality/dev-7.19.0/shots.
import os from "node:os";
import fs from "node:fs";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

export const T = getTarget("lz-ppm-dashboard");
export const PLAN_ID = "plan-msq9dg8l-gz6mz1";
export const PLAN = "LZPT Scenarios";
export const OUT = `${os.homedir()}/lz-ppm-builds/quality/dev-7.19.0/shots`;
fs.mkdirSync(OUT, { recursive: true });
export const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
export const isStaged = async (f: any) => /Apply\s*\d+\s*change|Save\s*\(\d+\)/i.test(await bodyText(f));
export function log(k: string, v: unknown) { console.log(`${k} ${typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v)}`); }

export async function boot(page: any) {
  await page.setViewportSize({ width: 1700, height: 1050 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await frame.locator('[data-testid="app-version"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  const real = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  return { frame, real };
}

/** From the Plans page, open a plan by its card name and wait for the view tabs. */
export async function openPlan(page: any, frame: any, name = PLAN) {
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  for (let i = 0; i < 10; i++) {
    if (await frame.locator('[data-testid="view-tab-gantt"]').count()) break;
    await frame.locator('[data-testid="plan-card-name"]').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
  }
  await frame.locator('[data-testid="view-tab-gantt"]').first().waitFor({ state: "visible", timeout: 60_000 });
}
export async function tab(page: any, frame: any, id: string) {
  await frame.locator(`[data-testid="view-tab-${id}"]`).first().click();
  await page.waitForTimeout(3500);
}
export async function shot(page: any, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }); }
/** Hover an element inside the iframe for real (a FrameLocator's forced hover fires no mouseenter). */
export async function realHover(page: any, loc: any) {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  if (!b) return false;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.waitForTimeout(1200);
  return true;
}
/** Call a resolver from inside the app iframe, exactly as the app's own screens do. */
export async function invokeInFrame(real: any, name: string, payload: any) {
  return real.evaluate(async ([n, p]: [string, any]) => {
    const b: any = (globalThis as any).__bridge;
    if (!b?.callBridge) return { bridgeMissing: true };
    try { return await b.callBridge("invoke", { functionKey: n, payload: p }); } catch (e: any) { return { threw: String(e?.message || e) }; }
  }, [name, payload]);
}

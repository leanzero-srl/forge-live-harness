// Shared helpers for the dev 7.20.0 release proof (_rel720-*.spec.ts). Evidence goes OUTSIDE the
// repo, to ~/lz-ppm-builds/quality/dev-7.20.0/shots.
import os from "node:os";
import fs from "node:fs";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

export const T = getTarget("lz-ppm-dashboard");
export const PLAN_ID = "plan-msq9dg8l-gz6mz1";
export const PLAN = "LZPT Scenarios";
export const OUT = `${os.homedir()}/lz-ppm-builds/quality/dev-7.20.0/shots`;
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

export const FX_ID = "plan-muil1x4e-dp567j";
export const FX = "=1+1 [harness-test] rel720 E2";
/** Open a DatePicker by its trigger locator and click the day `iso` (navigating months). */
export async function pickIn(page: any, frame: any, trigger: any, iso: string) {
  await trigger.click();
  await page.waitForTimeout(600);
  for (let i = 0; i < 14; i++) {
    const b = frame.locator(`.lz-datepicker button[aria-label="${iso}"]`).first();
    if (await b.count()) { await b.dispatchEvent("click"); await page.waitForTimeout(600); return true; }
    const anyDay = await frame.locator('.lz-datepicker button[aria-label^="20"]').first().getAttribute("aria-label").catch(() => null);
    const nav = anyDay && anyDay.slice(0, 7) > iso.slice(0, 7) ? "Previous month" : "Next month";
    await frame.locator(".lz-datepicker").getByRole("button", { name: nav }).first().dispatchEvent("click");
    await page.waitForTimeout(300);
  }
  return false;
}
/** Every bar's rendered dates by key. */
export async function bars(real: any) {
  return real.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('[data-testid="gantt-bar"]')).map((b: any) => [b.getAttribute("data-key"), [b.getAttribute("data-bar-start"), b.getAttribute("data-bar-due")]])));
}
/** Every table row's rendered dates by key. */
export async function rows(real: any) {
  return real.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('[data-testid="table-row"]')).map((r: any) => [r.getAttribute("data-row-key"), [r.getAttribute("data-row-start"), r.getAttribute("data-row-due"), r.getAttribute("data-row-duration")]])));
}
/** The header word block, read whole. */
export async function header(real: any) {
  return real.evaluate(() => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as any;
    const w = q("plan-header-word");
    const vis = (e: any) => !!e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none";
    const bar = w?.closest("header") || w?.parentElement?.parentElement;
    return {
      word: w?.getAttribute("data-verdict") ?? null, chip: q("plan-header-verdict")?.textContent ?? null,
      chipBg: q("plan-header-verdict") ? getComputedStyle(q("plan-header-verdict")).backgroundColor : null,
      commitment: q("plan-header-commitment")?.textContent ?? null, commitmentVisible: vis(q("plan-header-commitment")),
      tickets: q("plan-header-tickets")?.textContent ?? null, ticketsCount: q("plan-header-tickets")?.getAttribute("data-count") ?? null,
      ticketsColor: q("plan-header-tickets") ? getComputedStyle(q("plan-header-tickets")).color : null,
      readyInHeader: /\bReady\b/.test((bar?.textContent || "")),
      toolbarText: ((bar?.textContent || "") as string).replace(/\s+/g, " ").slice(0, 400),
    };
  });
}

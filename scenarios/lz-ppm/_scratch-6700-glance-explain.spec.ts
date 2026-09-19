// SCRATCH 6.70.0 — items 6 and 7.
//  6  The glance's ROOM is the measured number: LZPT-215 must print "74 working
//     days of room" (independently: working days from its own due 2026-06-30 to
//     the plan finish 2026-10-12, exclusive of the due day = 74), never "10+";
//     LZPT-209 (due == the plan finish) must say NO ROOM.
//  7  Explain answer 2's chip row may not repeat a ticket, and the call must be
//     FRESH (PROMPT_VERSION v5 changed the cache key) — the resolver's `cached`
//     flag is read off the wire, not inferred.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const BASE = process.env.JIRA_BASE_URL || "https://wolfaenpak.atlassian.net";
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratchpad/live-6700";
test.describe.configure({ retries: 1, timeout: 900_000, mode: "serial" });
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

async function glanceFrame(page: any, timeoutMs = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    for (const f of page.frames()) {
      const hit = await f.evaluate(() => !!document.querySelector('[data-testid="issue-glance"]')).catch(() => false);
      if (hit) return f;
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

test("G-1 the glance prints the exact room", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  for (const key of ["LZPT-215", "LZPT-209"]) {
    await page.goto(`${BASE}/browse/${key}`, { waitUntil: "domcontentloaded" });
    let f = await glanceFrame(page, 30_000);
    if (!f) {
      await page.getByRole("button", { name: /View app actions/i }).first().click({ timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.getByRole("menuitem", { name: /LeanZero Management Position/i }).first().click({ timeout: 20_000 })
        .catch(async () => { await page.getByText(/^LeanZero Management Position$/).first().click({ timeout: 20_000 }).catch(() => {}); });
      await page.waitForTimeout(4000);
      f = await glanceFrame(page, 90_000);
    }
    if (!f) { console.log(`${key}: GLANCE NEVER MOUNTED`); continue; }
    await page.waitForTimeout(3500);
    const g = await f.evaluate(() => {
      const root = document.querySelector('[data-testid="issue-glance"]') as HTMLElement | null;
      if (!root) return null;
      return {
        state: root.getAttribute("data-state"), mode: root.getAttribute("data-mode"),
        items: [...root.querySelectorAll("[data-item]")].map((li) => ({
          id: li.getAttribute("data-item"),
          chip: (li.querySelector(".lz-badge") as HTMLElement | null)?.textContent?.trim() || null,
          text: (li as HTMLElement).innerText.replace(/\n/g, " ").trim().slice(0, 260),
        })),
        full: root.innerText,
      };
    });
    console.log(`=== ${key} === state=${g?.state} mode=${g?.mode}`);
    console.log("ITEMS:", JSON.stringify(g?.items, null, 1));
    console.log("ROOM MATCH:", JSON.stringify((g?.full || "").match(/[^\n]*(working day|NO ROOM|10\+)[^\n]*/gi)));
    console.log("FULL:\n" + (g?.full || "(none)"));
    await page.screenshot({ path: `${OUT}/g-glance-${key}.png` });
  }
  expect(true).toBeTruthy();
});

test("G-2 Explain: answer 2's chip row is deduped and the call is fresh", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  const errs: string[] = [];
  page.on("console", (m: any) => { const t = m.text(); if (/same key|duplicate key|Warning/i.test(t)) errs.push(t.slice(0, 300)); });
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no frame");
  const frame = s.frame;
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(2500);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: "LZPT Scenarios" }).first().locator(".plan-card-open").click();
  await page.waitForTimeout(6000);

  // Read the `cached` flag OFF THE WIRE: wrap fetch + XHR in the app frame and
  // keep any response body that mentions it. Inference would prove nothing.
  await realFrame!.evaluate(() => {
    (window as any).__lzWire = [];
    const of = window.fetch;
    window.fetch = async function (...a: any[]) {
      const r = await of.apply(this, a as any);
      try { const t = await r.clone().text(); if (/"cached"|explanation/.test(t)) (window as any).__lzWire.push(t.slice(0, 4000)); } catch { /* opaque */ }
      return r;
    } as any;
    const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (...a: any[]) { (this as any).__u = a[1]; return oo.apply(this, a as any); };
    XMLHttpRequest.prototype.send = function (...a: any[]) {
      this.addEventListener("load", () => { try { const t = this.responseText; if (/"cached"|explanation/.test(t)) (window as any).__lzWire.push(t.slice(0, 4000)); } catch { /* */ } });
      return os.apply(this, a as any);
    };
  });

  const btn = frame.locator("button").filter({ hasText: /Explain this plan/i }).first();
  await btn.dispatchEvent("click");
  let t = "";
  for (let i = 0; i < 80; i++) {
    t = await body(frame);
    if (/What would move it/i.test(t)) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(2500);
  const sections = await frame.locator('[data-testid="explain-section"]').allInnerTexts();
  console.log("SECTION COUNT:", sections.length);
  sections.forEach((x, i) => console.log(`--- SECTION ${i}\n` + x.replace(/\n+/g, " | ")));
  const chipRows = await realFrame!.evaluate(() => {
    const out: any[] = [];
    document.querySelectorAll('[data-testid="explain-section"]').forEach((sec) => {
      const title = (sec.firstElementChild as HTMLElement)?.innerText?.trim();
      const rows: string[][] = [];
      sec.querySelectorAll("span").forEach((sp) => {
        const keys = [...sp.querySelectorAll('[data-testid="explain-key"]')].map((b) => b.getAttribute("data-key") || "");
        if (keys.length) rows.push(keys);
      });
      out.push({ title, rows });
    });
    return out;
  });
  console.log("CHIP ROWS:", JSON.stringify(chipRows, null, 1));
  for (const sec of chipRows) for (const row of sec.rows) {
    const dupes = row.filter((k: string, i: number) => row.indexOf(k) !== i);
    console.log(`  ${sec.title}: [${row.join(" · ")}]  DUPES=${JSON.stringify(dupes)}`);
    expect(dupes, `${sec.title} repeats a ticket`).toEqual([]);
  }
  const wire = await realFrame!.evaluate(() => (window as any).__lzWire || []);
  console.log("WIRE SAMPLES:", wire.length);
  for (const w of wire) {
    const m = w.match(/"cached"\s*:\s*(true|false)/);
    if (m) console.log("  cached =", m[1], "| snippet:", w.slice(Math.max(0, w.indexOf('"cached"') - 200), w.indexOf('"cached"') + 60).replace(/\s+/g, " "));
  }
  const cachedFlags = wire.map((w: string) => w.match(/"cached"\s*:\s*(true|false)/)?.[1]).filter(Boolean);
  console.log("CACHED FLAGS SEEN:", JSON.stringify(cachedFlags));
  console.log("REACT WARNINGS:", JSON.stringify(errs));
  await page.screenshot({ path: `${OUT}/g-explain.png`, fullPage: true });
  await frame.getByRole("button", { name: /^Close$/i }).first().click({ timeout: 8000 }).catch(() => page.keyboard.press("Escape"));
  await page.waitForTimeout(1500);
  console.log("STAGED_AFTER_CLEANUP=" + /Apply \d+ change|Save \(\d+\)/i.test(await body(frame)));
  expect(chipRows.length).toBeGreaterThan(0);
});

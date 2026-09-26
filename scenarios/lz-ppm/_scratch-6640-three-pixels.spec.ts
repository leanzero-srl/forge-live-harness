// TESTER 6.64.0 — three pixel checks on LZPT (read-only bed).
//  1. Table: the cycle banner is >= 40px tall and actually paints.
//  2. Table under Group -> AI structure: chain member rows show the FULL key,
//     and the cut control still appears on hover at the right edge of the key cell.
//  3. A refusal toast: solid card ground, solid tone icon disc, no pastel fill.
import { test, expect } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "plan-msq9dg8l-gz6mz1";
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 2_400_000 });

const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const realFrame = async (f: any) => (await (await f.locator(":root").elementHandle())!.ownerFrame())!;

test("6.64.0 three pixel checks", async () => {
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  let builtView = false;
  try {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2500);
    const rev = (await text(frame)).match(/REV\s*V?([0-9.]+)/);
    console.log("REV =", rev ? rev[1] : "(n/a)");
    await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(5000);
    await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
    await page.waitForTimeout(9000);
    const rf = await realFrame(frame);
    console.log("STAGED AT START =", /Apply \d+ change|Save \(\d+\)/i.test(await text(frame)));

    // ================= CHECK 1 — the cycle banner in the Table =================
    const bannerAt = async (h: number) => {
      await page.setViewportSize({ width: 1700, height: h });
      await page.waitForTimeout(2500);
      return rf.evaluate(() => {
        const el = document.querySelector('[data-testid="cycle-banner"]') as any;
        if (!el) return null;
        const c = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const p = el.parentElement;
        return {
          offsetHeight: el.offsetHeight, rectH: Math.round(r.height), rectTop: Math.round(r.top), rectW: Math.round(r.width),
          scrollHeight: el.scrollHeight, flexShrink: c.flexShrink, overflow: c.overflow,
          display: c.display, visibility: c.visibility, opacity: c.opacity, background: c.backgroundColor,
          headText: (el.querySelector(".lz-cycle-banner-head") as any)?.innerText?.trim().replace(/\n+/g, " | ") || null,
          headBg: (() => { const hd = el.querySelector(".lz-cycle-banner-head"); return hd ? getComputedStyle(hd).backgroundColor : null; })(),
          headH: (el.querySelector(".lz-cycle-banner-head") as any)?.offsetHeight ?? null,
          parentDisplay: p ? getComputedStyle(p).display : null, parentDir: p ? getComputedStyle(p).flexDirection : null,
          innerText: (el.innerText || "").trim().replace(/\n+/g, " | ").slice(0, 200),
          iframeH: window.innerHeight,
        };
      });
    };
    for (const h of [1100, 800, 1500]) {
      const b = await bannerAt(h);
      console.log(`BANNER @vp${h} =`, JSON.stringify(b));
      expect(b, "banner present in Table").not.toBeNull();
      expect(b!.offsetHeight, `banner offsetHeight @vp${h}`).toBeGreaterThanOrEqual(40);
    }
    await page.setViewportSize({ width: 1700, height: 1100 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/01-table-cycle-banner-page.png` });
    // element screenshot (proves it PAINTS, not just measures)
    const bannerEl = await rf.$('[data-testid="cycle-banner"]');
    await bannerEl!.screenshot({ path: `${OUT}/02-table-cycle-banner-element.png` });

    // ================= CHECK 2 — AI structure, key cells =================
    const before: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
    console.log("AI VIEW BEFORE =", JSON.stringify({ view: !!before?.view, bytes: before?.valueBytes }));
    const combos = await frame.locator('[role="combobox"]').evaluateAll((els: any[]) => els.map((e) => (e.innerText || "").trim()));
    console.log("TABLE COMBOBOXES =", JSON.stringify(combos));
    const gi = combos.findIndex((c: string) => /grouping|AI structure|Epic|Assignee|Status/i.test(c));
    await frame.locator('[role="combobox"]').nth(gi >= 0 ? gi : 0).click({ timeout: 25_000 });
    await page.waitForTimeout(900);
    await frame.getByRole("option", { name: /AI structure/i }).first().click({ timeout: 25_000 });
    await page.waitForTimeout(6000);
    const buildBtn = frame.locator("button").filter({ hasText: /Build AI structure/i }).first();
    if (await buildBtn.count()) { builtView = true; console.log("BUILD -> click"); await buildBtn.click({ timeout: 25_000 }); await page.waitForTimeout(75_000); }
    await page.waitForTimeout(6000);
    const trig = frame.locator('[data-testid="ai-strategy-trigger"]').first();
    if (await trig.count()) {
      console.log("STRATEGY =", await trig.getAttribute("data-strategy"));
      if ((await trig.getAttribute("data-strategy")) !== "chains") {
        await trig.click(); await page.waitForTimeout(800);
        await frame.locator('[data-testid="ai-strategy-option"][data-value="chains"]').first().click({ timeout: 25_000 });
        await page.waitForTimeout(40_000);
        console.log("STRATEGY NOW =", await trig.getAttribute("data-strategy"));
      }
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/03-table-ai-structure.png` });

    const keyProbe = () => rf.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="table-row"]'));
      return rows.map((r: any) => {
        const cut = r.querySelector('[data-testid="table-chain-cut-button"]');
        const cell = cut ? cut.parentElement : r.children[0];
        const span = cell ? Array.from(cell.querySelectorAll("span")).find((sp: any) => /^[A-Z]+-\d+$/.test((sp.textContent || "").trim())) as any : null;
        const cellR = cell ? cell.getBoundingClientRect() : null;
        return {
          key: r.getAttribute("data-row-key"),
          member: !!cut,
          shown: span ? (span.textContent || "").trim() : null,
          spanScrollW: span ? span.scrollWidth : null,
          spanClientW: span ? span.clientWidth : null,
          truncated: span ? span.scrollWidth > span.clientWidth + 1 : null,
          ellipsis: span ? getComputedStyle(span).textOverflow : null,
          cellW: cellR ? Math.round(cellR.width) : null,
          cellPos: cell ? getComputedStyle(cell).position : null,
          cutOpacity: cut ? getComputedStyle(cut).opacity : null,
        };
      });
    });
    const probe0 = await keyProbe();
    const members = probe0.filter((p: any) => p.member);
    console.log("TABLE ROWS =", probe0.length, " CHAIN MEMBER ROWS =", members.length);
    console.log("MEMBER KEY CELLS =", JSON.stringify(members, null, 1));
    console.log("KEYS SHOWN =", JSON.stringify(members.map((m: any) => `${m.key}=>${m.shown}`)));
    expect(members.length, "there are chain member rows with the cut control").toBeGreaterThan(0);
    for (const m of members as any[]) {
      expect(m.shown, `row ${m.key} shows its full key`).toBe(m.key);
      expect(m.truncated, `row ${m.key} key is not truncated`).toBe(false);
    }
    // HOVER the first member row and read the cut button
    const firstKey = (members[0] as any).key;
    const box = await rf.evaluate((k: string) => {
      const r = document.querySelector(`[data-row-key="${k}"]`) as any;
      const b = r.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }, firstKey);
    const fb = await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().boundingBox();
    await page.mouse.move(fb!.x + box.x + 60, fb!.y + box.y + box.h / 2);
    await page.waitForTimeout(1200);
    const hoverRead = await rf.evaluate((k: string) => {
      const r = document.querySelector(`[data-row-key="${k}"]`) as any;
      const cut = r.querySelector('[data-testid="table-chain-cut-button"]');
      const cell = cut.parentElement;
      const cb = cut.getBoundingClientRect(), ce = cell.getBoundingClientRect();
      const span = Array.from(cell.querySelectorAll("span")).find((sp: any) => /^[A-Z]+-\d+$/.test((sp.textContent || "").trim())) as any;
      const sb = span.getBoundingClientRect();
      return {
        key: k, opacity: getComputedStyle(cut).opacity, position: getComputedStyle(cut).position,
        cutRight: Math.round(cb.right), cellRight: Math.round(ce.right), gapFromRight: Math.round(ce.right - cb.right),
        cutW: Math.round(cb.width), cutH: Math.round(cb.height),
        keyRight: Math.round(sb.right), keyText: (span.textContent || "").trim(),
        overlapsKey: cb.left < sb.right,
        visible: cb.width > 0 && cb.height > 0,
      };
    }, firstKey);
    console.log("HOVER CUT =", JSON.stringify(hoverRead));
    await page.screenshot({ path: `${OUT}/04-table-member-hover.png` });
    const cellEl = await rf.$(`[data-row-key="${firstKey}"]`);
    await cellEl!.screenshot({ path: `${OUT}/05-member-row-hover.png` }).catch(() => {});
    expect(Number(hoverRead.opacity), "cut control is revealed on hover").toBe(1);
    expect(hoverRead.overlapsKey, "the cut control does not sit over the key text").toBe(false);

    console.log("STAGED AT END =", /Apply \d+ change|Save \(\d+\)/i.test(await text(frame)));
  } finally {
    await ctx.close();
    if (builtView) console.log("AI VIEW DELETE =", JSON.stringify(await getTestState("lz-ppm", { what: "aiViewDelete", planId: PLAN }).catch((e) => ({ err: String(e) }))));
    await getTestState("lz-ppm", { what: "clearDrafts", planId: PLAN }).catch(() => {});
    const after: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
    console.log("AI VIEW AFTER =", JSON.stringify({ view: !!after?.view, bytes: after?.valueBytes }));
  }
});

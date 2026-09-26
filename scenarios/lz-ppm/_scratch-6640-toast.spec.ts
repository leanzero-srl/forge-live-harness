// TESTER 6.64.0 check 3 — the refusal toast on LZPT (read-only: a refused link
// stages nothing). Captures the toast through a MutationObserver so a short-lived
// one cannot be missed, and reads the computed ground of the panel and icon disc.
import { test, expect } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "plan-msq9dg8l-gz6mz1";
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 1_200_000 });
const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const realFrame = async (f: any) => (await (await f.locator(":root").elementHandle())!.ownerFrame())!;

test("6.64.0 toast tone", async () => {
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  try {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2500);
    await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(5000);
    await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(9000);
    const rf = await realFrame(frame);
    console.log("STAGED AT START =", /Apply \d+ change|Save \(\d+\)/i.test(await text(frame)));

    // bring the loop rows into view
    await frame.locator('[data-testid="cycle-banner-jump"]').first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2500);

    // observer: capture every toast the moment it mounts
    await rf.evaluate(() => {
      (window as any).__toasts = [];
      const snap = (el: any) => {
        const c = getComputedStyle(el);
        const icon = el.firstElementChild, ic = icon ? getComputedStyle(icon) : null;
        const ib = icon ? icon.getBoundingClientRect() : null;
        const r = el.getBoundingClientRect();
        (window as any).__toasts.push({
          text: (el.innerText || "").trim().replace(/\n+/g, " | "),
          panelBg: c.backgroundColor, panelBorderColor: c.borderTopColor, panelBorderW: c.borderTopWidth,
          panelColor: c.color, panelRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          iconText: (icon?.textContent || "").trim(), iconBg: ic?.backgroundColor, iconColor: ic?.color,
          iconRadius: ic?.borderRadius, iconW: ib ? Math.round(ib.width) : null, iconH: ib ? Math.round(ib.height) : null,
          at: Date.now(),
        });
      };
      const mo = new MutationObserver((muts) => {
        for (const m of muts) for (const n of Array.from(m.addedNodes) as any[]) {
          if (n.nodeType === 1 && /toast-(enter|exit)/.test(n.className || "")) setTimeout(() => snap(n), 60);
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
      (window as any).__tokens = {
        cardSolid: getComputedStyle(document.documentElement).getPropertyValue("--lz-card-solid").trim(),
        card: getComputedStyle(document.documentElement).getPropertyValue("--lz-card").trim(),
        error: getComputedStyle(document.documentElement).getPropertyValue("--lz-error").trim(),
        errorLight: getComputedStyle(document.documentElement).getPropertyValue("--lz-error-light").trim(),
        warning: getComputedStyle(document.documentElement).getPropertyValue("--lz-warning").trim(),
        warningLight: getComputedStyle(document.documentElement).getPropertyValue("--lz-warning-light").trim(),
      };
    });

    const fb = (await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().boundingBox())!;
    const info = async (k: string) => rf.evaluate((k: string) => {
      const b = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as any;
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), inV: r.top > 0 && r.bottom < window.innerHeight && r.right > 0 && r.left < window.innerWidth };
    }, k);
    for (const k of ["LZPT-202", "LZPT-203", "LZPT-204"]) console.log(`BAR ${k} =`, JSON.stringify(await info(k)), " iframeBox=", JSON.stringify({ x: Math.round(fb.x), y: Math.round(fb.y), w: Math.round(fb.width), h: Math.round(fb.height) }));

    const scrollIn = async (k: string) => rf.evaluate((k: string) => {
      const b = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as any;
      b?.scrollIntoView({ block: "center", inline: "center" });
    }, k);
    const drag = async (from: string, to: string) => {
      await scrollIn(from); await page.waitForTimeout(1500);
      let a = await info(from); let b = await info(to);
      if (b && !b.inV) { await scrollIn(to); await page.waitForTimeout(1500); a = await info(from); b = await info(to); }
      if (!a || !b) { console.log("MISSING", from, to); return; }
      console.log(`PRE-DRAG ${from}=`, JSON.stringify(a), ` ${to}=`, JSON.stringify(b));
      // The existing dependency arrow's hit path covers the connector dot, so a real
      // mousedown lands on the SVG. Start the draw by dispatching on the dot itself.
      const started = await rf.evaluate((k: string) => {
        const bar = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as any;
        const dot = bar?.parentElement?.querySelector(".conn-dot-right") as any;
        if (!dot) return null;
        const r = dot.getBoundingClientRect();
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        dot.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: cx, clientY: cy, buttons: 1, button: 0 }));
        return { cx: Math.round(cx), cy: Math.round(cy) };
      }, from);
      console.log("DRAW START =", JSON.stringify(started));
      if (!started) return;
      const sx = fb.x + started.cx, sy = fb.y + started.cy;
      const tx = fb.x + b.x + b.w / 2, ty = fb.y + b.y + b.h / 2;
      await page.mouse.move(sx, sy);
      for (const fr of [0.25, 0.5, 0.75, 0.95, 1]) await page.mouse.move(sx + (tx - sx) * fr, sy + (ty - sy) * fr, { steps: 8 });
      await page.waitForTimeout(500);
      console.log("MID-DRAG el at target =", await rf.evaluate(([x, y]: any) => { const e = document.elementFromPoint(x, y) as any; return e ? ((e.getAttribute && e.getAttribute("data-testid")) || e.tagName) + "|" + (e.getAttribute ? e.getAttribute("data-key") : "") : null; }, [b.x + b.w / 2, b.y + b.h / 2]));
      await page.mouse.up();
      await page.waitForTimeout(1800);
      console.log(`DRAG ${from}->${to} done; toasts so far =`, (await rf.evaluate(() => (window as any).__toasts.length)));
    };

    await drag("LZPT-202", "LZPT-203");   // duplicate  -> warning
    await page.screenshot({ path: `${OUT}/10-toast-dup.png` });
    const el1 = await rf.$(".toast-enter"); if (el1) await el1.screenshot({ path: `${OUT}/11-toast-dup-el.png` }).catch(() => {});
    await page.waitForTimeout(6000);
    await drag("LZPT-202", "LZPT-204");   // closes a cycle -> error
    await page.screenshot({ path: `${OUT}/12-toast-cycle.png` });
    const el2 = await rf.$(".toast-enter"); if (el2) await el2.screenshot({ path: `${OUT}/13-toast-cycle-el.png` }).catch(() => {});

    const caught = await rf.evaluate(() => ({ toasts: (window as any).__toasts, tokens: (window as any).__tokens }));
    console.log("TOKENS =", JSON.stringify(caught.tokens));
    console.log("TOASTS =", JSON.stringify(caught.toasts, null, 1));
    console.log("STAGED AFTER DRAGS =", /Apply \d+ change|Save \(\d+\)/i.test(await text(frame)));
    const arrows = await rf.evaluate(() => Array.from(document.querySelectorAll('[data-testid="dep-arrow-hit"]')).map((e: any) => e.getAttribute("data-link")).filter((l: string) => /202|203|204/.test(l)));
    console.log("LOOP ARROWS =", JSON.stringify(arrows));
    expect(caught.toasts.length, "at least one toast was captured").toBeGreaterThan(0);
  } finally {
    await ctx.close();
    await getTestState("lz-ppm", { what: "clearDrafts", planId: PLAN }).catch(() => {});
  }
});

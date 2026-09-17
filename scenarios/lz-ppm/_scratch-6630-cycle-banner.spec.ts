// TESTER (6.63.0 item 1): the CYCLE BANNER on a real plan.
// LZPT carries one declared loop (LZPT-202 -> 203 -> 204 -> 202). The banner must
// appear above BOTH the Gantt and the Table, name the edge the engine ignores,
// expand to the edge in user terms, jump to the row, and be ABSENT on an acyclic
// plan. Also renders it in dark mode. Read-only on Jira; the acyclic fixture plan
// is created through the hook and deleted in finally.
import { test, expect } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "plan-msq9dg8l-gz6mz1";
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 1_800_000 });

const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const realFrame = async (f: any) => (await (await f.locator(":root").elementHandle())!.ownerFrame())!;

async function readBanner(frame: any) {
  const b = frame.locator('[data-testid="cycle-banner"]').first();
  if (!(await b.count())) return null;
  return {
    loops: await b.getAttribute("data-loops"),
    headline: (await frame.locator('[data-testid="cycle-banner-headline"]').first().innerText()).trim(),
    body: (await b.innerText()).trim(),
    toggle: (await frame.locator('[data-testid="cycle-banner-toggle"]').first().innerText()).trim(),
  };
}

test("6.63.0 cycle banner on LZPT: Gantt + Table + dark + absent on an acyclic plan", async () => {
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  let fixtureId: string | null = null;
  try {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2500);
    const rev = (await text(frame)).match(/REV\s*V?([0-9.]+)/);
    console.log("REV =", rev ? rev[1] : "(not on this screen)");

    await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(4000);
    if (!/Gantt|Table|Dashboard/i.test(await text(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
    await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);

    // ---------- GANTT ----------
    const g = await readBanner(frame);
    console.log("GANTT BANNER =", JSON.stringify(g, null, 1));
    expect(g, "the banner must render on the Gantt of a cyclic plan").not.toBeNull();
    await page.screenshot({ path: `${OUT}/01-gantt-banner-collapsed.png` });

    // expand
    await frame.locator('[data-testid="cycle-banner-toggle"]').first().dispatchEvent("click");
    await page.waitForTimeout(800);
    const edges = await frame.locator('[data-testid="cycle-banner-edge"]').evaluateAll((els: any[]) => els.map((e) => ({
      from: e.getAttribute("data-from"), to: e.getAttribute("data-to"), text: (e as any).innerText.replace(/\n+/g, " | "),
    })));
    console.log("EXPANDED EDGES =", JSON.stringify(edges, null, 1));
    await page.screenshot({ path: `${OUT}/02-gantt-banner-expanded.png` });
    const banner = frame.locator('[data-testid="cycle-banner"]').first();
    console.log("BANNER BOX =", JSON.stringify(await banner.boundingBox()));

    // house rules: read the computed styles of the banner + its head
    const rf = await realFrame(frame);
    const styles = await rf.evaluate(() => {
      const pick = (el: any) => { const c = getComputedStyle(el); return {
        background: c.backgroundColor, color: c.color, borderLeft: c.borderLeftWidth + " " + c.borderLeftStyle + " " + c.borderLeftColor,
        borderTop: c.borderTopWidth + " " + c.borderTopStyle + " " + c.borderTopColor,
        borderRight: c.borderRightWidth + " " + c.borderRightStyle + " " + c.borderRightColor,
        borderBottom: c.borderBottomWidth + " " + c.borderBottomStyle + " " + c.borderBottomColor }; };
      const root = document.querySelector('[data-testid="cycle-banner"]') as any;
      const head = root?.querySelector(".lz-cycle-banner-head");
      const jump = root?.querySelector('[data-testid="cycle-banner-jump"]');
      const key = root?.querySelector(".lz-cycle-banner-key");
      return { theme: document.documentElement.getAttribute("data-theme"), root: root && pick(root), head: head && pick(head), jump: jump && pick(jump), key: key && pick(key) };
    });
    console.log("STYLES(light) =", JSON.stringify(styles, null, 1));

    // ---------- JUMP ----------
    const before = await rf.evaluate(() => {
      const out: any = {};
      for (const k of ["LZPT-202", "LZPT-203", "LZPT-204"]) {
        const row = document.querySelector(`[data-row-key="${k}"]`) as any;
        out[k] = row ? { top: Math.round(row.getBoundingClientRect().top), dim: row.getAttribute("data-dim") } : "not-mounted";
      }
      const sc = document.querySelector('[data-testid="gantt-scroll"]') as any;
      out.__scroll = sc ? { left: Math.round(sc.scrollLeft), top: Math.round(sc.scrollTop) } : null;
      out.__chip = !!document.querySelector('[data-testid="gantt-focus-chip"]');
      return out;
    });
    console.log("ROWS BEFORE JUMP =", JSON.stringify(before));
    await frame.locator('[data-testid="cycle-banner-jump"]').first().dispatchEvent("click");
    await page.waitForTimeout(2500);
    const chip = frame.locator('[data-testid="gantt-focus-chip"]').first();
    const chipInfo = (await chip.count()) ? { reason: await chip.getAttribute("data-focus-reason"), label: (await chip.innerText()).trim() } : null;
    console.log("FOCUS CHIP =", JSON.stringify(chipInfo));
    const vis = await rf.evaluate(() => {
      const out: any = {};
      for (const k of ["LZPT-202", "LZPT-203", "LZPT-204"]) {
        const row = document.querySelector(`[data-row-key="${k}"]`) as any;
        if (!row) { out[k] = "not-mounted"; continue; }
        const r = row.getBoundingClientRect();
        out[k] = { top: Math.round(r.top), bottom: Math.round(r.bottom), dim: row.getAttribute("data-dim"), inViewport: r.top < window.innerHeight && r.bottom > 0 };
      }
      const dims = Array.from(document.querySelectorAll("[data-dim]")).map((e: any) => e.getAttribute("data-dim"));
      out.__dimCounts = dims.reduce((a: any, d: any) => { a[d] = (a[d] || 0) + 1; return a; }, {});
      return out;
    });
    console.log("ROWS AFTER JUMP =", JSON.stringify(vis, null, 1));
    await page.screenshot({ path: `${OUT}/03-gantt-after-jump.png` });

    // ---------- TABLE ----------
    await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
    await page.waitForTimeout(5000);
    const t = await readBanner(frame);
    console.log("TABLE BANNER =", JSON.stringify(t, null, 1));
    expect(t, "the banner must render on the Table too").not.toBeNull();
    await page.screenshot({ path: `${OUT}/04-table-banner.png` });
    await frame.locator('[data-testid="cycle-banner-toggle"]').first().dispatchEvent("click");
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/05-table-banner-expanded.png` });
    const tEdges = await frame.locator('[data-testid="cycle-banner-edge"]').evaluateAll((els: any[]) => els.map((e: any) => e.innerText.replace(/\n+/g, " | ")));
    console.log("TABLE EDGES =", JSON.stringify(tEdges));

    // ---------- DARK ----------
    await rf.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForTimeout(1200);
    const darkStyles = await rf.evaluate(() => {
      const pick = (el: any) => { const c = getComputedStyle(el); return { background: c.backgroundColor, color: c.color, borderLeft: c.borderLeftWidth + " " + c.borderLeftColor }; };
      const root = document.querySelector('[data-testid="cycle-banner"]') as any;
      return { theme: document.documentElement.getAttribute("data-theme"), root: root && pick(root),
        head: root && pick(root.querySelector(".lz-cycle-banner-head")), key: root && pick(root.querySelector(".lz-cycle-banner-key")),
        say: root && pick(root.querySelector(".lz-cycle-banner-say")), loop: root && pick(root.querySelector(".lz-cycle-banner-loop")),
        lede: root && pick(root.querySelector(".lz-cycle-banner-lede")) };
    });
    console.log("STYLES(dark) =", JSON.stringify(darkStyles, null, 1));
    await page.screenshot({ path: `${OUT}/06-table-banner-dark.png` });
    await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/07-gantt-banner-dark.png` });
    await rf.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));

    // ---------- ACYCLIC PLAN: the banner must be ABSENT ----------
    const fx: any = await getTestState("lz-ppm", {
      what: "createFixture", name: "[harness-test] acyclic 6630",
      jql: "project = LZPT AND key != LZPT-188 AND (parent is EMPTY OR parent != LZPT-188)",
    });
    fixtureId = fx.planId;
    console.log("ACYCLIC FIXTURE =", fixtureId, "issues:", (fx.issues || []).length);
    const cyc = await getTestState("lz-ppm", { what: "plan", planId: fixtureId });
    const withPreds = (cyc.issues || []).filter((i: any) => (i.predecessors || []).length).map((i: any) => `${i.key}<-${i.predecessors.join(",")}`);
    console.log("FIXTURE EDGES =", withPreds.join(" "));
    expect((cyc.issues || []).some((i: any) => ["LZPT-202", "LZPT-203", "LZPT-204"].includes(i.key)), "the loop members must be out of the fixture").toBe(false);

    await frame.getByRole("button", { name: /Plans|Back/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const s2 = await enterForgeSurface(page, { surface: "custom" });
    const f2: any = (s2 as any).frame;
    await page.waitForTimeout(3000);
    await f2.getByText("acyclic 6630", { exact: false }).first().click({ timeout: 30_000 });
    await page.waitForTimeout(6000);
    await f2.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(7000);
    const bodyText = await text(f2);
    const a = await readBanner(f2);
    console.log("ACYCLIC GANTT BANNER =", JSON.stringify(a));
    console.log("ACYCLIC has rows =", /LZPT-/.test(bodyText), "bars:", await f2.locator('[data-testid="gantt-bar"]').count());
    await page.screenshot({ path: `${OUT}/08-acyclic-gantt-no-banner.png` });
    await f2.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
    await page.waitForTimeout(5000);
    const a2 = await readBanner(f2);
    console.log("ACYCLIC TABLE BANNER =", JSON.stringify(a2));
    await page.screenshot({ path: `${OUT}/09-acyclic-table-no-banner.png` });
    expect(a, "no banner on an acyclic plan (Gantt)").toBeNull();
    expect(a2, "no banner on an acyclic plan (Table)").toBeNull();
  } finally {
    if (fixtureId) {
      await getTestState("lz-ppm", { what: "deleteFixture", planId: fixtureId }).catch(() => {});
      const plans: any = await getTestState("lz-ppm", { what: "plans" });
      const still = (plans.plans || []).some((p: any) => p.id === fixtureId);
      console.log("STILL_EXISTS =", still);
    }
    await ctx.close();
  }
});

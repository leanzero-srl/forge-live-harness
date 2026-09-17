// TESTER (6.62.0): can a cut made in the TABLE be undone in the TABLE?
import { test } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "plan-msq9dg8l-gz6mz1";
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 900_000 });

test("table undo of a chain cut", async () => {
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  try {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2500);
    await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(4000);
    await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
    const tgrp = frame.locator('[role="combobox"]').filter({ hasText: /grouping|AI structure|Status/i }).first();
    const tgt = await tgrp.innerText().catch(() => "");
    console.log("TABLE GROUPING =", tgt);
    if (!/AI structure/i.test(tgt)) { await tgrp.click(); await page.waitForTimeout(700); await frame.getByRole("option", { name: /AI structure/i }).first().click(); await page.waitForTimeout(15_000); }
    await page.waitForTimeout(4000);
    const hdrs = () => frame.locator('[data-testid="table-group-header"]').evaluateAll((els: any[]) => els.map((e) => ({ gv: e.getAttribute("data-group-gv"), label: e.getAttribute("data-group-label"), parents: e.getAttribute("data-group-parent-count") })));
    console.log("TABLE HEADERS (start) =", JSON.stringify(await hdrs()));
    console.log("SEGMENT MENU BUTTONS on table headers =", await frame.locator('[data-testid="table-group-header"] [data-testid="gantt-segment-menu-button"]').count());
    const tb = frame.locator('[data-testid="table-chain-cut-button"][data-key="LZPT-194"]').first();
    const bb = await tb.boundingBox(); if (bb) await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await tb.click({ timeout: 20_000 }); await page.waitForTimeout(900);
    const menu = frame.locator('[data-testid="ai-chain-split-menu"]').first();
    console.log("MENU canUndo =", await menu.getAttribute("data-can-undo"), "text:", (await menu.innerText()).replace(/\s+/g, " "));
    await page.screenshot({ path: `${OUT}/t1-menu.png` });
    const un = frame.locator('[data-testid="ai-chain-action-unsplit"]');
    console.log("UNDO ITEM in table member menu count =", await un.count());
    if (await un.count()) {
      await un.first().click({ timeout: 10_000 });
      await page.waitForTimeout(4500);
      console.log("TABLE HEADERS (after undo) =", JSON.stringify(await hdrs()));
      await page.screenshot({ path: `${OUT}/t2-after-undo.png` });
    }
    const v: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
    console.log("AIVIEW OVERLAY NOW =", JSON.stringify(v?.view?.overlay ?? v?.overlay ?? "(no overlay key)"), "bytes=", v?.valueBytes);
  } finally {
    await page.screenshot({ path: `${OUT}/t99.png` }).catch(() => {});
    await ctx.close().catch(() => {});
  }
});

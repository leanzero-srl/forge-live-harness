// TESTER PROBE — v6.98.0 ITEM 3: the wrapped meta-row separator, in the real
// Forge iframe, at several widths, on BOTH surfaces. Also the overflow:hidden
// clipping risk on the long disclosure chip.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP, PANEL_APP, assertLoggedIn, openGlobalPage, openPanel, waitForChatApp,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const P = getTarget("chatwise-issue-panel");
const PANEL_ISSUE = process.env.CHATWISE_PANEL_ISSUE || "WFH-1";
test.describe.configure({ timeout: 600_000 });

const QUOTA = "Your configured model (claude-sonnet-5) hit its token limit — this reply came from claude-opus-5 instead.";

/** Build a real meta row through the shipped renderer, on a real message. */
const BUILD = (quota: string) => `(() => {
  const app = window.__CW_APP__;
  const chat = app.components.chat;
  const m = chat.addMessage({ type: "ai", content: "Probe message for the meta row.", streaming: false });
  chat.attachAssistantMeta(m.id, {
    model: "claude-opus-5",
    usage: { total_tokens: 94000 },
    iterations: 5,
    truncated: true,
    contextNote: { compacted: true, degraded: false, droppedCount: 0, quotaNote: ${JSON.stringify(quota)} },
    skillsUsed: ["diconium-brand", "chatwise-jira-conventions"],
  });
  return m.id;
})()`;

const MEASURE = `(() => {
  const row = document.querySelector("#chatMessages .message-meta");
  if (!row) return { error: "no meta row" };
  const rr = row.getBoundingClientRect();
  const cs = getComputedStyle(row);
  const chips = Array.from(row.querySelectorAll(".message-meta-chip")).map((c) => {
    const r = c.getBoundingClientRect();
    const s = getComputedStyle(c);
    const b = getComputedStyle(c, "::before");
    return {
      text: (c.textContent || "").trim().slice(0, 70),
      x: Math.round(r.left - rr.left), y: Math.round(r.top - rr.top),
      w: Math.round(r.width), h: Math.round(r.height),
      scrollW: c.scrollWidth, clientW: c.clientWidth,
      textClipped: c.scrollWidth > c.clientWidth + 1,
      whiteSpace: s.whiteSpace,
      ruleLeft: b.left, ruleBorder: b.borderLeftWidth,
      // is the rule inside the clipped box?
      ruleVisibleX: Math.round(r.left - rr.left) - 10,
    };
  });
  return {
    rowW: Math.round(rr.width), rowH: Math.round(rr.height),
    overflow: cs.overflow, gap: cs.gap, paddingLeft: cs.paddingLeft,
    rowScrollW: row.scrollWidth, rowClientW: row.clientWidth,
    rowClipped: row.scrollWidth > row.clientWidth + 1 || row.scrollHeight > row.clientHeight + 1,
    scrollH: row.scrollHeight, clientH: row.clientHeight,
    lines: [...new Set(chips.map((c) => c.y))].sort((a, b) => a - b),
    chips,
  };
})()`;

test("PROBE css: global page meta row at several widths", async ({ page }) => {
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await frame.locator("body").evaluate((_e, k) => { (window as any).__CW_APP__ = (window as any)[k]; }, GLOBAL_APP);
  await frame.locator("#newChatButton").click();
  await page.waitForTimeout(800);
  await frame.locator("body").evaluate((_e, src) => eval(src), BUILD(QUOTA));

  for (const w of [1440, 1200, 1000, 840, 700, 560, 420]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(500);
    const r: any = await frame.locator("body").evaluate((_e, src) => eval(src), MEASURE);
    console.log(`\n### GLOBAL @ viewport ${w}px  row=${r.rowW}px lines=${JSON.stringify(r.lines)} overflow=${r.overflow} gap=${r.gap} padL=${r.paddingLeft} rowClipped=${r.rowClipped} (scrollW ${r.rowScrollW}/${r.rowClientW}, scrollH ${r.scrollH}/${r.clientH})`);
    for (const c of r.chips) {
      const firstOnLine = r.chips.filter((o: any) => o.y === c.y).sort((a: any, b: any) => a.x - b.x)[0] === c;
      console.log(`   [y=${c.y} x=${c.x} w=${c.w}] first-on-line=${firstOnLine} ruleAtX=${c.ruleVisibleX} border=${c.ruleBorder} ws=${c.whiteSpace} textClipped=${c.textClipped} :: "${c.text}"`);
      // A rule belonging to the FIRST chip on a line must sit at x < 0 (outside the clip).
      if (firstOnLine) {
        expect(c.ruleVisibleX, `a separator is drawn at the left edge of a wrapped line (viewport ${w})`).toBeLessThan(0);
      }
      expect(c.textClipped, `chip text CLIPPED by overflow:hidden at viewport ${w}: "${c.text}"`).toBe(false);
    }
    expect(r.rowClipped, `the meta row itself is clipped at viewport ${w}`).toBe(false);
    await frame.locator("#chatMessages .message.assistant").last()
      .screenshot({ path: `test-results/meta-global-${w}.png` }).catch(() => {});
  }
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("PROBE css: issue panel meta row", async ({ page }) => {
  await assertLoggedIn(page);
  const frame = await openPanel(page, P, PANEL_ISSUE);
  await waitForChatApp(page, frame, PANEL_APP);
  await frame.locator("body").evaluate((_e, k) => { (window as any).__CW_APP__ = (window as any)[k]; }, PANEL_APP);
  await frame.locator("body").evaluate((_e, src) => eval(src), BUILD(QUOTA));
  for (const w of [1440, 1000, 700]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(500);
    const r: any = await frame.locator("body").evaluate((_e, src) => eval(src), MEASURE);
    console.log(`\n### PANEL @ viewport ${w}px  row=${r.rowW}px lines=${JSON.stringify(r.lines)} overflow=${r.overflow} gap=${r.gap} rowClipped=${r.rowClipped}`);
    for (const c of r.chips) {
      console.log(`   [y=${c.y} x=${c.x} w=${c.w}] ruleAtX=${c.ruleVisibleX} border=${c.ruleBorder} ws=${c.whiteSpace} textClipped=${c.textClipped} :: "${c.text}"`);
      expect(c.textClipped, `PANEL chip text clipped at ${w}: "${c.text}"`).toBe(false);
    }
    await frame.locator("#chatMessages .message.assistant").last()
      .screenshot({ path: `test-results/meta-panel-${w}.png` }).catch(() => {});
  }
  await page.setViewportSize({ width: 1440, height: 900 });
});

import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, PANEL_APP, assertLoggedIn, openGlobalPage, openPanel, waitForChatApp } from "./chatwise-support";
const T = getTarget("chatwise-global");
const P = getTarget("chatwise-issue-panel");
const PANEL_ISSUE = process.env.CHATWISE_PANEL_ISSUE || "WFH-1";
test.describe.configure({ timeout: 600_000 });
const QUOTA = "Your configured model (claude-sonnet-5) hit its token limit — this reply came from claude-opus-5 instead.";
const BUILD = `(() => {
  const chat = window.__CW_APP__.components.chat;
  const m = chat.addMessage({ type: "ai", content: "Probe message for the meta row. Look at the chips underneath.", streaming: false });
  chat.attachAssistantMeta(m.id, { model: "claude-opus-5", usage: { total_tokens: 94000 }, iterations: 5,
    truncated: true, contextNote: { compacted: true, degraded: false, droppedCount: 0, quotaNote: ${JSON.stringify(QUOTA)} },
    skillsUsed: ["diconium-brand", "chatwise-jira-conventions"] });
  return m.id;
})()`;
test("PROBE css2: screenshots", async ({ page }) => {
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await frame.locator("body").evaluate((_e, k) => { (window as any).__CW_APP__ = (window as any)[k]; }, GLOBAL_APP);
  await page.setViewportSize({ width: 1440, height: 900 });
  await frame.locator("#newChatButton").click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
  await frame.locator("body").evaluate((_e, s) => eval(s), BUILD);
  for (const w of [1440, 1000, 760, 620, 480]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(700);
    const el = frame.locator(".message.assistant").last();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await el.screenshot({ path: `test-results/shot3-global-${w}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const pf = await openPanel(page, P, PANEL_ISSUE);
  await waitForChatApp(page, pf, PANEL_APP);
  await pf.locator("body").evaluate((_e, k) => { (window as any).__CW_APP__ = (window as any)[k]; }, PANEL_APP);
  await pf.locator("body").evaluate((_e, s) => eval(s), BUILD);
  await page.waitForTimeout(400);
  await pf.locator("#chatMessages").screenshot({ path: `test-results/shot-panel-1440.png` });
});

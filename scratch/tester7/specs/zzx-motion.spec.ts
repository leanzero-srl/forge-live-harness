// TESTER SPEC — is the 220ms entrance actually IN THE DEPLOYED BUNDLE, on both
// surfaces, and does the row land at the right opacity?
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, PANEL_APP, openGlobalPage, openPanel, waitForChatApp } from "./chatwise-support";

const TG = getTarget("chatwise-global");
const TP = getTarget("chatwise-issue-panel");
test.describe.configure({ retries: 0, timeout: 900_000 });

const PROBE = `(async () => {
  const app = window.__CWAPP__;
  const ci = app.components && app.components.chat;
  if (!ci) return { error: "no components.chat: " + Object.keys(app).join(",") };
  const id = "probe_" + Date.now();
  ci.addMessage({ id: id, role: "assistant", content: "Probe row.", model: "claude-sonnet-5",
    usage: { total_tokens: 1234 }, iterations: 3, truncated: true, contextNote: null, skillsUsed: null,
    decks: null, answerOptions: null });
  var el = document.querySelector('[data-message-id="' + id + '"] .message-meta');
  if (!el) return { error: "no meta row was drawn at all" };
  var cs = getComputedStyle(el);
  var out = { id: id, animationName: cs.animationName, duration: cs.animationDuration, fill: cs.animationFillMode,
    anims: el.getAnimations().map(function(a){ return { name: a.animationName, state: a.playState }; }),
    chips: Array.prototype.map.call(el.querySelectorAll(".message-meta-chip"), function(c){ return c.textContent.trim(); }),
    borderLeft: cs.borderLeftWidth, startOpacity: cs.opacity };
  // Settle IN THE SAME EVALUATE — the app re-renders and a later lookup misses.
  await Promise.all(el.getAnimations().map(function(a){ return a.finished; }));
  out.settledOpacity = getComputedStyle(el).opacity;
  out.stillRunning = el.getAnimations().filter(function(a){ return a.playState === "running"; }).length;
  return out;
})()`;

const SETTLED = (id: string) => `(() => {
  var el = document.querySelector('[data-message-id="${id}"] .message-meta');
  var cs = getComputedStyle(el);
  return { opacity: cs.opacity, running: el.getAnimations().filter(function(a){return a.playState==="running";}).length };
})()`;

async function probe(page: any, frame: any, appKey: string, label: string) {
  await frame.locator("body").evaluate((_e: any, k: string) => { (window as any).__CWAPP__ = (window as any)[k]; }, appKey);
  const r: any = await frame.locator("body").evaluate((_e: any, src: string) => eval(src), PROBE);
  console.log(`### ${label} PROBE: ${JSON.stringify(r)}`);
  expect(r.error, `${label}: ${r.error}`).toBeUndefined();
  expect(r.animationName, `${label}: the deployed row has NO entrance animation`).toBe("meta-row-in");
  expect(r.duration).toBe("0.22s");
  expect(r.fill).toBe("both");
  expect(r.anims.some((a: any) => a.state === "running"), `${label}: the entrance was not running — it blinks in`).toBe(true);
  expect(Number(r.startOpacity), `${label}: the row was already at rest — no entrance`).toBeLessThan(1);
  expect(r.borderLeft, `${label}: a left accent rail appeared on the meta row`).toBe("0px");
  console.log(`### ${label} SETTLED: opacity=${r.settledOpacity} stillRunning=${r.stillRunning}`);
  return { opacity: r.settledOpacity };
}

test("the meta row entrance is in the deployed bundle on BOTH surfaces", async ({ page }) => {
  const gf = await openGlobalPage(page, TG);
  await waitForChatApp(page, gf, GLOBAL_APP);
  console.log("### GLOBAL VERSION:", ((await gf.locator("#version-indicator").textContent()) || "").trim());
  const g = await probe(page, gf, GLOBAL_APP, "globalPage");
  expect(Number(g.opacity), "global page row did not land at 1").toBeCloseTo(1, 2);

  const { get } = await import("../../data/jira.mjs");
  const found: any = await get(`/rest/api/3/search/jql?jql=${encodeURIComponent("project = WFH ORDER BY created DESC")}&maxResults=1&fields=summary`);
  const key = String(found?.issues?.[0]?.key);
  const pf = await openPanel(page, TP, key);
  await waitForChatApp(page, pf, PANEL_APP);
  console.log("### PANEL VERSION:", ((await pf.locator("#version-indicator").textContent()) || "").trim());
  const p = await probe(page, pf, PANEL_APP, "issuePanel");
  expect(Number(p.opacity), "issue panel row did not land at its designed 0.85").toBeCloseTo(0.85, 2);
});

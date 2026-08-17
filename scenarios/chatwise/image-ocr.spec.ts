import { test, expect } from "@playwright/test";
import { launchHarnessContext } from "/Users/mihaiperdum/Projects/forge-live-harness/forge/browser";
import { getTarget } from "/Users/mihaiperdum/Projects/forge-live-harness/config/targets";
import { openGlobalPage, waitForChatApp, GLOBAL_APP } from "/Users/mihaiperdum/Projects/forge-live-harness/scenarios/chatwise/chatwise-support";

// LIVE: images are read in the browser, under the real Forge CSP.
//
// This cannot be a unit test and it cannot be a stub-harness test. The whole
// question is whether WASM instantiates inside a Forge Custom UI iframe, whose
// CSP is set by the manifest and applied by Atlassian — locally it always
// works, and that tells you nothing.
//
// It also asserts the thing that would otherwise rot silently: NO REQUEST
// LEAVES ATLASSIAN. tesseract.js defaults its worker and language paths to
// CDNs; if either override in ImageOcr.js is ever dropped, OCR keeps working
// perfectly and the app quietly stops being egress-free.
test("OCR runs under the Forge CSP and reads text, with zero external requests", async () => {
  test.setTimeout(600_000);
  const T = getTarget("chatwise-global");
  const context = await launchHarnessContext({});
  const page = context.pages()[0] ?? (await context.newPage());
  // Every request the page makes, with the frame that made it. The frame is
  // the important half: this tenant has other Forge apps installed
  // (herocoders, ScriptRunner) and Jira itself talks to Sentry, so "any
  // third-party request on the page" is noise that has nothing to do with us.
  const requests: Array<{ url: string; frameUrl: string }> = [];
  page.on("request", (r) => {
    requests.push({ url: r.url(), frameUrl: r.frame()?.url() || "" });
  });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });

  // The harness reuses a persistent browser profile, so a redeploy is happily
  // served from cache — the giveaway is an implausibly fast run against a
  // stale bundle.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const r: any = await frame.locator("body").evaluate(async () => {
    const fn = (window as any).__chatwiseOcrSpike;
    if (typeof fn !== "function") return { ok: false, reason: "spike hook missing" };
    return fn();
  });
  console.log("OCR RESULT:", JSON.stringify(r, null, 1));
  console.log("CONSOLE ERRORS:", JSON.stringify(errors.slice(0, 6), null, 1));

  // What CHATWISE'S OWN FRAME asked for, and where it went. The app is served
  // from *.cdn.prod.atlassian-dev.net, so anything from that frame going
  // elsewhere is ours and is egress.
  const ours = requests.filter((r) => /atlassian-dev\.net/.test(r.frameUrl));
  const oursExternal = ours
    .map((r) => r.url)
    .filter((u) => !/^(data|blob):/.test(u) && !/atlassian-dev\.net|atlassian\.net|atl-paas\.net/.test(u));
  console.log("REQUESTS FROM CHATWISE'S FRAME:", ours.length, "external:", JSON.stringify(oursExternal));

  // And the specific hosts tesseract.js falls back to if an override is lost.
  // Checked across the WHOLE page, because a worker's requests are not always
  // attributed to the frame that started it.
  const OCR_CDNS = /cdn\.jsdelivr\.net|unpkg\.com|tessdata\.projectnaptha\.com|raw\.githubusercontent/;
  const cdnHits = requests.map((r) => r.url).filter((u) => OCR_CDNS.test(u));
  console.log("OCR CDN REQUESTS:", JSON.stringify(cdnHits));

  await context.close();

  expect(r.ok, `OCR failed: ${r.reason} ${r.detail || ""}`).toBeTruthy();
  // Character-for-character. A fuzzy match would pass on plausible garbage,
  // which is the exact failure the confidence gate exists to prevent.
  expect(r.text.trim()).toBe(r.expected);
  expect(r.confidence, "confidence below the gate — this would be discarded").toBeGreaterThan(80);
  expect(
    cdnHits,
    "an OCR asset came from a CDN — workerPath/corePath/langPath override was dropped",
  ).toEqual([]);
  expect(
    oursExternal,
    "ChatWise's own frame made a request outside Atlassian — the app is no longer egress-free",
  ).toEqual([]);
});

// Shared plumbing for the ChatWise BEHAVIOURAL scenarios (chat-roundtrip,
// conversation-persistence, stop-cancel, admin-config-guard, persona-switch).
// Not a spec — testMatch only collects *.spec.ts (same trick as
// scenarios/lz-ppm/cascade-runner.ts).
//
// Three things every behavioural ChatWise spec needs, and none of which the
// render-smoke helpers provide:
//
//  1. ENTER the chat surface and wait for the app to actually BOOT — not just
//     for the iframe to mount. `#appShell` / `#chatInput` are static markup in
//     index.html, so they are visible long before the bundle has run, the beta
//     gate has answered, or the composer is wired. The real boot signal is the
//     app instance the entry point publishes on `window` AFTER `init()`
//     resolves (GlobalPageApp.js `window.chatWiseGlobal`, IssuePanelApp.js
//     `window.chatWiseIssuePanel`). Asserting anything before that is a race.
//
//  2. CALL A RESOLVER from inside the iframe. `@forge/bridge`'s `invoke` is
//     bundled, not global, so it cannot be reached from `page.evaluate`
//     directly — but the booted app exposes the same bridge through
//     `app.services.forgeAPI.call(method, payload)` (ForgeAPIService.js:20,
//     which is a thin wrapper over `invoke`). That is a genuine in-iframe
//     invoke() with the caller's real Forge identity, which is exactly what a
//     resolver-guard test has to exercise.
//
//  3. READ THE THREAD as roles, not as text. The role→CSS mapping IS the thing
//     under test (a restored assistant message once rendered as the user's own
//     bubble), so every assertion keys off `.message.assistant` /
//     `.message.user` rather than "the text appears somewhere on screen".
import type { Page, FrameLocator } from "@playwright/test";
import type { Target } from "../../config/targets";
import type { Recorder } from "../../capture/recorder";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";
import { openIssuePanel } from "../../forge/host";

/** `window` key each entry point publishes its booted app instance on. */
export const GLOBAL_APP = "chatWiseGlobal";
export const PANEL_APP = "chatWiseIssuePanel";
/** The "AI Assistant" glance title on a Jira issue (manifest jira:issuePanel). */
export const PANEL_TITLE = "AI Assistant";

export interface RenderedMessage {
  /** Rendered role, derived from the wrapper class the renderer chose. */
  role: "user" | "assistant" | "unknown";
  className: string;
  text: string;
  /** Markdown structures — only the ASSISTANT render path produces these. */
  hasTable: boolean;
  hasCode: boolean;
  /** The meta-chip row (model / tokens / tool calls) under an assistant bubble. */
  meta: string;
  streaming: boolean;
}

/* ------------------------------------------------------------------ */
/* Surface entry                                                       */
/* ------------------------------------------------------------------ */

export function setRecorderTarget(recorder: Recorder, T: Target, url: string): void {
  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url, repo: T.repo,
  });
}

/**
 * Open the ChatWise GLOBAL page and return the Custom-UI frame. Does NOT wait
 * for boot — call `waitForChatApp` for that (kept separate so a spec can
 * record "navigated" and "booted" as distinct evidence steps).
 */
export async function openGlobalPage(page: Page, T: Target, recorder?: Recorder): Promise<FrameLocator> {
  const url = T.deepLink(T.envId)!;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (recorder) recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  if (surface.kind !== "custom") throw new Error("ChatWise global page must be a Custom-UI iframe surface");
  recorder?.attachSurface(surface);
  return surface.frame;
}

/**
 * Open a Jira issue, expand the "AI Assistant" glance and return ChatWise's
 * frame. The issue page hosts several Forge iframes (lz-ppm is installed on
 * wolfaenpak too), so selection goes through the target's `#chatInput`
 * readySelector rather than "whichever iframe attached first".
 */
export async function openPanel(page: Page, T: Target, issueKey: string, recorder?: Recorder): Promise<FrameLocator> {
  await openIssuePanel(page, issueKey, PANEL_TITLE);
  if (recorder) recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  if (surface.kind !== "custom") throw new Error("ChatWise issue panel must be a Custom-UI iframe surface");
  recorder?.attachSurface(surface);
  return surface.frame;
}

export { assertLoggedIn, BASE_URL };

/* ------------------------------------------------------------------ */
/* Boot + in-iframe resolver access                                     */
/* ------------------------------------------------------------------ */

/**
 * Wait until the surface's app instance exists on `window`. Distinguishes the
 * two ways this can fail so the evidence says WHICH: the beta gate painted its
 * blocking screen (a denial), or nothing settled at all (init threw / hung).
 */
export async function waitForChatApp(
  page: Page,
  frame: FrameLocator,
  appKey: string,
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const booted = await frame
      .locator("body")
      .evaluate((_el, key) => Boolean((window as unknown as Record<string, unknown>)[key]), appKey)
      .catch(() => false);
    if (booted) return;
    if ((await frame.locator("#chatwise-beta-gate").count().catch(() => 0)) > 0) {
      throw new Error(
        `ChatWise beta gate BLOCKED this user — window.${appKey} will never appear. ` +
          "The harness account must be in BETA_SEED_ALLOWLIST (see beta-gate.spec.ts).",
      );
    }
    if (Date.now() > deadline) {
      throw new Error(
        `window.${appKey} never appeared within ${timeoutMs / 1000}s — the ChatWise bundle did not ` +
          "finish init(). The iframe may have mounted its static shell while the app crashed on boot; " +
          "check the console buffer in the evidence bundle.",
      );
    }
    await page.waitForTimeout(400);
  }
}

/**
 * Wait for the GLOBAL page's boot-time conversation selection to LAND.
 *
 * `window.chatWiseGlobal` appearing does NOT mean the surface has settled.
 * `init()` awaits `loadConversations()`, whose `conversations-loaded` handler
 * fires `selectConversation(conversations[0].id)` WITHOUT awaiting it
 * (GlobalPageApp.js:560-573) — and that call makes a `getConversation` round
 * trip before emitting `conversation-selected`. So the app is interactive with
 * a selection still in flight, and when it lands it overwrites whatever the
 * user did in the meantime (see new-chat-race.spec.ts — this is a real defect,
 * not a harness artefact).
 *
 * Every other scenario waits it out here so it tests its own subject instead of
 * that race. Returns the settled conversation id, or null when the account has
 * no conversations at all (nothing will ever be selected — not an error).
 */
export async function settleBootSelection(
  page: Page,
  frame: FrameLocator,
  timeoutMs = 20_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const id = await readAppState<string | null>(
      frame, GLOBAL_APP, "app.components.conversationManager?.getCurrentConversationId?.() || null",
    ).catch(() => null);
    if (id) {
      // The selection has landed; give its crossfade + render a beat to finish.
      await page.waitForTimeout(800);
      return id;
    }
    if (Date.now() > deadline) return null;
    await page.waitForTimeout(300);
  }
}

/**
 * Invoke a resolver route THROUGH THE APP'S OWN BRIDGE, from inside the chat
 * iframe, with the browser user's real Forge identity.
 *
 * NOTE on error shape: ForgeAPIService.call() catches a thrown invoke() and
 * flattens it to `{ success:false, error:{ message } }` (ForgeAPIService.js:41)
 * — it never rejects. So a refusal and a transport failure both arrive as a
 * resolved object, and a spec asserting "this must be refused" has to check the
 * payload, not expect a throw.
 */
export async function callResolver<T = Record<string, unknown>>(
  frame: FrameLocator,
  appKey: string,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  return frame.locator("body").evaluate(
    async (_el, a) => {
      const app = (window as unknown as Record<string, any>)[a.appKey];
      if (!app) throw new Error(`window.${a.appKey} is not present — the app has not booted`);
      const api = app.services?.forgeAPI;
      if (!api?.call) throw new Error(`window.${a.appKey}.services.forgeAPI.call is missing`);
      return await api.call(a.method, a.payload);
    },
    { appKey, method, payload },
  ) as Promise<T>;
}

/**
 * Read state off the booted app instance (job id, conversation id, live
 * pollers). `expr` is evaluated with `app` in scope, e.g. `"app.currentJobId"`
 * — a source string rather than a closure, because the function would be
 * serialised across the frame boundary and any captured variable would be lost.
 */
export async function readAppState<T = unknown>(
  frame: FrameLocator,
  appKey: string,
  expr: string,
): Promise<T> {
  return frame.locator("body").evaluate(
    (_el, a) => {
      const app = (window as unknown as Record<string, any>)[a.appKey];
      if (!app) throw new Error(`window.${a.appKey} is not present`);
      // eslint-disable-next-line no-new-func
      return new Function("app", `return (${a.expr});`)(app);
    },
    { appKey, expr },
  ) as Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Thread reading                                                       */
/* ------------------------------------------------------------------ */

/**
 * Snapshot the rendered thread. Role comes from the WRAPPER CLASS the renderer
 * chose (ChatInterface.createMessageElement: `message ${cssType}`), which is
 * precisely the mapping under test — never from where the text happens to sit.
 */
export async function readThread(frame: FrameLocator): Promise<RenderedMessage[]> {
  return frame.locator("body").evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("#chatMessages .message"));
    return nodes.map((el) => {
      const bubble = el.querySelector(".message-bubble");
      const cls = el.className || "";
      return {
        role: el.classList.contains("user")
          ? "user"
          : el.classList.contains("assistant")
            ? "assistant"
            : "unknown",
        className: cls,
        text: (bubble?.textContent || "").replace(/\s+/g, " ").trim(),
        hasTable: !!bubble?.querySelector("table"),
        hasCode: !!bubble?.querySelector("pre code"),
        meta: (el.querySelector(".message-meta")?.textContent || "").replace(/\s+/g, " ").trim(),
        streaming: el.classList.contains("composing"),
      };
    });
  }) as Promise<RenderedMessage[]>;
}

/** Poll the thread until `pred` is satisfied; throws with the thread dumped. */
export async function waitForThread(
  page: Page,
  frame: FrameLocator,
  pred: (t: RenderedMessage[]) => boolean,
  o: { timeout?: number; interval?: number; label: string },
): Promise<RenderedMessage[]> {
  const timeout = o.timeout ?? 180_000;
  const interval = o.interval ?? 1_500;
  const deadline = Date.now() + timeout;
  let last: RenderedMessage[] = [];
  for (;;) {
    last = await readThread(frame).catch(() => last);
    if (pred(last)) return last;
    if (Date.now() > deadline) {
      throw new Error(
        `timed out after ${Math.round(timeout / 1000)}s waiting for: ${o.label}\n` +
          `thread was:\n${describeThread(last)}`,
      );
    }
    await page.waitForTimeout(interval);
  }
}

export function describeThread(t: RenderedMessage[]): string {
  if (!t.length) return "  (empty)";
  return t
    .map(
      (m, i) =>
        `  [${i}] role=${m.role} class="${m.className}" table=${m.hasTable} code=${m.hasCode}` +
        (m.meta ? ` meta="${m.meta}"` : "") +
        `\n      text: ${m.text.slice(0, 220)}${m.text.length > 220 ? "…" : ""}`,
    )
    .join("\n");
}

/** The literal error bubble BaseApp/ChatMessageHandler post on a failed turn. */
export const ERROR_BUBBLE = /Sorry, I encountered an error/i;

export function errorBubbles(t: RenderedMessage[]): RenderedMessage[] {
  return t.filter((m) => ERROR_BUBBLE.test(m.text));
}

/* ------------------------------------------------------------------ */
/* Composer driving                                                     */
/* ------------------------------------------------------------------ */

/** Type into the composer and press Send. Waits for the user bubble to land. */
export async function sendMessage(page: Page, frame: FrameLocator, text: string): Promise<void> {
  const input = frame.locator("#chatInput");
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await input.click();
  await input.fill(text);
  await frame.locator("#sendButton").click();
  await waitForThread(page, frame, (t) => t.some((m) => m.role === "user" && m.text.includes(text)), {
    timeout: 20_000,
    interval: 300,
    label: `the user's own bubble for "${text}" to render`,
  });
}

/**
 * Arm a MutationObserver on the composer BEFORE sending, so a spec can assert
 * "the button entered its Stop role" without racing the turn.
 *
 * Polling for `.cancel-mode` after the send is unreliable in both directions:
 * `handleMessageSent` only calls `setStreaming(true)` after an await chain
 * (conversation persist → invoke round-trip), so an immediate check is too
 * early; and with scripted replies the whole turn can finish inside a few
 * seconds, so a slow poll is too late. Recording the transition removes the
 * race entirely.
 */
export async function armComposerWatch(frame: FrameLocator): Promise<void> {
  await frame.locator("body").evaluate(() => {
    const w = window as unknown as Record<string, any>;
    w.__cwWatch = { sawCancel: false, sawThinking: false, sawUnlock: false };
    const btn = document.getElementById("sendButton") as HTMLButtonElement | null;
    const think = document.getElementById("thinkingIndicator");
    const sample = () => {
      if (btn?.classList.contains("cancel-mode")) w.__cwWatch.sawCancel = true;
      else if (w.__cwWatch.sawCancel && !btn?.disabled) w.__cwWatch.sawUnlock = true;
      if (think?.classList.contains("active")) w.__cwWatch.sawThinking = true;
    };
    sample();
    const obs = new MutationObserver(sample);
    if (btn) obs.observe(btn, { attributes: true, attributeFilter: ["class", "disabled"] });
    if (think) obs.observe(think, { attributes: true, attributeFilter: ["class"] });
    w.__cwWatchObs = obs;
  });
}

export async function readComposerWatch(
  frame: FrameLocator,
): Promise<{ sawCancel: boolean; sawThinking: boolean; sawUnlock: boolean }> {
  return frame.locator("body").evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return w.__cwWatch || { sawCancel: false, sawThinking: false, sawUnlock: false };
  }) as Promise<{ sawCancel: boolean; sawThinking: boolean; sawUnlock: boolean }>;
}

export interface AutoStopResult {
  clicked: boolean;
  jobId: string | null;
  /** ms between the job id appearing and the Stop click. */
  latencyMs: number;
}

/**
 * Arm an IN-PAGE auto-Stop: the instant the app owns a job id, click the
 * composer's Stop control.
 *
 * Driving this from Playwright is a losing race. `cancelCurrentJob()` no-ops
 * when `currentJobId` is null, so the click cannot be sent before the `chat`
 * route answers — and a Forge-LLM turn on the default Haiku tier finishes in
 * ~5s (measured), which a poll + click round trip can miss entirely. When it
 * does, the job has already COMPLETED and "Stop" is back to being "Send": the
 * click tests nothing and the scenario fails for a reason that is not a defect.
 * Clicking from inside the page collapses that to a few tens of milliseconds.
 */
export async function armAutoStop(frame: FrameLocator, appKey: string): Promise<void> {
  await frame.locator("body").evaluate((_el, key) => {
    const w = window as unknown as Record<string, any>;
    w.__cwStop = { clicked: false, jobId: null, latencyMs: -1 };
    const armedAt = Date.now();
    const tick = () => {
      const app = w[key];
      const jobId = app?.currentJobId ?? null;
      if (!jobId) return;
      clearInterval(w.__cwStopTimer);
      w.__cwStop.jobId = jobId;
      w.__cwStop.latencyMs = Date.now() - armedAt;
      (document.getElementById("sendButton") as HTMLButtonElement | null)?.click();
      w.__cwStop.clicked = true;
    };
    w.__cwStopTimer = setInterval(tick, 25);
  }, appKey);
}

export async function readAutoStop(frame: FrameLocator): Promise<AutoStopResult> {
  return frame.locator("body").evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return w.__cwStop || { clicked: false, jobId: null, latencyMs: -1 };
  }) as Promise<AutoStopResult>;
}

/** Send-button state machine (ChatInterface.setSendButtonState). */
export async function composerState(frame: FrameLocator): Promise<{
  cancelMode: boolean;
  disabled: boolean;
  label: string;
  thinking: boolean;
}> {
  return frame.locator("body").evaluate(() => {
    const btn = document.getElementById("sendButton") as HTMLButtonElement | null;
    const thinking = document.getElementById("thinkingIndicator");
    return {
      cancelMode: !!btn?.classList.contains("cancel-mode"),
      disabled: !!btn?.disabled,
      label: (btn?.textContent || "").trim(),
      thinking: !!thinking?.classList.contains("active"),
    };
  }) as Promise<{ cancelMode: boolean; disabled: boolean; label: string; thinking: boolean }>;
}

/* ------------------------------------------------------------------ */
/* Noise watching (console + failed invokes)                            */
/* ------------------------------------------------------------------ */

/**
 * Console/network noise that is NOT the app's fault, so a behavioural spec
 * doesn't fail on Atlassian's own host page. Kept deliberately tight and
 * commented — an over-broad ignore list is how a "captures console errors"
 * assertion quietly stops catching anything.
 */
const IGNORED_CONSOLE = [
  /Failed to load resource/i,          // host-page assets 4xx'ing outside the app
  /third-party cookie/i,               // Chrome deprecation notice on the CDN iframe
  /\[Report Only\]/i,                  // Atlassian's CSP report-only violations
  /Content Security Policy/i,          // ditto (host page)
  /ResizeObserver loop/i,              // benign browser warning
  // Atlassian's own feature-flag client on the Jira issue view. It cannot be
  // ChatWise: the app declares no `external.fetch` egress at all (manifest.yml),
  // so it has no way to talk to LaunchDarkly. Seen on every /browse/<KEY> load,
  // with or without the panel expanded.
  /LaunchDarkly/i,
  /favicon/i,
  /Tracking Prevention/i,
  /downloadable font/i,
];

/** Host-page endpoints that routinely 4xx/5xx on wolfaenpak and are not ours. */
const IGNORED_REQUESTS = [
  /\/gateway\/api\/(graphql|tap|xflow|watermelon)/i,
  /analytics|metal|measure|sentry|statsig|split\.io/i,
  /\/rest\/internal\//i,
  /\/rest\/webResources\//i,
  /notificationLogHead|notifications\/latest/i,
];

export interface Noise {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  /** Everything, unfiltered — attached to the report when an assertion fails. */
  all: string[];
  reset(): void;
  report(): string;
}

/**
 * Start collecting console errors, uncaught page errors and failed network
 * calls for the whole page (Playwright's page-level listeners fire for every
 * frame, including the cross-origin Forge iframe).
 */
export function watchNoise(page: Page): Noise {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const all: string[] = [];

  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    all.push(`console.error: ${text}`);
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (e: Error) => {
    const text = String(e?.message ?? e);
    all.push(`pageerror: ${text}`);
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    pageErrors.push(text);
  });
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const url = r.url();
    all.push(`HTTP ${r.status()} ${url}`);
    if (IGNORED_REQUESTS.some((re) => re.test(url))) return;
    // Only calls the APP makes: the Forge bridge invoke gateway + the app's CDN.
    if (!/\/invoke|gateway\/api\/app|cdn\.prod\.atlassian-dev\.net/i.test(url)) return;
    failedRequests.push(`HTTP ${r.status()} ${r.request().method()} ${url}`);
  });

  return {
    consoleErrors,
    pageErrors,
    failedRequests,
    all,
    reset() {
      consoleErrors.length = 0;
      pageErrors.length = 0;
      failedRequests.length = 0;
      all.length = 0;
    },
    report() {
      const bad = [
        ...pageErrors.map((e) => `UNCAUGHT: ${e}`),
        ...consoleErrors.map((e) => `console.error: ${e}`),
        ...failedRequests,
      ];
      return bad.length ? bad.join("\n") : "";
    },
  };
}

/* ------------------------------------------------------------------ */
/* Test mode                                                            */
/* ------------------------------------------------------------------ */

/**
 * Flip the SITE-WIDE scripted-reply mode (KVS `chatwise-test-mode`, read by
 * the async consumer at asyncConsumer.js:266). ALWAYS pair an enable with a
 * `finally` that disables — wolfaenpak is shared and a stuck test mode would
 * silently replace every real answer with a fixture.
 */
export async function setTestMode(frame: FrameLocator, appKey: string, enabled: boolean): Promise<void> {
  const r = await callResolver<{ success?: boolean; enabled?: boolean; error?: unknown }>(
    frame, appKey, "setTestMode", { enabled },
  );
  if (!r?.success || r.enabled !== enabled) {
    throw new Error(`setTestMode(${enabled}) was refused or did not take: ${JSON.stringify(r)}`);
  }
}

/**
 * Best-effort disable that survives a failed/aborted test: re-enters the page
 * from scratch if the frame handle is already dead. Never throws.
 */
export async function forceTestModeOff(page: Page, T: Target): Promise<string> {
  try {
    const frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP, 60_000);
    await setTestMode(frame, GLOBAL_APP, false);
    const check = await callResolver<{ enabled?: boolean }>(frame, GLOBAL_APP, "getTestMode");
    return check?.enabled === false ? "test mode OFF (verified)" : `UNVERIFIED: ${JSON.stringify(check)}`;
  } catch (e) {
    return `FAILED to disable test mode: ${(e as Error)?.message}`;
  }
}

/**
 * The scripted fixture the test-mode library returns for a JQL-flavoured
 * prompt (testMode.js TEMPLATES[1], selected by the `jql|search|table|query`
 * trigger). Every marker below is a distinct renderer:
 *   - TABLE_CELL only exists if the GFM table renderer ran,
 *   - CODE only exists if the fenced-code renderer ran,
 * and neither can appear in a USER bubble, which is rendered with
 * `bubble.textContent = content` and no markdown at all.
 */
export const SCRIPTED = {
  prompt: "Give me a JQL query for the current sprint",
  lead: "Here's a JQL query that matches what you asked for",
  tableCell: "Token refresh races on tab switch",
  // Kept in step with src/shared/forge-llm/testMode.js — the fixture keys were
  // neutralised (WFH -> DEMO) so no tenant's project key ships in the product.
  code: "project = DEMO AND status != Done",
  /** `_shortenModel("test-mode/scripted-fixtures-v1")` → the meta chip label. */
  modelChip: "scripted-fixtures-v1",
};

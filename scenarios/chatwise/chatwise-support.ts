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
import { test } from "@playwright/test";
import type { Page, FrameLocator } from "@playwright/test";
import type { Target } from "../../config/targets";
import type { Recorder } from "../../capture/recorder";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";
import { openIssuePanel } from "../../forge/host";
import { get, del } from "../../data/jira.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import nodeOs from "node:os";
import nodePath from "node:path";

const execFileAsync = promisify(execFile);

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

/**
 * HARD reload of the issue-panel surface, then re-enter ChatWise's frame.
 *
 * `openPanel()` again is NOT a reliable reload: it `goto`s the same
 * `/browse/<KEY>` URL, and Jira is an SPA — the navigation is sometimes
 * swallowed, leaving the iframe (and all its in-memory state) alive. A
 * persistence assertion made on a surface that never reloaded is vacuous, and
 * that is precisely the "passes while the feature is broken" trap. Verified:
 * driving persona-switch through `openPanel()` twice went green on a run where
 * a genuine reload showed the persona reverting.
 *
 * So: stamp the live JS context, force a browser reload, and PROVE the stamp is
 * gone before the caller asserts anything.
 */
export async function reloadPanel(
  page: Page, T: Target, recorder?: Recorder,
): Promise<FrameLocator> {
  await frameStamp(await currentPanelFrame(page, T));
  await page.reload({ waitUntil: "domcontentloaded" });

  // The glance may come back collapsed — same expansion the host helper does.
  const toggle = page.getByRole("button", { name: new RegExp(PANEL_TITLE, "i") }).first();
  if ((await toggle.count().catch(() => 0)) > 0) {
    const expanded = await toggle.getAttribute("aria-expanded").catch(() => null);
    if (expanded === "false") await toggle.click().catch(() => {});
  }
  await page
    .locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]')
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });

  if (recorder) recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  if (surface.kind !== "custom") throw new Error("ChatWise issue panel must be a Custom-UI iframe surface");
  recorder?.attachSurface(surface);

  const stale = await surface.frame
    .locator("body")
    .evaluate(() => Boolean((window as unknown as Record<string, unknown>).__cwEpoch))
    .catch(() => false);
  if (stale) {
    throw new Error(
      "the surface did NOT actually reload — the pre-reload stamp survived, so the iframe's JS context is the " +
        "same one. Any 'survives a reload' assertion made here would be vacuous.",
    );
  }
  return surface.frame;
}

async function currentPanelFrame(page: Page, T: Target): Promise<FrameLocator> {
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  if (surface.kind !== "custom") throw new Error("expected a Custom-UI iframe surface");
  return surface.frame;
}

async function frameStamp(frame: FrameLocator): Promise<void> {
  await frame.locator("body").evaluate(() => {
    (window as unknown as Record<string, unknown>).__cwEpoch = true;
  });
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

/**
 * THE MODEL NEVER ANSWERED — say so, do not assert on the silence.
 *
 * The tenant's Forge LLM quota is 50,000 tokens PER MODEL. A long session
 * exhausts a tier, the ladder walks to the next, and when every tier is blocked
 * the agent returns a calm wait bubble instead of a reply. That is the app
 * behaving correctly.
 *
 * A spec that then asserts on the outcome measures nothing — and the more
 * alarming the assertion, the worse the lie. `tool-surface` reported
 * "the user DID confirm on a second turn and the issue survived — the gate is
 * not merely strict, it is broken", a P0-shaped security claim, when the truth
 * was that no model ran, `deleteIssue` was never called, and the issue survived
 * because NOTHING HAPPENED. The logs said so plainly:
 *
 *   [ForgeLLM] claude-sonnet-5 token quota exhausted — trying the next tier
 *   [ForgeLLM] claude-opus-5 token quota exhausted — trying the next tier
 *   [ForgeLLM] claude-haiku-4-5-20251001 token quota exhausted — trying the next tier
 *   [Agent] all models quota-blocked — returning a friendly wait
 *
 * That failure was investigated twice as a broken consent gate. It is the
 * swallowed-click defect wearing a different costume: an environmental silence
 * asserted as a product fault.
 *
 * Two specs had grown their own private copy of this regex and the specs that
 * most needed it had none. One home now.
 */
export const QUOTA_BUBBLE = /token allowance|Nothing was lost|quota-blocked/i;

/**
 * Skip THIS TEST when the reply is the quota wait bubble.
 *
 * Skip, never pass: a green result here would claim the behaviour was verified.
 * The message names the spec so a skipped run is legible in a batch summary.
 */
export function skipIfQuotaBlocked(reply: string, where: string): void {
  if (!QUOTA_BUBBLE.test(String(reply || ""))) return;
  test.skip(
    true,
    `${where}: every model tier is quota-blocked on this tenant, so no model ran and ` +
      `there is no behaviour to assert. NOT a product failure — re-run when the ` +
      `allowance resets.`,
  );
}

/**
 * DELETE THE FIXTURES AND SAY WHAT SURVIVED.
 *
 * Every spec's `finally` did `del(...).catch(() => {})`, which throws away the
 * one fact worth keeping. `agile-end-to-end` seeds into COGTEST — the only
 * project with a scrum board, so not its choice — where the harness account
 * cannot delete: `DELETE /rest/api/3/issue/COGTEST-2690` answers 403. Every run
 * stranded two issues and reported nothing, and a later run found the strays
 * and had to work out whose they were.
 *
 * The other specs seed where delete works, so they do not leak TODAY. They
 * swallow the failure just as completely, so the day a permission changes they
 * will leak in exactly the same silence. A cleanup that cannot succeed is
 * acceptable; one that cannot ADMIT failure is not.
 *
 * Verifies rather than trusts: a swallowed rejection and a silent no-op are
 * indistinguishable from the call site, and both have happened here.
 *
 * @returns the keys that are still present, already reported to the console.
 */
export async function deleteFixtures(keys: (string | null | undefined)[], where = ""): Promise<string[]> {
  const wanted = keys.filter(Boolean) as string[];
  const stranded: string[] = [];
  for (const k of wanted) {
    await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).catch(() => {});
    const still = await get(`/rest/api/3/issue/${k}?fields=summary`).catch(() => null);
    if (still) stranded.push(k);
  }
  if (stranded.length) {
    console.warn(
      `[cleanup] COULD NOT DELETE ${stranded.length} fixture(s)${where ? ` in ${where}` : ""}: ` +
        `${stranded.join(", ")}. They are still in Jira. A later run reporting strays should look ` +
        `here first rather than hunting for a leak elsewhere.`,
    );
  }
  return stranded;
}

/**
 * PUT THE TEXT IN AND PROVE IT WENT IN. Use this instead of fill+click.
 *
 * A 900-second "no assistant reply" was investigated as a product hang for two
 * runs. It was not one: the click never entered the ChatWise iframe at all. A
 * capture-phase listener on #sendButton and a bubble listener on document both
 * counted ZERO, while Playwright reported the click delivered in 0.0s with no
 * error — the app was healthy, the button live and enabled, the text sitting in
 * the composer, and calling `chat.sendMessage()` directly worked on the spot.
 * The host page had 24 leftover `.atlaskit-portal` nodes from the admin journey
 * that runs immediately before it in alphabetical order, and something in that
 * host-side wreckage swallows the event. It clears by itself: the next two
 * attempts in the same window delivered and passed.
 *
 * SIX journey specs hand-rolled `fill(); click(); poll(assistant count)` and not
 * one of them checked that the USER'S OWN bubble had landed. So a swallowed
 * click burns the whole timeout — up to fifteen minutes — and then reports
 * "no assistant reply", which reads exactly like the app hanging. The backend
 * had never been asked for anything; the conversation was deleted with 0 message
 * rows.
 *
 * The user's bubble is rendered synchronously by the composer, with no model
 * and no network in the way, so it is the cheapest possible proof that input was
 * delivered. It separates "the app did not answer" — a real defect — from "the
 * app was never asked", and it does it in seconds instead of a quarter of an
 * hour. One retry, because the fault is transient by observation.
 */
export async function deliverMessage(
  page: Page,
  frame: FrameLocator,
  text: string,
  label = "",
): Promise<void> {
  const seen = async () =>
    (await readThread(frame)).some((m) => m.role === "user" && m.text.includes(text));

  for (let attempt = 1; attempt <= 2; attempt++) {
    await frame.locator("#chatInput").fill(text);
    await frame.locator("#sendButton").click();
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (await seen()) return;
      await page.waitForTimeout(300);
    }
    if (attempt === 1) {
      // Not a product failure and not worth failing the run over: reset the
      // host page's focus and event path, then try once more.
      console.log(`[deliver] the click did not reach the iframe${label ? ` (${label})` : ""} — retrying once`);
      await page.mouse.click(2, 2).catch(() => {});
      await frame.locator("#chatInput").click().catch(() => {});
    }
  }

  throw new Error(
    `INPUT WAS NEVER DELIVERED${label ? ` (${label})` : ""}: the user's own bubble for ` +
      `"${text.slice(0, 60)}…" did not render within 15s across two attempts. The composer ` +
      `renders it synchronously, so this is the HARNESS failing to deliver a click — not the ` +
      `app failing to answer. Do NOT read this as a product hang; check for leftover host-page ` +
      `overlays from the previously-run spec.`,
  );
}

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
/**
 * Wait for the conversation-swap crossfade to settle.
 *
 * A switch (or New chat) paints a 320ms GHOST CLONE of the departing thread
 * over the new one. The app now strips the clone's ids and marks it inert, so
 * selector collisions are gone — but anything asserted mid-fade is asserted
 * against a half-swapped screen. Journeys call this after every switch, the
 * same way a user's eye waits for the fade.
 */
export async function awaitSwapSettled(frame: FrameLocator, timeoutMs = 5_000): Promise<void> {
  await frame
    .locator(".cw-fade-ghost")
    .first()
    .waitFor({ state: "detached", timeout: timeoutMs })
    .catch(() => {}); // no ghost at all (first render) is the common case
}

/* ------------------------------------------------------------------ */
/* The backend's own log window                                        */
/* ------------------------------------------------------------------ */

/**
 * READ THE APP'S LOGS FROM A SPEC — three traps, all of them measured.
 *
 * 1. **`forge logs` TRUNCATES SILENTLY.** It caps output at roughly 30 lines
 *    REGARDLESS of `--since`, and says nothing about having cut anything. So a
 *    grep over the default output reports "not found" for a line that IS in the
 *    log, and the investigation reasonably concludes the backend never ran.
 *    That cost two live runs on a 900-second stall. `-n 2000`, always.
 *
 * 2. **IT LAGS BY MINUTES.** Measured 5 Sep 2026 on wolfaenpak: a line written
 *    at 17:33:05 was still absent from `--since 20m` at 17:35:50 and present by
 *    17:39. A spec that reads once, or polls for two minutes, reports an empty
 *    window — which is indistinguishable from "no request was ever made", and
 *    that is exactly how an environmental silence becomes a false P0.
 *    `logWindow()` polls to a deadline for a line the caller names.
 *
 * 3. **PLAYWRIGHT SETS `FORCE_COLOR` ON CHILD PROCESSES**, so `forge logs`
 *    emits ANSI colour codes into a pipe it would never colour from a shell.
 *    The level token arrives wrapped in escape sequences, no line matches a
 *    plain-text parser, and the spec finds ZERO lines while the identical
 *    command in a terminal prints 38. Measured: 7,179 bytes through `execFile`
 *    against 6,744 through a shell redirect, the difference being 435 bytes of
 *    escapes. Stripped here AND suppressed through the child env, because
 *    either alone is one library upgrade away from the same silence.
 *
 * ONE HOME: two specs needed this within an hour of each other, and a second
 * copy would have been the third place in this repo to re-derive a truncation
 * rule that has already cost days.
 */
export interface LogLine {
  /** epoch ms, parsed from the line's own ISO timestamp. */
  at: number;
  /** The message, with the level, timestamp and invocation id stripped. */
  text: string;
}

/** CSI colour sequences, built from a code point so no raw ESC is in the source. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const LOG_LINE = /^(?:INFO|WARN|ERROR|DEBUG)\s+(\S+Z)\s+\S+\s+(.*)$/;

/** Where `forge logs` has to be run from: the app repo. */
export const APP_REPO =
  process.env.CHATWISE_REPO || nodePath.join(nodeOs.homedir(), "Projects/ChatWise");

export async function readForgeLogs(sinceMinutes = 30): Promise<LogLine[]> {
  const { stdout } = await execFileAsync(
    "npx",
    ["forge", "logs", "--environment", "development", "--since", `${sinceMinutes}m`, "-n", "2000"],
    {
      cwd: APP_REPO,
      timeout: 180_000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    },
  ).catch((e) => ({ stdout: String((e as { stdout?: string })?.stdout || "") }));
  const out: LogLine[] = [];
  for (const raw of String(stdout).replace(ANSI, "").split("\n")) {
    const m = raw.match(LOG_LINE);
    if (!m) continue;
    const at = Date.parse(m[1]);
    if (Number.isFinite(at)) out.push({ at, text: m[2] });
  }
  return out;
}

/**
 * Poll the log window until `pred` is satisfied, then return every parsed line.
 * On timeout it returns what it has AND says so — a caller must be able to tell
 * "the line is not there" from "the log has not caught up", and both of those
 * from "the parser matched nothing", which is why the counts are printed.
 */
export async function logWindow(
  page: Page,
  pred: (lines: LogLine[]) => boolean,
  o: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<LogLine[]> {
  const timeoutMs = o.timeoutMs ?? 600_000;
  const intervalMs = o.intervalMs ?? 20_000;
  const deadline = Date.now() + timeoutMs;
  let lines: LogLine[] = [];
  for (;;) {
    lines = await readForgeLogs();
    if (pred(lines)) return lines;
    if (Date.now() > deadline) {
      console.warn(
        `[logs] gave up after ${Math.round(timeoutMs / 1000)}s waiting for ` +
          `${o.label || "the expected line"} — ${lines.length} line(s) parsed in the window. ` +
          `Zero parsed with a non-empty log means the PARSER missed, not the app.`,
      );
      return lines;
    }
    await page.waitForTimeout(intervalMs);
  }
}

/* ------------------------------------------------------------------------ *
 * THE SETTINGS PAGE'S DUPLICATE BUTTON LABELS — ONE HELPER, THREE SPECS.
 *
 * "Save key", "Test key" and "Remove key" are on the WEB SEARCH card AND on the
 * ORGANISATION ADMIN KEY card. "Yes, remove it" is the confirm on all three
 * credential cards. So a page-wide `getByRole("button", { name })` is a strict
 * mode violation, and `.first()` — the thing a harness reaches for to silence
 * that — is worse than the error it hides: it depends on which card painted
 * first.
 *
 * THIS COLLISION HAS COST THREE SPECS, TWICE EACH:
 *   admin-credentials-settings   pressed the WEB SEARCH card's Save while the
 *                                organisation fields sat filled and unsaved,
 *                                and reported "the card does not show the key
 *                                as stored" — a green-looking product bug.
 *   admin-credentials-support    clicked a confirm that shared the opener's
 *                                label before the dialog existed, so the click
 *                                landed back on the opener, nothing threw, and
 *                                a REAL site-administrator token was left
 *                                stored on a shared tenant.
 *   websearch-settings-card      went red with `resolved to 2 elements` the day
 *                                the organisation card shipped — a spec that
 *                                was correct when it was written and had no way
 *                                to know a second card would take its label.
 *
 * ANCHORED ON THE HEADING, not on a field: a card is the thing that has that
 * heading, and the ledger card has buttons and no fields at all.
 * ------------------------------------------------------------------------ */

/**
 * Every settings-page card heading this helper knows about.
 *
 * It exists ONLY to catch the walk-too-far case below, and it is a list rather
 * than a lookup because the check is "did I climb past my own card into a
 * container that holds somebody else's heading too". A heading missing from
 * here weakens that check and breaks nothing else, which is why it may be a
 * hand-kept list — but keep it in step with `credentialCopy.js`.
 */
export const SETTINGS_CARD_HEADINGS = [
  "Web search",
  "Jira site admin token",
  "Atlassian organisation admin key",
  "Recent changes made with stored credentials",
];

/**
 * A button that belongs to ONE named card.
 *
 * Resolves the nearest ancestor of the card's heading that also contains a
 * button with `label`, then the button inside it. `assertCardButton` is the
 * checked version and is what specs should call: the bare locator cannot tell
 * you that the walk climbed past the card into a shared parent, and a silent
 * wrong-card click is the whole failure this replaces.
 */
export function cardButton(root: Page | FrameLocator, cardHeading: string, label: string) {
  const q = (v: string) => v.replace(/"/g, '\\"');
  return root.locator(
    `xpath=//*[normalize-space(text())="${q(cardHeading)}"]` +
      `/ancestor::*[.//button[normalize-space(.)="${q(label)}"]][1]` +
      `//button[normalize-space(.)="${q(label)}"]`,
  );
}

/**
 * The same button, having PROVED it is the right card's.
 *
 * Two ways this can be wrong and both are checked:
 *   - the card has no such button, so the ancestor walk climbed until it found
 *     somebody else's. Detected by the resolved container carrying a SECOND
 *     known card heading.
 *   - the walk found more than one matching button.
 * Either way it throws with the card and the label named, because "the click
 * did nothing" is the symptom this exists to stop being the first thing anybody
 * sees.
 */
export async function assertCardButton(
  root: Page | FrameLocator,
  cardHeading: string,
  label: string,
  timeoutMs = 20_000,
) {
  const button = cardButton(root, cardHeading, label);
  await button.first().waitFor({ state: "visible", timeout: timeoutMs });

  // DID THE WALK STAY INSIDE THE CARD? Checked FIRST, because it is the CAUSE
  // and the count below is only a symptom of it: a card with no button of its
  // own sends the walk up to a parent that holds the next card too, and that
  // parent naturally holds two matching buttons. Reporting "resolved to 2
  // buttons inside this card" would send somebody looking for a duplicate
  // control that does not exist.
  const strays: string[] = await button.first().evaluate((el: Element, headings: string[]) => {
    let box: Element | null = el;
    while (box?.parentElement) {
      box = box.parentElement;
      const text = (box as HTMLElement).innerText || "";
      const found = headings.filter((h) => text.includes(h));
      if (found.length) return found;
    }
    return [];
  }, SETTINGS_CARD_HEADINGS);

  if (strays.length > 1 || (strays.length === 1 && strays[0] !== cardHeading)) {
    throw new Error(
      `the "${label}" button found for "${cardHeading}" sits in a container that holds ` +
        `${strays.map((h) => `"${h}"`).join(", ")}. The ancestor walk climbed PAST the card, ` +
        `which means this card has no "${label}" of its own — so a click here would have landed ` +
        `on another card's, silently.`,
    );
  }

  const count = await button.count();
  if (count !== 1) {
    throw new Error(
      `"${label}" resolved to ${count} buttons inside the "${cardHeading}" card. One card should ` +
        `own one control with a given label; if that is genuinely no longer true, the anchor has ` +
        `to become finer than the heading.`,
    );
  }
  return button.first();
}

/* ------------------------------------------------------------------------ *
 * SCORING ONE TOOL'S OUTCOME FROM THE APP'S OWN LOG.
 *
 * Extracted from admin-persona-gates so the three states can be proven by a
 * fixture instead of by a live run. THE `crash` STATE IS THE POINT: on 13.7.0
 * `getAuditRecords` threw
 *   [Tools] Error in getAuditRecords(recent): Error: You must create your route
 *   using the 'route' export from '@forge/api'.
 * before any request left the app. That line carries no HTTP status and no
 * " failed:", so a scorer that only knows "failed" and "not failed" found
 * neither, fell through to "it was called at all" and recorded **200** for a
 * tool that has never once answered. A table that scores a crash as a success
 * is worse than no table.
 * ------------------------------------------------------------------------ */

export type ToolOutcome = {
  /**
   * `"200"` · `"crash"` · `"withheld"` · an HTTP status · `"error"` ·
   * `"not-called"`. Five distinct answers to "what happened", and every one of
   * them has been mistaken for one of the others at least once.
   */
  status: string;
  called: boolean;
  /** Failures from a SUB-request the handler absorbed, e.g. an optional draft. */
  subRequestFailures: number;
  evidence: string;
};

export function scoreToolOutcome(tool: string, lines: string[]): ToolOutcome {
  // STRING PREDICATES, NOT CONSTRUCTED REGEXES. Every earlier version of this
  // built patterns out of template literals, and the escaping is a trap: a
  // `\[` inside a template literal is just `[`, so `new RegExp("^\[Tools\] …")`
  // silently becomes a character class and an unterminated group. The shapes
  // being matched are fixed prefixes, so there is nothing a regex buys here.
  const PREFIX = "[Tools] ";
  const ERROR_PREFIX = `${PREFIX}Error in ${tool}`;

  /** The text after `[Tools] <tool>`, or null when the line is another tool's. */
  const tail = (line: string): string | null => {
    if (!line.startsWith(PREFIX + tool)) return null;
    const rest = line.slice(PREFIX.length + tool.length);
    // A word boundary, so `getOrgUser` never matches `getOrgUserAccess`.
    if (rest !== "" && !" (:".includes(rest[0])) return null;
    return rest;
  };

  // WITHHELD IS NOT CALLED. `executor.js` prints the refusal on the same
  // `[Tools] <name>` prefix, so a prefix match counts a closed gate as a call —
  // the opposite of what every closed-gate assertion is asking.
  const reached = lines.filter((t) => tail(t) !== null && !t.includes("is withheld this turn"));
  const withheld = lines.filter((t) => tail(t) !== null && t.includes("is withheld this turn"));
  // REACHED FOR IS NOT RUN. `executor.js` logs the invocation and THEN the
  // refusal, on the same prefix, so a closed gate leaves both lines behind. The
  // question every closed-gate assertion asks is "did it run", and the answer
  // is no — `withheld` is its own state so that "the model tried and was
  // stopped" is never confused with "the model never tried" or with a 200.
  const called = withheld.length ? [] : reached;
  const threw = lines.filter((t) => t.startsWith(ERROR_PREFIX));

  // A SUB-REQUEST'S FAILURE IS NOT THE TOOL'S STATUS. `getWorkflowScheme` asks
  // for an optional draft and prints `… draft failed: 404` one line above its
  // own successful outcome; `getFieldContexts` does the same with `options
  // failed: 400` for a numeric field. A naive "contains failed:" match recorded
  // both as dead reads that the model then reported correctly.
  const failed = lines.filter(
    (t) => t.startsWith(PREFIX) && t.includes(tool) && t.includes(" failed:"),
  );
  /** `<tool> failed:` or `<tool>(…) failed:` — the WHOLE tool, not a part of it. */
  const wholeToolFailed = failed.filter((t) => {
    const rest = tail(t);
    if (rest === null) return false;
    const afterParens = rest.startsWith("(") ? rest.slice(rest.indexOf(")") + 1) : rest;
    return afterParens.startsWith(" failed:");
  });
  /** `<tool>(…): …` or `<tool>: …` with no failure — the tool's own answer. */
  const outcome = lines.filter((t) => {
    if (t.startsWith(ERROR_PREFIX) || t.includes(" failed:")) return false;
    const rest = tail(t);
    if (rest === null) return false;
    const afterParens = rest.startsWith("(") ? rest.slice(rest.indexOf(")") + 1) : rest;
    return afterParens.startsWith(":");
  });

  const statusIn = (line: string) => (line.match(/failed:\s*(\d{3})/) || [])[1] || "error";

  const status = withheld.length
    ? "withheld"
    : threw.length
    ? "crash"
    : outcome.length
      ? "200"
      : wholeToolFailed.length
        ? statusIn(wholeToolFailed[0])
        : failed.length
          ? statusIn(failed[0])
          : called.length
            ? "200"
            : "not-called";

  return {
    status,
    called: called.length > 0,
    subRequestFailures: failed.length - wholeToolFailed.length,
    evidence: (withheld[0] || threw[0] || outcome[0] || wholeToolFailed[0] || failed[0] || reached[0] || "").slice(0, 220),
  };
}

/** Render a log slice for an assertion message. */
export function describeLogs(lines: LogLine[]): string {
  return lines.map((l) => `${new Date(l.at).toISOString()} ${l.text}`).join("\n") || "(nothing)";
}

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

/**
 * THE PERSONA PICKER GATES A NEW CONVERSATION (ChatWise v6.191.0, 22 Sep 2026).
 * A fresh chat shows the picker in the welcome area and disables the composer
 * until a persona card is clicked. Journeys that click #newChatButton call
 * this next; it is a no-op when the composer is already open (an existing
 * conversation, or a surface without the picker).
 */
export async function pickPersonaIfGated(frame: FrameLocator, personaId?: string): Promise<void> {
  const input = frame.locator("#chatInput");
  const gated = await input.evaluate((el) => (el as HTMLTextAreaElement).disabled).catch(() => false);
  if (!gated) return;
  const card = personaId
    ? frame.locator(`.persona-card[data-persona-id="${personaId}"]`)
    : frame.locator(".persona-card").first();
  await card.click();
  await input.evaluate((el) => new Promise<void>((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (!(el as HTMLTextAreaElement).disabled) return resolve();
      if (Date.now() - t0 > 10000) return reject(new Error("composer stayed gated after picking a persona"));
      setTimeout(tick, 50);
    };
    tick();
  }));
}

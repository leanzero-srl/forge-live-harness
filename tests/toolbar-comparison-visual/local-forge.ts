// The harness test fixture.
//
// ONE BROWSER SESSION FOR THE WHOLE RUN.
//
// This used to launch a fresh persistent Chrome PER TEST — ~25 tests meant the
// same window opening, navigating to the same page, booting the same app and
// closing, over and over, for most of a 17-minute run. The profile lock also
// forces workers=1, so every one of those launches was pure serial overhead.
// The persistent profile already shared auth/cookies/localStorage between
// tests, so per-test contexts bought no isolation — only churn.
//
// Now the context is WORKER-scoped: launched once, reused by every test,
// closed at worker teardown. Isolation stays where it always really was — each
// test navigates fresh (page.goto re-boots the app iframe) and uses its own
// conversation ids.
//
// Per-test evidence is preserved through trace CHUNKS (tracing.start once,
// startChunk/stopChunk per test) and the Recorder's own screenshots.
//
// HARNESS_VIDEO=1 restores the old per-test context WITH video recording for
// debugging a specific spec — video is context-scoped in Playwright, so it
// cannot be had without a dedicated context. Slow on purpose; not the default.
import { test as base, expect } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";
import path from "node:path";
import {createCloseJournal,closePhase} from "../../forge/close-diagnostics.mjs";
import { launchHarnessContext } from "./local-launch";
import { Recorder, RecorderStepError } from "../../capture/recorder";
import { writeEvidenceBundle } from "../../capture/evidence";

const closeFile = process.env.LZ_BROWSER_CLOSE_RECEIPT;
if (closeFile && (process.env.LZ_TOOLBAR_VISUAL_PHASE !== 'readonly' || !path.isAbsolute(closeFile))) throw new Error('Explicit toolbar witness close receipt required');
const WANT_VIDEO = process.env.HARNESS_VIDEO === "1";

interface Fixtures {
  recorder: Recorder;
}
interface WorkerFixtures {
  sharedContext: BrowserContext;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  sharedContext: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      if (WANT_VIDEO) {
        // Video mode uses a per-test context on the SAME persistent profile —
        // launching the shared one too would hold the profile lock and every
        // per-test launch would die with "profile is already in use".
        await use(null as unknown as BrowserContext);
        return;
      }
      const diagnostic = closeFile ? createCloseJournal(closeFile) : null;
      const context = await launchHarnessContext(diagnostic ? {observeClose: diagnostic.observe} : {});
      await context.tracing
        .start({ screenshots: true, snapshots: true, sources: true })
        .catch(() => {});
      // Kill the stale-bundle trap ONCE, globally: the persistent profile
      // happily serves a cached app bundle after a redeploy, and the giveaway
      // is an implausibly fast run reporting the PREVIOUS failure. Several
      // specs used to do this individually; now none has to remember.
      const page = context.pages()[0] ?? (await context.newPage());
      const cdp = await context.newCDPSession(page).catch(() => null);
      await cdp?.send("Network.setCacheDisabled", { cacheDisabled: true }).catch(() => {});
      await use(context);
      if (!diagnostic) await context.close();
      else {
        const errors: unknown[] = [];
        try { await closePhase(diagnostic.observe, 'fixture-context-close', () => context.close()); } catch (error) { errors.push(error); }
        try { diagnostic.check(); } catch (error) { errors.push(error); }
        if (errors.length === 1) throw errors[0];
        if (errors.length) throw new AggregateError(errors, 'Browser close and evidence recording failed');
      }
    },
    { scope: "worker" },
  ],

  context: async ({ sharedContext }, use, testInfo) => {
    if (WANT_VIDEO) {
      // Legacy per-test context, only when explicitly asked for.
      const videoDir = path.join(testInfo.outputDir, "video");
      const context = await launchHarnessContext({ recordVideoDir: videoDir });
      await context.tracing
        .start({ screenshots: true, snapshots: true, sources: true })
        .catch(() => {});
      await context.tracing.startChunk({ title: testInfo.title }).catch(() => {});
      await use(context);
      await context.close(); // flushes the webm
      return;
    }
    await sharedContext.tracing.startChunk({ title: testInfo.title }).catch(() => {});
    await use(sharedContext);
    // Evidence (when the test used the recorder) stops the chunk into its
    // bundle first; this fallback catches recorder-less tests. A second stop
    // throws and is swallowed — never both paths, always at least one.
    await sharedContext.tracing
      .stopChunk({ path: path.join(testInfo.outputDir, "trace.zip") })
      .catch(() => {});
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
    // LISTENER HYGIENE. The page is shared by the whole run now, so a spec's
    // `page.on("request"|"console"|...)` watchers would outlive it — leaking
    // memory and, worse, feeding one spec's traffic into another's noise
    // assertions. Sweep them after every test; a spec that wants a watcher
    // attaches it fresh.
    for (const ev of ["request", "requestfailed", "response", "console", "pageerror", "dialog"] as const) {
      page.removeAllListeners(ev);
    }
  },

  recorder: async ({ context, page }, use, testInfo) => {
    const rec = new Recorder(page, testInfo);
    let caught: unknown;
    try {
      await use(rec);
    } catch (e) {
      caught = e;
      if (!(e instanceof RecorderStepError)) rec.markError(e); // unexpected error vs expected step failure
    }
    await writeEvidenceBundle({
      testInfo,
      recorder: rec,
      context,
      videoDir: path.join(testInfo.outputDir, "video"),
    });
    if (caught) throw caught; // mark the test failed in the report
    if (rec.failureCount > 0) throw new Error(`${rec.failureCount} step(s) failed — see evidence bundle.`);
  },
});

export { expect };

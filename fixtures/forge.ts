// The harness test fixture. Overrides context/page to drive a PERSISTENT profile
// (auth reuse without the headed→headless "new device" 2FA trigger), records
// video+trace, and injects a Recorder that finalizes an evidence bundle per scenario.
import { test as base, expect } from "@playwright/test";
import path from "node:path";
import { launchHarnessContext } from "../forge/browser";
import { Recorder, RecorderStepError } from "../capture/recorder";
import { writeEvidenceBundle } from "../capture/evidence";

interface Fixtures {
  recorder: Recorder;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use, testInfo) => {
    const videoDir = path.join(testInfo.outputDir, "video");
    const context = await launchHarnessContext({ recordVideoDir: videoDir });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true }).catch(() => {});
    await use(context);
    await context.close(); // flushes the recorded webm
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
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

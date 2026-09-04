// Assembles the per-scenario evidence bundle and writes evidence-manifest.json.
// Video/trace: trace.zip is written here (context still open at recorder teardown);
// the raw webm is finalized only when the context closes, so report.mjs copies it
// in afterwards using `videoSourceDir`.
import fs from "node:fs";
import path from "node:path";
import { type BrowserContext, type TestInfo } from "@playwright/test";
import { Recorder } from "./recorder";
import { EVIDENCE_DIR, SITE_HOST, VIEWPORT } from "../config/env";

let RUN_ID = process.env.RUN_ID || "";
export function runId(): string {
  if (!RUN_ID) {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    RUN_ID = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    process.env.RUN_ID = RUN_ID;
  }
  return RUN_ID;
}

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);

export interface FinalizeArgs {
  testInfo: TestInfo;
  recorder: Recorder;
  context: BrowserContext;
  videoDir: string;
}

export async function writeEvidenceBundle(a: FinalizeArgs): Promise<string> {
  const { testInfo, recorder, context, videoDir } = a;
  const scenario = slug(testInfo.title);
  const dir = path.join(EVIDENCE_DIR, runId(), scenario);
  fs.mkdirSync(path.join(dir, "steps"), { recursive: true });

  for (const s of recorder.screenshotFiles) {
    fs.writeFileSync(path.join(dir, "steps", s.name), s.buffer);
  }

  // stopChunk, not stop: the context (and its trace) is shared by the whole
  // run now, and stopping the TRACE here would silently end tracing for every
  // test after the first one that wrote evidence. The fixture starts a chunk
  // per test; this closes that chunk into the bundle.
  await context.tracing.stopChunk({ path: path.join(dir, "trace.zip") }).catch(() => {});

  fs.writeFileSync(path.join(dir, "console.json"), JSON.stringify(recorder.console, null, 2));
  fs.writeFileSync(path.join(dir, "network.json"), JSON.stringify(recorder.network, null, 2));
  if (recorder.frames) fs.writeFileSync(path.join(dir, "frames.json"), JSON.stringify(recorder.frames, null, 2));
  for (const step of recorder.steps) {
    if (!step.aria) continue;
    const ariaFile = step.screenshot.replace(/\.png$/i, ".aria.yaml");
    fs.writeFileSync(path.join(dir, ariaFile), step.aria);
  }
  const lastAria = [...recorder.steps].reverse().find((s) => s.aria)?.aria;
  // Keep the historical top-level alias for assessors and old evidence readers.
  if (lastAria) fs.writeFileSync(path.join(dir, "aria.yaml"), lastAria);

  const viewport = recorder.page.viewportSize()
    ?? await recorder.page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })).catch(() => VIEWPORT);

  const captureStatus: "pass" | "fail" | "error" =
    recorder.errored ? "error" : recorder.failureCount > 0 ? "fail" : "pass";

  const manifest = {
    schemaVersion: "1.0",
    runId: runId(),
    scenarioId: scenario,
    scenarioName: testInfo.title,
    captureStatus,
    target: recorder.target ?? { product: "jira", module: "unknown", url: "" },
    steps: recorder.steps.map((s) => ({
      index: s.index,
      name: s.name,
      action: s.action,
      status: s.status,
      screenshot: s.screenshot,
      ...(s.aria ? { aria: s.screenshot.replace(/\.png$/i, ".aria.yaml") } : {}),
      error: s.error,
      expectation: s.expectation,
      timing: s.timing,
    })),
    pageErrors: recorder.pageErrors,
    video: "video.webm",
    videoSourceDir: videoDir,
    trace: "trace.zip",
    console: "console.json",
    network: "network.json",
    ...(lastAria ? { aria: "aria.yaml" } : {}),
    ...(recorder.frames ? { frames: "frames.json" } : {}),
    env: {
      site: SITE_HOST,
      browser: "chromium/chrome",
      viewport: `${viewport.width}x${viewport.height}`,
      capturedAt: new Date().toISOString(),
      harnessVersion: "0.1.0",
    },
  };
  fs.writeFileSync(path.join(dir, "evidence-manifest.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

// Shared assess helpers: locate bundles, read the manifest + sidecars, extract the
// evidence slices, and build the briefing text used identically by the Claude-Code
// path and the autonomous API adapter.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ASSESS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(ASSESS_DIR, "..");
export const EVIDENCE_DIR = process.env.EVIDENCE_DIR ?? path.join(REPO_ROOT, "evidence");
export const FIX_REPORT_SCHEMA_PATH = path.join(REPO_ROOT, "schemas", "fix-report.schema.json");

export interface ConsoleEntry { t: number; level: string; text: string }
export interface NetworkEntry { t: number; method: string; url: string; status: number; resolver?: string }
export interface Step {
  index: number; name: string; status: "pass" | "fail";
  screenshot: string; error?: string;
  expectation?: { assertion: string; narrative: string };
}
export interface Manifest {
  runId: string; scenarioId: string; scenarioName?: string;
  captureStatus: "pass" | "fail" | "error";
  target: Record<string, unknown> & { product?: string; module?: string; url?: string; repo?: string; moduleType?: string; iframe?: string; gitShaAppUnderTest?: string };
  steps: Step[];
  pageErrors?: string[];
}

export function readJson<T = unknown>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, "utf8")) as T; } catch { return null; }
}

export function readManifest(bundleDir: string): Manifest | null {
  return readJson<Manifest>(path.join(bundleDir, "evidence-manifest.json"));
}

/** All scenario bundle dirs under a run (or the latest run if runId omitted). */
export function findBundles(runId?: string): string[] {
  if (!fs.existsSync(EVIDENCE_DIR)) return [];
  const runs = fs.readdirSync(EVIDENCE_DIR).filter((d) => fs.statSync(path.join(EVIDENCE_DIR, d)).isDirectory()).sort();
  const run = runId ?? runs[runs.length - 1];
  if (!run) return [];
  const runDir = path.join(EVIDENCE_DIR, run);
  return fs.readdirSync(runDir)
    .map((d) => path.join(runDir, d))
    .filter((d) => fs.existsSync(path.join(d, "evidence-manifest.json")));
}

export interface Slices {
  console: ConsoleEntry[];
  network: NetworkEntry[];
  errors: { i: number; entry: ConsoleEntry }[];
  badNet: { i: number; entry: NetworkEntry }[];
}

export function evidenceSlices(bundleDir: string): Slices {
  const console = readJson<ConsoleEntry[]>(path.join(bundleDir, "console.json")) ?? [];
  const network = readJson<NetworkEntry[]>(path.join(bundleDir, "network.json")) ?? [];
  const errors = console.map((entry, i) => ({ i, entry })).filter((c) => c.entry.level === "error");
  const badNet = network.map((entry, i) => ({ i, entry })).filter((n) => n.entry.status >= 400);
  return { console, network, errors, badNet };
}

/** Step screenshots to look at: the failing steps + the step immediately before the first failure. */
export function focusScreenshots(m: Manifest, max: number): string[] {
  const fails = m.steps.filter((s) => s.status === "fail");
  const set = new Set<string>();
  const firstFailIdx = m.steps.findIndex((s) => s.status === "fail");
  if (firstFailIdx > 0) set.add(m.steps[firstFailIdx - 1].screenshot);
  for (const f of fails) set.add(f.screenshot);
  // top up with the last few steps for context
  for (const s of [...m.steps].reverse()) { if (set.size >= max) break; set.add(s.screenshot); }
  return [...set].slice(0, max);
}

export function buildBriefing(m: Manifest, s: Slices): string {
  const t = m.target;
  const fails = m.steps.filter((st) => st.status === "fail");
  const lines: string[] = [];
  lines.push(`Target: ${t.product} / ${t.moduleType ?? "?"} "${t.module}"`);
  lines.push(`URL: ${t.url}`);
  if (t.iframe) lines.push(`Forge iframe: ${t.iframe}`);
  if (t.repo) lines.push(`App-under-test repo (read it to confirm fixes): ${t.repo}`);
  if (t.gitShaAppUnderTest) lines.push(`App git sha: ${t.gitShaAppUnderTest}`);
  lines.push("");
  lines.push("FAILED EXPECTATION(S):");
  for (const f of fails) {
    lines.push(`  - step ${f.index} «${f.name}»`);
    if (f.expectation) {
      lines.push(`      EXPECTED (what good looks like): ${f.expectation.narrative}`);
      lines.push(`      ASSERTION: ${f.expectation.assertion}`);
    }
    if (f.error) lines.push(`      ERROR: ${f.error}`);
    lines.push(`      screenshot: ${f.screenshot}`);
  }
  if (m.pageErrors && m.pageErrors.length) {
    lines.push("");
    lines.push("PAGE ERRORS:");
    for (const e of m.pageErrors.slice(-8)) lines.push(`  - ${e}`);
  }
  if (s.errors.length) {
    lines.push("");
    lines.push("CONSOLE ERRORS (cite as console.json#<index>):");
    for (const e of s.errors.slice(-10)) lines.push(`  - console.json#${e.i}: ${e.entry.text}`);
  }
  if (s.badNet.length) {
    lines.push("");
    lines.push("NON-2xx NETWORK (cite as network.json#<index>):");
    for (const n of s.badNet.slice(-15)) lines.push(`  - network.json#${n.i}: ${n.entry.method} ${n.entry.url} → ${n.entry.status}${n.entry.resolver ? ` (${n.entry.resolver})` : ""}`);
  }
  return lines.join("\n");
}

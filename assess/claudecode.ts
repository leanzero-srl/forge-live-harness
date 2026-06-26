// Claude-Code-in-loop path: for a failing scenario, write ASSESS-REQUEST.md next to
// the bundle. A coding agent (Claude Code) reads it, looks at the named PNGs + cited
// slices, confirms against the app repo, and writes fix-report.json + fix-brief.md.
import fs from "node:fs";
import path from "node:path";
import { buildBriefing, evidenceSlices, focusScreenshots, readManifest } from "./shared";
import { assessConfig } from "./config";

export function emitAssessRequest(bundleDir: string): boolean {
  const m = readManifest(bundleDir);
  if (!m || m.captureStatus === "pass") return false;

  const slices = evidenceSlices(bundleDir);
  const briefing = buildBriefing(m, slices);
  const images = focusScreenshots(m, assessConfig.maxKeyframes);
  const firstFail = m.steps.find((s) => s.status === "fail");

  const md = `# ASSESS-REQUEST — ${m.scenarioId} (${m.runId})  [${m.captureStatus.toUpperCase()}]

Review this captured run of a LIVE Atlassian Forge surface and produce a SPECIFIC,
evidence-cited fix. Do not speculate without citing an artifact in this folder.

## Context
${briefing}

## Images to read (you can Read PNGs directly; focus on the failing frame)
${images.map((s) => `- ${s}`).join("\n")}

## Other artifacts in this folder
- evidence-manifest.json — full run + per-step expectations
- console.json / network.json — cite exact indices (e.g. console.json#42, network.json#57)
- aria.yaml — ARIA snapshot taken INSIDE the Forge iframe (element-level facts)
- frames.json — discovered iframe tree (step-1 diagnostic)
- trace.zip — \`npx playwright show-trace ${path.join(bundleDir, "trace.zip")}\`

## Deliverables (write into THIS folder)
1. \`fix-report.json\` — conform to \`schemas/fix-report.schema.json\` (set "producer":"claude-code").
2. \`fix-brief.md\` — human-readable render of the report.

## Rules (anti-hallucination — hard)
- Every finding needs ≥1 \`evidence\` ref (screenshot path / console.json#N / network.json#N / aria.yaml#L..).
- A root-cause you can't confirm from evidence/source MUST set rootCause.lowConfidence=true (confidence < 0.5).
- Localize: surface + selector + ariaName (+ bbox if visible). "The page is broken" is NOT acceptable.
- A suggestedFix must name a REAL file in the app repo${m.target.repo ? ` (\`${m.target.repo}\`)` : ""}. Read it before hinting; if you didn't, mark that fix's confidence low.
- The fix goes in the APP-UNDER-TEST repo, not this harness.
- Give repro steps.
${firstFail ? `\n## Primary failure\nstep ${firstFail.index} «${firstFail.name}» — ${firstFail.expectation?.narrative ?? firstFail.error ?? ""}\n` : ""}`;

  fs.writeFileSync(path.join(bundleDir, "ASSESS-REQUEST.md"), md);
  return true;
}

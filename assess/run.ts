// `npm run assess [-- --api] [-- --run=<runId>]`
// Walks the latest (or named) run's evidence bundles. For each FAILING scenario,
// writes ASSESS-REQUEST.md (for Claude Code). With --api, also runs the autonomous
// Anthropic adapter to emit fix-report.json + fix-brief.md.
import { findBundles, readManifest } from "./shared";
import { emitAssessRequest } from "./claudecode";
import { assessWithApi } from "./assess-api";

const useApi = process.argv.includes("--api");
const runArg = process.argv.find((a) => a.startsWith("--run="))?.split("=")[1];

const bundles = findBundles(runArg);
if (!bundles.length) {
  console.log("No evidence bundles found. Run `npm test` first.");
  process.exit(0);
}

let failures = 0;
for (const dir of bundles) {
  const m = readManifest(dir);
  if (!m) continue;
  if (m.captureStatus === "pass") {
    console.log(`  ✓ ${m.scenarioId}: pass`);
    continue;
  }
  failures++;
  emitAssessRequest(dir);
  console.log(`  ✗ ${m.scenarioId}: ${m.captureStatus} → ${dir}/ASSESS-REQUEST.md`);
  if (useApi) {
    try {
      const ok = await assessWithApi(dir);
      if (ok) console.log(`      → fix-report.json + fix-brief.md (api-adapter)`);
    } catch (e) {
      console.error(`      ! api adapter failed: ${(e as Error).message}`);
    }
  }
}

console.log(
  `\n${failures} failing scenario(s).` +
    (useApi ? "" : " Point Claude Code at an ASSESS-REQUEST.md, or run `npm run assess -- --api`."),
);

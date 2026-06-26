// Post-run collation: copy the recorded webm + trace into each evidence bundle and
// extract video keyframes (ffmpeg, best-effort). Then point at the HTML report.
// Run: npm run report  [-- --run=<runId>]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE = process.env.EVIDENCE_DIR ?? path.join(ROOT, "evidence");

function dirs(p) {
  return fs.existsSync(p) ? fs.readdirSync(p).filter((d) => fs.statSync(path.join(p, d)).isDirectory()) : [];
}
function latestRun() {
  const runs = dirs(EVIDENCE).sort();
  return runs[runs.length - 1];
}
function hasFfmpeg() {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; }
}

const runArg = process.argv.find((a) => a.startsWith("--run="))?.split("=")[1];
const run = runArg ?? latestRun();
if (!run) { console.log("No evidence runs found."); process.exit(0); }

const runDir = path.join(EVIDENCE, run);
const ffmpeg = hasFfmpeg();
if (!ffmpeg) console.warn("  (ffmpeg not found — skipping keyframe extraction; per-step PNGs still available)");

let copied = 0, framed = 0;
for (const scenario of dirs(runDir)) {
  const bundle = path.join(runDir, scenario);
  const manifestPath = path.join(bundle, "evidence-manifest.json");
  if (!fs.existsSync(manifestPath)) continue;
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  // Copy the recorded webm (finalized once the context closed) into the bundle.
  const videoDest = path.join(bundle, "video.webm");
  if (!fs.existsSync(videoDest) && m.videoSourceDir && fs.existsSync(m.videoSourceDir)) {
    const webms = fs.readdirSync(m.videoSourceDir).filter((f) => f.endsWith(".webm"));
    if (webms.length) {
      // pick the largest (the main page recording)
      const pick = webms
        .map((f) => ({ f, size: fs.statSync(path.join(m.videoSourceDir, f)).size }))
        .sort((a, b) => b.size - a.size)[0].f;
      fs.copyFileSync(path.join(m.videoSourceDir, pick), videoDest);
      copied++;
    }
  }

  // Extract keyframes from the webm for image-based review.
  if (ffmpeg && fs.existsSync(videoDest)) {
    const kfDir = path.join(bundle, "keyframes");
    fs.mkdirSync(kfDir, { recursive: true });
    try {
      execFileSync(
        "ffmpeg",
        ["-y", "-i", videoDest, "-vf", "thumbnail,scale=1400:-2", "-frames:v", "8", path.join(kfDir, "kf-%02d.png")],
        { stdio: "ignore" },
      );
      framed++;
    } catch { /* non-fatal */ }
  }
}

console.log(`\nRun ${run}: copied ${copied} video(s), keyframed ${framed} bundle(s).`);
console.log(`Evidence: ${runDir}`);
console.log(`View:  npx playwright show-report   |   npx playwright show-trace <bundle>/trace.zip`);

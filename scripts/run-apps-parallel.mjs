#!/usr/bin/env node
// Run several apps AT THE SAME TIME, each through scripts/run-app.mjs — so each gets its own auth
// clone, its own evidence folder and its own Playwright output dir. Nothing is shared but the site.
//
//   npm run apps:parallel -- lz-ppm cognirunner [sentinel-vault …] [-- <flags for every app>]
//   npm run apps:parallel -- lz-ppm cognirunner --env dev --rest-only
//
// Every app runs under the SAME batch id, so its evidence lands at evidence/<app>/<batchId>/ and
// the batch summary at evidence/_parallel/<batchId>/summary.json (per-app exit code, counts,
// start/finish times — the overlap in those times is the proof the runs were concurrent).
// Exit: the worst per-app exit (0 only when every app is green).
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveApp } from "../config/apps.mjs";
import { CODE_ROOT } from "../config/home.mjs";

const argv = process.argv.slice(2);
const apps = [];
const flags = [];
let maxConc = Infinity;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--") { flags.push(...argv.slice(i + 1)); break; }
  if (a === "--max") { maxConc = Number(argv[++i]); continue; }
  if (a === "--run-id") { console.error("apps:parallel sets the run id itself (one batch id for every app)"); process.exit(2); }
  if (a.startsWith("-")) {
    flags.push(a);
    // flags that take a value
    if (["--env", "--grep", "-g", "--workers", "--bed-wait", "--spec"].includes(a)) flags.push(argv[++i]);
    continue;
  }
  apps.push(resolveApp(a).id);
}
if (new Set(apps).size !== apps.length) { console.error("an app is named twice: one batch runs each app once (two sessions may each run the same app — they get separate run ids)"); process.exit(2); }
if (!apps.length) { console.error("usage: npm run apps:parallel -- <app> <app> … [--env dev|staging|prod] [--rest-only] [--headed] [--grep p] [--max N]"); process.exit(2); }
if (flags.includes("--spec")) { console.error("--spec names files of ONE app; use npm run app for that"); process.exit(2); }

const d = new Date(), p = (n) => String(n).padStart(2, "0");
const batchId = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${crypto.randomBytes(2).toString("hex")}`;
const evidenceRoot = process.env.EVIDENCE_DIR ? path.resolve(process.env.EVIDENCE_DIR) : path.join(CODE_ROOT, "evidence");
const batchDir = path.join(evidenceRoot, "_parallel", batchId);
fs.mkdirSync(batchDir, { recursive: true });
const RUNNER = path.join(path.dirname(fileURLToPath(import.meta.url)), "run-app.mjs");

console.log(`▶ batch ${batchId}: ${apps.join(", ")} in parallel${Number.isFinite(maxConc) ? ` (max ${maxConc})` : ""} ${flags.join(" ")}`);

function runOne(app) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const log = fs.createWriteStream(path.join(batchDir, `${app}.log`));
    const child = spawn(process.execPath, [RUNNER, app, ...flags, "--run-id", batchId], { cwd: CODE_ROOT, env: { ...process.env, FORCE_COLOR: "0" }, stdio: ["ignore", "pipe", "pipe"] });
    const pipe = (stream, out) => {
      let buf = "";
      stream.on("data", (chunk) => {
        buf += chunk; log.write(chunk);
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) { out.write(`[${app}] ${buf.slice(0, nl)}\n`); buf = buf.slice(nl + 1); }
      });
      stream.on("end", () => { if (buf) out.write(`[${app}] ${buf}\n`); });
    };
    pipe(child.stdout, process.stdout); pipe(child.stderr, process.stderr);
    const forward = (sig) => { try { child.kill(sig); } catch { /* gone */ } };
    process.on("SIGINT", forward); process.on("SIGTERM", forward);
    child.on("exit", (code, signal) => {
      process.off("SIGINT", forward); process.off("SIGTERM", forward);
      log.end();
      const summaryPath = path.join(evidenceRoot, app, batchId, "summary.json");
      let s = null;
      try { s = JSON.parse(fs.readFileSync(summaryPath, "utf8")); } catch { /* runner died before writing */ }
      resolve({
        app, exitCode: code ?? (signal ? 130 : 1), startedAt, finishedAt: new Date().toISOString(), summaryPath: s ? summaryPath : null,
        rest: s ? { status: s.lanes.rest.status, counts: s.lanes.rest.counts ?? null, note: s.lanes.rest.note ?? null } : null,
        browser: s ? { status: s.lanes.browser.status, counts: s.lanes.browser.counts ?? null, reason: s.lanes.browser.reason ?? null, bundles: s.lanes.browser.bundles ?? [] } : null,
        auth: s?.auth ?? null, evidenceDir: s?.evidenceDir ?? null, log: path.join(batchDir, `${app}.log`),
      });
    });
  });
}

const t0 = Date.now();
const queue = [...apps];
const results = [];
const workers = Array.from({ length: Math.min(apps.length, maxConc) }, async () => {
  while (queue.length) results.push(await runOne(queue.shift()));
});
await Promise.all(workers);

// Overlap proof: pairs of apps whose [start, finish] windows intersect.
const overlaps = [];
for (let i = 0; i < results.length; i++) for (let j = i + 1; j < results.length; j++) {
  const a = results[i], b = results[j];
  const s = Math.max(Date.parse(a.startedAt), Date.parse(b.startedAt)), e = Math.min(Date.parse(a.finishedAt), Date.parse(b.finishedAt));
  if (e > s) overlaps.push({ apps: [a.app, b.app], overlapMs: e - s });
}
const worst = results.reduce((w, r) => (r.exitCode !== 0 && (w === 0 || r.exitCode < w) ? r.exitCode : w), 0);
const batch = { schema: "harness-parallel-v1", batchId, apps, flags, wallMs: Date.now() - t0, exitCode: worst, overlaps, results: results.sort((a, b) => apps.indexOf(a.app) - apps.indexOf(b.app)) };
fs.writeFileSync(path.join(batchDir, "summary.json"), JSON.stringify(batch, null, 2));
console.log(`\n■ batch ${batchId}: exit ${worst} in ${(batch.wallMs / 1000).toFixed(1)}s`);
for (const r of batch.results) console.log(`  ${r.app.padEnd(16)} exit ${r.exitCode}  rest ${r.rest?.status ?? "?"}  browser ${r.browser?.status ?? "?"}  → ${r.evidenceDir ?? r.log}`);
console.log(`  overlap: ${overlaps.map((o) => `${o.apps.join("+")} ${(o.overlapMs / 1000).toFixed(1)}s`).join(", ") || "none"}\n  summary ${path.join(batchDir, "summary.json")}`);
process.exit(worst);

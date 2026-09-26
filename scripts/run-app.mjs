#!/usr/bin/env node
// PER-APP RUNNER — one app, one environment, its own auth copy, its own evidence folder.
//
//   npm run app -- <app> [--env dev|staging|prod] [--grep <pattern>] [--rest-only] [--headed]
//                        [--spec <file>]... [--all] [--workers N] [--run-id ID]
//                        [--keep-auth-clone] [--force-env] [--bed-wait <sec>]
//
// Two lanes, run one after the other:
//   REST lane     rest/probes.rest.ts filtered to this app: browserless hook/REST probes. Doors that
//                 do not exist in the env are skipped with the reason (a Runs on Atlassian app in
//                 production has no web trigger: the browser lane IS its check there).
//   BROWSER lane  the app's specs, HEADLESS by default, on a per-run CLONE of the saved login
//                 (forge/auth-clone.mjs). The clone is checked alive first; a dead session fails
//                 fast with "the owner must run npm run auth" instead of 30 specs timing out.
//
// Default spec set = the app's read-only SMOKE set (config/apps.mjs). --grep / --all widen it to the
// whole scenario dir; --spec names files. Off development, only the smoke set runs unless a spec is
// named explicitly, and the dev hook URLs are BLANKED so a deep spec cannot silently act on dev data
// while the run claims to be testing production.
//
// Output: evidence/<app>/<runId>/  (browser bundles per scenario, rest/*.json per probe,
// rest-results/ + browser-results/ Playwright output, report-*/ html, summary.json).
// Exit: 0 green · 1 a test failed · 2 usage · 3 auth expired (browser lane blocked) · 4 nothing app-level
// could run (env not installed and no door) · 5 bed busy.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveApp, resolveEnv, doorsIn } from "../config/apps.mjs";
import { harnessHome, CODE_ROOT } from "../config/home.mjs";
import { cloneProfile, checkSession, removeOwnedRun, runsRoot } from "../forge/auth-clone.mjs";
import { loadEnv } from "../data/env.mjs";

loadEnv();
const HERE = path.dirname(fileURLToPath(import.meta.url));

function usage(msg) {
  if (msg) console.error(`run-app: ${msg}`);
  console.error("usage: npm run app -- <app> [--env dev|staging|prod] [--grep <pattern>] [--rest-only] [--headed] [--spec <file>]... [--all] [--workers N] [--run-id ID] [--keep-auth-clone] [--force-env] [--bed-wait <sec>]");
  process.exit(2);
}

export function parseArgs(argv) {
  const o = { app: null, env: "development", grep: null, restOnly: false, headed: false, specs: [], all: false, workers: null, runId: null, keepAuthClone: false, forceEnv: false, bedWait: 0, noRest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) usage(`${a} needs a value`); return v; };
    if (a === "--env") o.env = resolveEnv(val());
    else if (a.startsWith("--env=")) o.env = resolveEnv(a.slice(6));
    else if (a === "--grep" || a === "-g") o.grep = val();
    else if (a === "--rest-only") o.restOnly = true;
    else if (a === "--no-rest") o.noRest = true;
    else if (a === "--headed") o.headed = true;
    else if (a === "--spec") o.specs.push(val());
    else if (a === "--all") o.all = true;
    else if (a === "--workers") o.workers = Number(val());
    else if (a === "--run-id") o.runId = val();
    else if (a === "--keep-auth-clone") o.keepAuthClone = true;
    else if (a === "--force-env") o.forceEnv = true;
    else if (a === "--bed-wait") o.bedWait = Number(val());
    else if (a === "-h" || a === "--help") usage();
    else if (a.startsWith("-")) usage(`unknown flag ${a}`);
    else if (!o.app) o.app = a;
    else usage(`unexpected argument ${a}`);
  }
  if (!o.app) usage("name an app");
  if (o.restOnly && o.noRest) usage("--rest-only and --no-rest contradict each other");
  return o;
}

const stamp = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

function runPlaywright(args, env, label) {
  return new Promise((resolve) => {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(npx, ["playwright", "test", ...args], { cwd: CODE_ROOT, env, stdio: "inherit" });
    const forward = (sig) => { try { child.kill(sig); } catch { /* gone */ } };
    process.on("SIGINT", forward); process.on("SIGTERM", forward);
    child.on("exit", (code, signal) => {
      process.off("SIGINT", forward); process.off("SIGTERM", forward);
      resolve(code ?? (signal ? 130 : 1));
    });
    child.on("error", (e) => { console.error(`[${label}] could not start playwright: ${e.message}`); resolve(1); });
  });
}

/** Flatten a Playwright JSON report into test rows. */
function readReport(file) {
  if (!fs.existsSync(file)) return [];
  const rep = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = [];
  const walk = (suite, trail) => {
    for (const s of suite.suites || []) walk(s, s.title && !s.title.endsWith(".ts") ? [...trail, s.title] : trail);
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const last = (t.results || [])[t.results.length - 1] || {};
        const err = last.error?.message || (last.errors || [])[0]?.message || null;
        rows.push({
          title: [...trail, spec.title].join(" › "),
          file: spec.file,
          project: t.projectName,
          status: t.status === "expected" ? "passed" : t.status === "unexpected" ? "failed" : t.status, // flaky | skipped
          attempts: (t.results || []).length,
          ms: (t.results || []).reduce((a, r) => a + (r.duration || 0), 0),
          annotations: (t.annotations || []).map((a) => ({ type: a.type, description: a.description })),
          error: err ? err.replace(/\u001b\[[0-9;]*m/g, "").slice(0, 400) : null,
        });
      }
    }
  };
  walk(rep, []);
  return rows;
}

const count = (rows) => rows.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] || 0) + 1 }), {});

// --- cross-run bed lock: the same app's MUTATING suite never runs twice at once (advisory) ---
const BED_LOCKS = path.join(os.homedir(), ".local", "state", "forge-live-harness", "bed-locks");
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } }
async function takeBedLock(app, runId, waitSec) {
  fs.mkdirSync(BED_LOCKS, { recursive: true, mode: 0o700 });
  const dir = path.join(BED_LOCKS, `${app}.lock`);
  const deadline = Date.now() + waitSec * 1000;
  for (;;) {
    try {
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "owner.json"), JSON.stringify({ pid: process.pid, host: os.hostname(), runId, at: new Date().toISOString() }));
      return () => { try { const o = JSON.parse(fs.readFileSync(path.join(dir, "owner.json"), "utf8")); if (o.pid === process.pid && o.runId === runId) fs.rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ } };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let owner = null;
      try { owner = JSON.parse(fs.readFileSync(path.join(dir, "owner.json"), "utf8")); } catch { /* being written */ }
      if (owner && owner.host === os.hostname() && !pidAlive(owner.pid)) {
        // The holder died without releasing: reclaim ONLY this exact lock dir, identified by its dead owner.
        fs.rmSync(dir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) return { busy: owner };
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const app = resolveApp(o.app);
  const env = o.env;
  const runId = o.runId || `${stamp()}-${crypto.randomBytes(2).toString("hex")}`;
  const evidenceRoot = path.join(process.env.EVIDENCE_DIR ? path.resolve(process.env.EVIDENCE_DIR) : path.join(CODE_ROOT, "evidence"), app.id);
  const runDir = path.join(evidenceRoot, runId);
  if (fs.existsSync(runDir)) usage(`run dir ${runDir} already exists — pick another --run-id`);
  fs.mkdirSync(runDir, { recursive: true });
  const home = harnessHome();
  const authDir = path.join(home, ".auth");
  const started = new Date();
  const doors = doorsIn(app, env);
  const installed = app.installed.includes(env);
  const offDev = env !== "development";

  // ---------- which specs ----------
  let specs = [];
  let selection;
  if (o.specs.length) { specs = o.specs; selection = "named"; }
  else if (o.grep || o.all) {
    if (offDev) usage(`--grep/--all off development would run deep specs that assume the dev hook; name the specs with --spec for ${env}`);
    specs = [app.scenarioDir]; selection = o.grep ? "grep" : "all";
  } else { specs = app.smoke; selection = "smoke"; }
  for (const s of specs) if (!fs.existsSync(path.join(CODE_ROOT, s))) usage(`no such spec/dir: ${s}`);
  const workers = o.workers || (selection === "smoke" ? Math.min(app.smokeWorkers, specs.length) : app.suiteWorkers);

  const summary = {
    schema: "harness-run-v1", app: app.id, title: app.title, env, runId, host: os.hostname(), codeRoot: CODE_ROOT, harnessHome: home,
    headless: !o.headed, badge: app.badge, installedOnSite: installed, doors,
    selection, grep: o.grep, specs, workers,
    lanes: { rest: { status: "pending" }, browser: { status: "pending" } },
    startedAt: started.toISOString(), finishedAt: null, exitCode: null, evidenceDir: runDir,
  };
  const writeSummary = () => fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  writeSummary();
  console.log(`\n▶ ${app.id} [${env}] run ${runId} — ${o.restOnly ? "REST only" : `${selection} (${specs.length} path${specs.length === 1 ? "" : "s"}), ${o.headed ? "HEADED" : "headless"}, workers ${workers}`}; doors here: ${doors.length ? doors.join(", ") : "none"}\n  evidence → ${runDir}`);

  // ---------- child env ----------
  const childEnv = { ...process.env, HARNESS_APP: app.id, HARNESS_ENV: env, RUN_ID: runId, EVIDENCE_DIR: evidenceRoot, HARNESS_HOME: home };
  if (app.envIds[env]) childEnv[app.envIdVar] = app.envIds[env];
  if (offDev) for (const v of app.blankOffDev) childEnv[v] = ""; // loadEnv never overrides a defined var
  delete childEnv.HARNESS_RUN_AUTH_DIR; delete childEnv.HARNESS_PROFILE;

  let exitCode = 0;
  const bump = (c) => { if (c && (exitCode === 0 || c < exitCode)) exitCode = c; };

  // ---------- REST lane ----------
  if (o.noRest) summary.lanes.rest = { status: "skipped", reason: "--no-rest" };
  else {
    const out = path.join(runDir, "rest-results");
    const json = path.join(runDir, "rest-results.json");
    const args = ["rest/probes.rest.ts", "--project=rest", "--workers=4"];
    if (o.grep && o.restOnly) args.push("--grep", o.grep);
    const code = await runPlaywright(args, { ...childEnv, HARNESS_OUTPUT_DIR: out, HARNESS_REPORT_DIR: path.join(runDir, "report-rest"), HARNESS_JSON_REPORT: json, HARNESS_WORKERS: "4" }, "rest");
    const rows = readReport(json);
    const appLevel = rows.filter((r) => r.status !== "skipped" && !r.annotations.some((a) => a.type === "door" && a.description === "site"));
    summary.lanes.rest = { status: code === 0 ? "passed" : "failed", exit: code, counts: count(rows), appLevelChecks: appLevel.length, tests: rows };
    if (!appLevel.length) summary.lanes.rest.note = doors.length ? "every door probe skipped (not configured in .env?)" : `no REST/hook door in ${env}${app.badge && env === "production" ? " (Runs on Atlassian: by design)" : ""} — browser lane is the check`;
    if (code !== 0) bump(1);
    writeSummary();
  }

  // ---------- BROWSER lane ----------
  let authRunDir = null;
  let releaseBed = null;
  if (o.restOnly) {
    summary.lanes.browser = { status: "skipped", reason: "--rest-only" };
    // A REST-only run that reached no app door verified nothing about the app: never report it green.
    if (!(summary.lanes.rest.appLevelChecks > 0)) {
      console.error(`\n✖ REST-only run verified nothing app-level: ${summary.lanes.rest.note ?? "no probe ran"}. Run without --rest-only for the browser checks.`);
      bump(4);
    }
  }
  else if (!installed && !o.forceEnv) {
    summary.lanes.browser = { status: "blocked", reason: `${app.id} has no ${env} install on the test site (config/apps.mjs installed: ${app.installed.join(", ")}); --force-env to try anyway` };
    console.error(`\n✖ browser lane: ${summary.lanes.browser.reason}`);
    if (!(summary.lanes.rest.appLevelChecks > 0)) bump(4);
  } else {
    try {
      if (selection !== "smoke" && app.suiteWorkers === 1) {
        const lock = await takeBedLock(app.id, runId, o.bedWait);
        if (typeof lock !== "function") {
          summary.lanes.browser = { status: "blocked", reason: `${app.id} bed is busy: run ${lock.busy?.runId} (pid ${lock.busy?.pid}) holds the suite lock; retry, or --bed-wait <sec>` };
          console.error(`\n✖ ${summary.lanes.browser.reason}`);
          bump(5);
          throw Object.assign(new Error("bed-busy"), { handled: true });
        }
        releaseBed = lock;
      }
      // Per-run auth copy: clone the saved login, prove it alive, then every worker clones this base.
      const source = process.env.HARNESS_AUTH_SOURCE ? path.resolve(process.env.HARNESS_AUTH_SOURCE) : path.join(authDir, "profile");
      authRunDir = path.join(runsRoot(authDir), `${app.id}-${runId}`);
      const cl = cloneProfile(source, path.join(authRunDir, "base"), { app: app.id, runId });
      const { chromium } = await import("@playwright/test");
      const s = await checkSession({ chromium, profileDir: path.join(authRunDir, "base"), baseUrl: (process.env.JIRA_BASE_URL || "https://wolfaenpak.atlassian.net").replace(/\/+$/, "") });
      summary.auth = { source, cloneMs: cl.ms, session: s.ok ? "alive" : s.reason, status: s.status, actingAs: s.displayName ?? null };
      if (!s.ok) {
        summary.lanes.browser = { status: "blocked", reason: `AUTH EXPIRED: the saved login at ${source} no longer opens a session (HTTP ${s.status}). The OWNER must run \`npm run auth\` in ${home} (headed, email + password + 2FA). REST checks above are unaffected.` };
        console.error(`\n✖ ${summary.lanes.browser.reason}\n`);
        bump(3);
      } else {
        console.log(`  auth: cloned in ${cl.ms}ms, session alive as ${s.displayName}`);
        const out = path.join(runDir, "browser-results");
        const json = path.join(runDir, "browser-results.json");
        const args = [...specs, "--project=chromium", `--workers=${workers}`];
        if (o.grep) args.push("--grep", o.grep);
        const code = await runPlaywright(args, {
          ...childEnv, HARNESS_RUN_AUTH_DIR: authRunDir, HARNESS_OUTPUT_DIR: out, HARNESS_REPORT_DIR: path.join(runDir, "report-browser"),
          HARNESS_JSON_REPORT: json, HARNESS_WORKERS: String(workers), ...(o.headed ? { HEADED: "1", HEADLESS: "0" } : { HEADLESS: "1", HEADED: "0" }),
        }, "browser");
        const rows = readReport(json);
        const bundles = fs.readdirSync(runDir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && fs.existsSync(path.join(runDir, d.name, "evidence-manifest.json"))).map((d) => path.join(runDir, d.name));
        summary.lanes.browser = { status: code === 0 ? "passed" : "failed", exit: code, counts: count(rows), tests: rows, bundles };
        if (code !== 0) bump(1);
      }
    } catch (e) {
      if (!e.handled) {
        summary.lanes.browser = { status: "error", reason: String(e.message || e).slice(0, 500) };
        console.error(`\n✖ browser lane error: ${summary.lanes.browser.reason}`);
        bump(1);
      }
    } finally {
      if (releaseBed) releaseBed();
      if (authRunDir && !o.keepAuthClone) {
        try { removeOwnedRun(authDir, authRunDir); } catch (e) { console.error(`  (auth clone left in place: ${e.message})`); }
      }
      if (authRunDir && o.keepAuthClone) summary.authCloneKept = authRunDir;
    }
  }

  summary.finishedAt = new Date().toISOString();
  summary.wallMs = Date.now() - started.getTime();
  summary.exitCode = exitCode;
  writeSummary();
  const lane = (l) => `${l.status}${l.counts ? " " + Object.entries(l.counts).map(([k, v]) => `${v} ${k}`).join(", ") : ""}${l.reason ? ` — ${l.reason}` : ""}${l.note ? ` — ${l.note}` : ""}`;
  console.log(`\n■ ${app.id} [${env}] ${runId}: exit ${exitCode} (${(summary.wallMs / 1000).toFixed(1)}s)\n  REST    ${lane(summary.lanes.rest)}\n  BROWSER ${lane(summary.lanes.browser)}\n  summary ${path.join(runDir, "summary.json")}\n`);
  process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e?.stack || e); process.exit(1); });
}

#!/usr/bin/env bash
# Batched, evidence-backed scenario runner.
#
# A full-suite `npx playwright test scenarios/<app>` in one shot has two failure
# modes this script exists to kill: (1) a wedged browser holding the persistent
# profile / a stale Singleton* lock poisons every browser-lane spec after the first
# crash — matched by --user-data-dir, since the launcher prefers the INSTALLED Chrome,
# and (2) a run that silently skipped or double-ran a spec still "looks green".
# So: plan the run up front, execute one small batch at a time (browser lanes get
# a clean browser), and refuse to call the run good until the merged evidence
# proves every spec on disk executed exactly once with zero failures.
#
#   scripts/run-batches.sh <scenarioDir> --plan [--run-id R]
#       Enumerate *.spec.ts (sorted), classify lanes (grep -l 'fixtures/forge'
#       = browser, else rest), order: deploy-state-guard.spec.ts first if
#       present, then rest-lane batches (trigger-sensitive sealed-*/violation-*
#       specs lead the FIRST rest batch), then browser-lane batches; <=9 specs
#       per batch. Writes evidence/<app>/<run-id>/plan.json.
#
#   scripts/run-batches.sh <scenarioDir> --batch N --run-id R
#       Run ONE batch in the foreground. Browser-lane batches acquire the shared
#       profile reservation through the central fixture. Contention stops the
#       launch without killing a sibling or deleting its profile markers. Emits
#       line output + JSON report to evidence/<app>/<R>/batch-N.json and
#       records the exit code in batch-N.exit. Exits with playwright's code.
#
#   scripts/run-batches.sh <scenarioDir> --finalize --run-id R
#       Merge batch-*.json and cross-check: (a) union of executed spec files ==
#       current ls of the dir, (b) every spec has >=1 executed test, (c) no
#       spec ran in two batches, (d) every batch exited 0 with 0 failed tests.
#       Writes summary.md + summary.json; non-zero exit unless everything holds.
#
# HARNESS_EVIDENCE_ROOT overrides the evidence root (offline tests only).
set -uo pipefail

usage() {
  echo "usage: $0 <scenarioDir> --plan [--run-id R]" >&2
  echo "       $0 <scenarioDir> --batch N --run-id R" >&2
  echo "       $0 <scenarioDir> --finalize --run-id R" >&2
  exit 2
}

[ $# -ge 2 ] || usage
SCEN_ARG="$1"; shift
[ -d "$SCEN_ARG" ] || { echo "scenario dir not found: $SCEN_ARG" >&2; exit 2; }
SCEN_DIR="$(cd "$SCEN_ARG" && pwd)"

MODE="" BATCH_N="" RUN_ID=""
while [ $# -gt 0 ]; do
  case "$1" in
    --plan) MODE="plan" ;;
    --batch) MODE="batch"; BATCH_N="${2:-}"; [ -n "$BATCH_N" ] || usage; shift ;;
    --finalize) MODE="finalize" ;;
    --run-id) RUN_ID="${2:-}"; [ -n "$RUN_ID" ] || usage; shift ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
  shift
done
[ -n "$MODE" ] || usage

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
APP="$(basename "$SCEN_DIR")"
EV_ROOT="${HARNESS_EVIDENCE_ROOT:-$ROOT/evidence}"

# ---------------------------------------------------------------- plan -------
if [ "$MODE" = "plan" ]; then
  [ -n "$RUN_ID" ] || RUN_ID="$(date +%Y%m%d-%H%M%S)"
  EV_DIR="$EV_ROOT/$APP/$RUN_ID"
  mkdir -p "$EV_DIR"

  SPEC_LIST="$(cd "$SCEN_DIR" && ls -- *.spec.ts 2>/dev/null | LC_ALL=C sort)"
  [ -n "$SPEC_LIST" ] || { echo "no *.spec.ts in $SCEN_DIR" >&2; exit 2; }
  # Browser lane = imports the persistent-context fixture; everything else is
  # plain @playwright/test REST-lane and safe to run without a browser reset.
  BROWSER_LIST="$(cd "$SCEN_DIR" && grep -l 'fixtures/forge' -- *.spec.ts 2>/dev/null || true)"

  SPEC_LIST="$SPEC_LIST" BROWSER_LIST="$BROWSER_LIST" RUN_ID="$RUN_ID" \
  PLAN_PATH="$EV_DIR/plan.json" node -e '
    const fs = require("fs");
    const MAX = 9;
    const specs = process.env.SPEC_LIST.split("\n").filter(Boolean);
    const browser = new Set(process.env.BROWSER_LIST.split("\n").filter(Boolean));
    const GUARD = "deploy-state-guard.spec.ts";
    const chunk = (a) => { const o = []; for (let i = 0; i < a.length; i += MAX) o.push(a.slice(i, i + MAX)); return o; };
    const rest = specs.filter((s) => s !== GUARD && !browser.has(s));
    const brow = specs.filter((s) => s !== GUARD && browser.has(s));
    // Trigger-sensitive specs seed seals the app 5-min sweeps / late trashed
    // events can chew on — run them at the FRONT of the rest lane, before the
    // slow browser batches widen the window for cross-talk.
    const trig = rest.filter((s) => /^(sealed-|violation-)/.test(s));
    const calm = rest.filter((s) => !/^(sealed-|violation-)/.test(s));
    const raw = [];
    if (specs.includes(GUARD)) raw.push({ lane: browser.has(GUARD) ? "browser" : "rest", specs: [GUARD] });
    for (const c of chunk([...trig, ...calm])) raw.push({ lane: "rest", specs: c });
    for (const c of chunk(brow)) raw.push({ lane: "browser", specs: c });
    const plan = {
      runId: process.env.RUN_ID,
      batches: raw.map((b, i) => ({ n: i + 1, lane: b.lane, specs: b.specs })),
      specCount: specs.length,
      generatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(process.env.PLAN_PATH, JSON.stringify(plan, null, 2) + "\n");
    for (const b of plan.batches)
      console.log("batch " + b.n + " [" + b.lane + "] " + b.specs.length + " specs: " + b.specs.join(" "));
    console.log("specCount: " + plan.specCount);
  ' || exit 1
  echo "plan: $EV_DIR/plan.json"
  exit 0
fi

# ---------------------------------------------------------------- batch ------
if [ "$MODE" = "batch" ]; then
  [ -n "$RUN_ID" ] || { echo "--batch requires --run-id" >&2; usage; }
  case "$BATCH_N" in (*[!0-9]*|"") echo "--batch N must be a number, got: $BATCH_N" >&2; exit 2 ;; esac
  EV_DIR="$EV_ROOT/$APP/$RUN_ID"
  PLAN="$EV_DIR/plan.json"
  [ -f "$PLAN" ] || { echo "no plan at $PLAN — run --plan first" >&2; exit 2; }

  # shellcheck disable=SC1091
  [ -f .env ] && set -a && . ./.env && set +a

  BATCH_INFO="$(PLAN="$PLAN" N="$BATCH_N" node -e '
    const fs = require("fs");
    const plan = JSON.parse(fs.readFileSync(process.env.PLAN, "utf8"));
    const b = plan.batches.find((x) => x.n === parseInt(process.env.N, 10));
    if (!b) { console.error("batch " + process.env.N + " not in plan (have 1.." + plan.batches.length + ")"); process.exit(3); }
    console.log(b.lane); for (const s of b.specs) console.log(s);
  ')" || exit 2
  LANE="$(printf '%s\n' "$BATCH_INFO" | head -1)"
  SPECS=()
  while IFS= read -r s; do [ -n "$s" ] && SPECS+=("$SCEN_DIR/$s"); done \
    < <(printf '%s\n' "$BATCH_INFO" | tail -n +2)
  [ ${#SPECS[@]} -gt 0 ] || { echo "batch $BATCH_N has no specs" >&2; exit 2; }

  echo "=== batch $BATCH_N [$LANE] — ${#SPECS[@]} specs ==="
  # Browser ownership belongs exclusively to forge/browser.ts. A concurrent or
  # unclean profile returns a typed resource error; never kill sibling browsers or
  # delete Chrome markers here. REST batches need no profile operation.

  PLAYWRIGHT_JSON_OUTPUT_NAME="$EV_DIR/batch-$BATCH_N.json" \
    npx playwright test "${SPECS[@]}" --project=chromium --reporter=line,json
  RC=$?
  echo "$RC" > "$EV_DIR/batch-$BATCH_N.exit"
  echo "=== batch $BATCH_N exit $RC — report: $EV_DIR/batch-$BATCH_N.json ==="
  exit "$RC"
fi

# ---------------------------------------------------------------- finalize ---
[ -n "$RUN_ID" ] || { echo "--finalize requires --run-id" >&2; usage; }
EV_DIR="$EV_ROOT/$APP/$RUN_ID"
[ -f "$EV_DIR/plan.json" ] || { echo "no plan at $EV_DIR/plan.json" >&2; exit 2; }

EV_DIR="$EV_DIR" SCEN_DIR="$SCEN_DIR" RUN_ID="$RUN_ID" APP="$APP" node -e '
  const fs = require("fs"), path = require("path");
  const evDir = process.env.EV_DIR, scenDir = process.env.SCEN_DIR;
  const plan = JSON.parse(fs.readFileSync(path.join(evDir, "plan.json"), "utf8"));
  const current = fs.readdirSync(scenDir).filter((f) => f.endsWith(".spec.ts")).sort();

  // ---- gather per-batch evidence -----------------------------------------
  const perBatch = [];
  const specSeen = new Map(); // basename -> {batches:[], executed, failed, flaky, skipped}
  const rec = (f) => {
    if (!specSeen.has(f)) specSeen.set(f, { batches: [], executed: 0, failed: 0, flaky: 0, skipped: 0 });
    return specSeen.get(f);
  };
  for (const pb of plan.batches) {
    const jsonPath = path.join(evDir, "batch-" + pb.n + ".json");
    const exitPath = path.join(evDir, "batch-" + pb.n + ".exit");
    const entry = { n: pb.n, lane: pb.lane, planned: pb.specs.length, present: fs.existsSync(jsonPath),
                    exit: null, stats: null, specFiles: [] };
    if (fs.existsSync(exitPath)) {
      const v = parseInt(fs.readFileSync(exitPath, "utf8").trim(), 10);
      entry.exit = Number.isNaN(v) ? null : v;
    }
    if (entry.present) {
      let repRaw = null;
      try { repRaw = JSON.parse(fs.readFileSync(jsonPath, "utf8")); } catch (e) { entry.parseError = String(e); }
      if (repRaw) {
        entry.stats = repRaw.stats || {};
        const files = new Set();
        const walk = (suite, inheritedFile) => {
          const file = suite.file || inheritedFile;
          for (const spec of suite.specs || []) {
            const f = path.basename(spec.file || file || "unknown");
            files.add(f);
            const r = rec(f);
            if (!r.batches.includes(pb.n)) r.batches.push(pb.n);
            for (const t of spec.tests || []) {
              const executed = (t.results || []).some((res) => res.status && res.status !== "skipped");
              if (executed) r.executed++;
              if (t.status === "unexpected") r.failed++;
              else if (t.status === "flaky") r.flaky++;
              else if (!executed) r.skipped++;
            }
          }
          for (const s of suite.suites || []) walk(s, file);
        };
        for (const s of repRaw.suites || []) walk(s, null);
        entry.specFiles = [...files].sort();
      }
    }
    perBatch.push(entry);
  }

  // ---- cross-checks -------------------------------------------------------
  const checks = [];
  const add = (id, name, ok, detail) => checks.push({ id, name, ok, detail });

  // (a) union of executed spec files == current listing of the dir
  const executedFiles = [...specSeen.keys()].sort();
  const missing = current.filter((s) => !executedFiles.includes(s));
  const extra = executedFiles.filter((s) => !current.includes(s));
  add("a", "executed union == dir listing", missing.length === 0 && extra.length === 0,
      (missing.length ? "missing (never ran): " + missing.join(", ") : "") +
      (missing.length && extra.length ? "; " : "") +
      (extra.length ? "extra (ran but not on disk): " + extra.join(", ") : "") ||
      current.length + " specs, all accounted for");

  // (b) every spec has at least one executed (non-skipped) test
  const noTests = current.filter((s) => !specSeen.has(s) || specSeen.get(s).executed < 1);
  add("b", "every spec >=1 executed test", noTests.length === 0,
      noTests.length ? "0 executed tests: " + noTests.join(", ") : "all specs executed tests");

  // (c) no spec ran in two batches (check the evidence AND the plan)
  const dupRun = [...specSeen.entries()].filter(([, v]) => v.batches.length > 1)
    .map(([f, v]) => f + " (batches " + v.batches.join(",") + ")");
  const planFlat = plan.batches.flatMap((b) => b.specs);
  const dupPlan = planFlat.filter((s, i) => planFlat.indexOf(s) !== i);
  add("c", "no spec in two batches", dupRun.length === 0 && dupPlan.length === 0,
      (dupRun.length ? "ran twice: " + dupRun.join("; ") : "") +
      (dupPlan.length ? " planned twice: " + [...new Set(dupPlan)].join(", ") : "") || "no duplicates");

  // (d) every planned batch present, exited 0, zero failed tests; no stray batch files
  const strays = fs.readdirSync(evDir).filter((f) => /^batch-\d+\.json$/.test(f))
    .map((f) => parseInt(f.match(/\d+/)[0], 10))
    .filter((n) => !plan.batches.some((b) => b.n === n));
  const dBad = [];
  for (const e of perBatch) {
    if (!e.present) dBad.push("batch " + e.n + ": no report");
    else if (e.parseError) dBad.push("batch " + e.n + ": unreadable report");
    if (e.exit === null) dBad.push("batch " + e.n + ": no exit record");
    else if (e.exit !== 0) dBad.push("batch " + e.n + ": exit " + e.exit);
    const un = e.stats ? (e.stats.unexpected || 0) : 0;
    if (un > 0) dBad.push("batch " + e.n + ": " + un + " failed test(s)");
  }
  if (strays.length) dBad.push("stray batch files not in plan: " + strays.join(", "));
  const failedSpecs = [...specSeen.entries()].filter(([, v]) => v.failed > 0).map(([f]) => f);
  if (failedSpecs.length) dBad.push("specs with failures: " + failedSpecs.join(", "));
  add("d", "all batches exit 0, zero failed tests", dBad.length === 0,
      dBad.length ? dBad.join("; ") : perBatch.length + " batches, all clean");

  const verdict = checks.every((c) => c.ok) ? "PASS" : "FAIL";

  // ---- summary.json -------------------------------------------------------
  const specRows = current.map((s) => {
    const v = specSeen.get(s);
    const status = !v || v.executed < 1 ? "NOT-EXECUTED" : v.failed > 0 ? "FAIL" : v.flaky > 0 ? "FLAKY-PASS" : "PASS";
    return { spec: s, batch: v ? v.batches.join(",") : "-", executed: v ? v.executed : 0,
             failed: v ? v.failed : 0, flaky: v ? v.flaky : 0, status };
  });
  const summary = {
    runId: process.env.RUN_ID, app: process.env.APP, verdict,
    planGeneratedAt: plan.generatedAt, finalizedAt: new Date().toISOString(),
    specCount: current.length, plannedSpecCount: plan.specCount,
    batches: perBatch.map(({ specFiles, ...e }) => ({ ...e, specFiles })),
    specs: specRows, checks,
  };
  fs.writeFileSync(path.join(evDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  // ---- summary.md ---------------------------------------------------------
  const fmtT = (e) => (e.stats && e.stats.startTime) ? e.stats.startTime : "-";
  const fmtD = (e) => (e.stats && e.stats.duration != null) ? (e.stats.duration / 1000).toFixed(1) + "s" : "-";
  const md = [];
  md.push("# Batch run summary — " + process.env.APP + " / " + process.env.RUN_ID);
  md.push("");
  md.push("- Verdict: **" + verdict + "**");
  md.push("- Plan generated: " + (plan.generatedAt || "-"));
  md.push("- Finalized: " + summary.finalizedAt);
  md.push("- Specs on disk: " + current.length + " (planned: " + plan.specCount + ")");
  md.push("");
  md.push("## Batches");
  md.push("");
  md.push("| n | lane | planned | executed files | exit | failed | started | duration |");
  md.push("|---|------|---------|----------------|------|--------|---------|----------|");
  for (const e of perBatch)
    md.push("| " + e.n + " | " + e.lane + " | " + e.planned + " | " + e.specFiles.length + " | " +
            (e.exit === null ? "?" : e.exit) + " | " + (e.stats ? (e.stats.unexpected || 0) : "?") +
            " | " + fmtT(e) + " | " + fmtD(e) + " |");
  md.push("");
  md.push("## Specs");
  md.push("");
  md.push("| spec | batch | tests run | failed | status |");
  md.push("|------|-------|-----------|--------|--------|");
  for (const r of specRows)
    md.push("| " + r.spec + " | " + r.batch + " | " + r.executed + " | " + r.failed + " | " + r.status + " |");
  md.push("");
  md.push("## Cross-checks");
  md.push("");
  md.push("| check | verdict | detail |");
  md.push("|-------|---------|--------|");
  for (const c of checks)
    md.push("| (" + c.id + ") " + c.name + " | " + (c.ok ? "PASS" : "FAIL") + " | " + c.detail + " |");
  md.push("");
  md.push("Final verdict: **" + verdict + "**");
  md.push("");
  fs.writeFileSync(path.join(evDir, "summary.md"), md.join("\n"));

  for (const c of checks) console.log("(" + c.id + ") " + c.name + ": " + (c.ok ? "PASS" : "FAIL — " + c.detail));
  console.log("verdict: " + verdict);
  process.exit(verdict === "PASS" ? 0 : 1);
'
RC=$?
echo "summary: $EV_DIR/summary.md"
exit "$RC"

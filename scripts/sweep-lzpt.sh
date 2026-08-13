#!/usr/bin/env bash
# Full LZPT regression sweep that is actually trustworthy.
#
# `npx playwright test scenarios/lz-ppm/journey-*lzpt*` in one go is NOT a valid
# regression run. Roughly a third of the journeys mutate the bed — they drag bars,
# set buffers, draw links, and journey-apply-write genuinely WRITES to Jira. Each
# self-cleans in isolation, but serially they ACCUMULATE: a run that ended 28/33
# had every one of its five failures pass on a clean bed moments later. The sweep
# was reporting bed drift as app regressions, which is worse than not running it.
#
# So: restore the bed between journeys, and re-check it at the end. Slower, and
# the only version whose red means something.
#
#   ./scripts/sweep-lzpt.sh            # every LZPT journey
#   ./scripts/sweep-lzpt.sh cascade    # only those matching a substring
set -uo pipefail
cd "$(dirname "$0")/.."

FILTER="${1:-}"
PLAN_ID="${LZPT_PLAN_ID:-}"
PASS=(); FAIL=()

# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a

reindex() {
  [ -n "$PLAN_ID" ] || return 0
  # Drafts SURVIVE reloads and re-indexes by design (autosave), so an aborted
  # journey's draft silently contaminates every later one — a real sweep once
  # cascaded 4 failures off a single stale 39-change draft. Clear them first.
  curl -s -H "Authorization: Bearer $HARNESS_SECRET" \
       "$LZ_PPM_TESTHOOK_URL?what=clearDrafts&planId=$PLAN_ID" >/dev/null || true
  curl -s -H "Authorization: Bearer $HARNESS_SECRET" \
       "$LZ_PPM_TESTHOOK_URL?what=refreshPlan&planId=$PLAN_ID" >/dev/null || true
}

restore_bed() {
  npx playwright test --project=chromium scenarios/lz-ppm/_cleanup-lzpt.spec.ts >/dev/null 2>&1
  # Two passes + a re-index between them: the plan-protection trigger validates a
  # date edit against the KVS index, so a restored issue only sticks once its
  # PREDECESSOR has been restored and re-indexed.
  for _ in 1 2; do
    RESTORE=1 npx playwright test --project=chromium scenarios/lz-ppm/_restore-lzpt-bed.spec.ts >/dev/null 2>&1
    reindex
  done
}

# Resolve the plan id once so the re-index between passes can run.
if [ -z "$PLAN_ID" ] && [ -n "${LZ_PPM_TESTHOOK_URL:-}" ]; then
  PLAN_ID=$(curl -s -H "Authorization: Bearer $HARNESS_SECRET" "$LZ_PPM_TESTHOOK_URL?what=plans" \
    | python3 -c "import json,sys;p=json.load(sys.stdin).get('plans') or [];print(next((x['id'] for x in p if 'LZPT' in x.get('name','')), ''))" 2>/dev/null || echo "")
fi
echo "plan: ${PLAN_ID:-<unresolved — restores will not re-index>}"

echo "=== restoring the bed before we start ==="
restore_bed

for spec in scenarios/lz-ppm/journey-*lzpt*.spec.ts; do
  [ -n "$FILTER" ] && [[ "$spec" != *"$FILTER"* ]] && continue
  name=$(basename "$spec" .spec.ts)
  printf '%-42s ' "$name"
  if npx playwright test --project=chromium "$spec" >/tmp/lzpt-sweep-last.log 2>&1; then
    echo "PASS"; PASS+=("$name")
  else
    echo "FAIL"; FAIL+=("$name")
    grep -E "Error:|Expected:|Received:" /tmp/lzpt-sweep-last.log | head -4 | sed 's/^/      /'
  fi
  restore_bed
done

echo
echo "=== ${#PASS[@]} passed, ${#FAIL[@]} failed ==="
[ ${#FAIL[@]} -gt 0 ] && printf 'failed: %s\n' "${FAIL[*]}"

echo "=== final bed check ==="
npx playwright test --project=chromium scenarios/lz-ppm/_restore-lzpt-bed.spec.ts 2>&1 \
  | grep -E "matches the seed|DRIFT DETECTED" || true

[ ${#FAIL[@]} -eq 0 ]

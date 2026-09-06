// ../lz-ppm-forge/static/ppm-ui/src/utils/target-scope.js
function planLeafKeys(issues) {
  const parents = new Set(issues.map((i) => i.parentKey).filter(Boolean));
  return issues.filter((i) => !parents.has(i.key)).map((i) => i.key).sort();
}
var epicIdentity = (issue) => String(issue.id || issue.key);
var isEpic = (issue) => issue.hierarchyLevel === 1 || String(issue.type).toLowerCase() === "epic";
var sameKeys = (a, b) => {
  const sorted = [...b].sort();
  return a.length === b.length && [...a].sort().every((key, n) => key === sorted[n]);
};
function resolveTargetScope(target, issues, { refresh = false } = {}) {
  const scope = target?.scope || { type: "plan" };
  const allLeaves = planLeafKeys(issues);
  let members = [];
  let label = "Whole plan";
  const fail = (reason) => ({ available: false, reason, memberKeys: members, memberCount: members.length, scopeLabel: label });
  if (scope.type === "plan") members = allLeaves;
  else if (scope.type === "epic") {
    const epic = issues.find((i) => epicIdentity(i) === String(scope.id) && isEpic(i));
    label = epic ? `${epic.key} \xB7 ${epic.summary || "Epic"}` : "Deleted or missing epic";
    if (!epic) return fail("The scoped epic is no longer in this plan. Edit the target scope.");
    const byKey = new Map(issues.map((i) => [i.key, i]));
    members = allLeaves.filter((key) => {
      const seen = /* @__PURE__ */ new Set();
      let issue = byKey.get(key);
      while (issue?.parentKey && !seen.has(issue.parentKey)) {
        if (issue.parentKey === epic.key) return true;
        seen.add(issue.parentKey);
        issue = byKey.get(issue.parentKey);
      }
      return false;
    });
  } else if (scope.type === "release") {
    label = "Release";
    const leaves = new Set(allLeaves);
    if (issues.some((i) => leaves.has(i.key) && !Array.isArray(i.fixVersions))) return fail("Release membership is unavailable for some tasks. Re-index the plan before forecasting this target.");
    const version = issues.flatMap((i) => i.fixVersions || []).find((v) => String(v.id) === String(scope.id));
    label = version?.name || "Deleted or missing release";
    members = issues.filter((i) => leaves.has(i.key) && (i.fixVersions || []).some((v) => String(v.id) === String(scope.id))).map((i) => i.key).sort();
    if (!version) return fail("The scoped release has no current members in this plan. Edit the target scope.");
  } else return fail("Unsupported target scope. Edit the target.");
  if (!members.length) return fail("This target scope has no tasks. Choose a scope with leaf tasks.");
  if (scope.type !== "plan" && !refresh && (!Array.isArray(scope.memberKeys) || !sameKeys(scope.memberKeys, members))) return fail("Scope membership changed. Refresh scope in Targets before using this forecast.");
  return { available: true, reason: null, memberKeys: members, memberCount: members.length, scopeLabel: label };
}

// ../lz-ppm-forge/static/ppm-ui/src/utils/date-utils.js
var DEFAULT_WORKING_DAYS = /* @__PURE__ */ new Set([1, 2, 3, 4, 5]);
function parseDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
function formatDate(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function isWorkingDay(date, ctx) {
  const wd = ctx?.workingDays || DEFAULT_WORKING_DAYS;
  const dow = date.getUTCDay();
  if (!wd.has(dow)) return false;
  if (ctx?.holidays && ctx.holidays.has(formatDate(date))) return false;
  return true;
}
function getNextWorkingDay(date, ctx) {
  const d = new Date(date.getTime());
  let guard = 0;
  while (!isWorkingDay(d, ctx) && guard < 30) {
    d.setUTCDate(d.getUTCDate() + 1);
    guard++;
  }
  return d;
}
function addWorkingDays(startDate, workingDays, ctx) {
  if (workingDays <= 0) return new Date(startDate.getTime());
  const d = new Date(startDate.getTime());
  let remaining = workingDays - 1;
  let guard = 0;
  while (remaining > 0 && guard < 5e3) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkingDay(d, ctx)) remaining--;
    guard++;
  }
  return d;
}
function getRequiredSuccessorStart(predDue, ctx) {
  if (!predDue) return null;
  return getNextWorkingDay(new Date(predDue.getTime() + 864e5), ctx);
}
function getRequiredSuccessorStartWithLag(predDue, lag, ctx) {
  const base = getRequiredSuccessorStart(predDue, ctx);
  if (!base || !lag || lag <= 0) return base;
  return addWorkingDays(base, lag + 1, ctx);
}
function workingDaysBetween(start, end, ctx) {
  if (!start || !end) return null;
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e || e < s) return 0;
  let count = 0;
  const d = new Date(s.getTime());
  while (d <= e) {
    if (isWorkingDay(d, ctx)) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}
function buildWorkingDayCtx(planCalendar) {
  if (!planCalendar) return null;
  const holidayDates = (planCalendar.holidays || []).map((h) => typeof h === "string" ? h : h.date);
  return {
    holidays: new Set(holidayDates),
    workingDays: new Set(planCalendar.workingDays || [1, 2, 3, 4, 5])
  };
}

// ../lz-ppm-forge/static/ppm-ui/src/utils/issue-utils.js
function getAffectedChain(issueKey, issuesMap, visited = /* @__PURE__ */ new Set()) {
  if (visited.has(issueKey)) return [];
  visited.add(issueKey);
  const affected = [issueKey];
  const issue = issuesMap.get(issueKey);
  if (!issue?.successors) return affected;
  for (const succKey of issue.successors) {
    affected.push(...getAffectedChain(succKey, issuesMap, visited));
  }
  return affected;
}
function buildIssuesMap(issues) {
  return new Map(issues.map((i) => [i.key, i]));
}

// ../lz-ppm-forge/static/ppm-ui/src/hooks/cascade-core.js
function effectiveDuration(issue, ctx) {
  const current = Number(issue.duration);
  if (current && current > 0) return current;
  if (isDeclaredZeroDuration(issue)) return 0;
  const stored = Number(issue._original?.duration);
  if (stored && stored > 0) return stored;
  const s = issue._original?.startDate || issue.startDate;
  const d = issue._original?.dueDate || issue.dueDate;
  if (s && d) return Math.max(workingDaysBetween(s, d, ctx) || 1, 1);
  return 1;
}
function isDeclaredZeroDuration(issue) {
  const cur = issue.duration;
  const orig = issue._original?.duration;
  if (cur != null && Number(cur) > 0) return false;
  return cur != null && Number(cur) === 0 || orig != null && Number(orig) === 0;
}
function requiredStartFromPreds(issue, updatedMap, ctx) {
  const preds = issue.predecessors || [];
  const lags = issue.predecessorLags || null;
  let required = null;
  for (const predKey of preds) {
    const pred = updatedMap.get(predKey);
    if (!pred?.dueDate) continue;
    const predDue = parseDate(pred.dueDate);
    if (!predDue) continue;
    const lag = lags ? lags[predKey] || 0 : 0;
    const rs = getRequiredSuccessorStartWithLag(predDue, lag, ctx);
    if (rs && (!required || rs > required)) required = rs;
  }
  return required;
}
function rollupParents(updatedMap, changedKeys, workingDayCtx, cascadedOut) {
  const childrenByParent = /* @__PURE__ */ new Map();
  for (const [key, issue] of updatedMap) {
    if (issue.parentKey && updatedMap.has(issue.parentKey)) {
      const arr = childrenByParent.get(issue.parentKey) || [];
      arr.push(key);
      childrenByParent.set(issue.parentKey, arr);
    }
  }
  const visited = /* @__PURE__ */ new Set();
  const ordered = [];
  const collect = (key) => {
    const issue = updatedMap.get(key);
    if (!issue?.parentKey) return;
    const parentKey = issue.parentKey;
    if (visited.has(parentKey)) return;
    visited.add(parentKey);
    ordered.push(parentKey);
    collect(parentKey);
  };
  for (const k of changedKeys) collect(k);
  for (const parentKey of ordered) {
    const parent = updatedMap.get(parentKey);
    if (!parent) continue;
    const childKeys = childrenByParent.get(parentKey) || [];
    if (childKeys.length === 0) continue;
    let earliestStart = null;
    let latestDue = null;
    for (const ck of childKeys) {
      const child = updatedMap.get(ck);
      if (!child) continue;
      const cs = parseDate(child.startDate);
      const cd = parseDate(child.dueDate);
      if (cs && (!earliestStart || cs < earliestStart)) earliestStart = cs;
      if (cd && (!latestDue || cd > latestDue)) latestDue = cd;
    }
    if (!earliestStart && !latestDue) continue;
    let snappedStart = earliestStart;
    if (snappedStart && workingDayCtx) {
      snappedStart = getNextWorkingDay(snappedStart, workingDayCtx);
    }
    const newStart = snappedStart ? formatDate(snappedStart) : parent.startDate;
    const newDue = latestDue ? formatDate(latestDue) : parent.dueDate;
    let newDuration = parent.duration;
    if (snappedStart && latestDue) {
      newDuration = workingDaysBetween(formatDate(snappedStart), formatDate(latestDue), workingDayCtx) || 1;
    }
    if (newStart !== parent.startDate || newDue !== parent.dueDate || newDuration !== parent.duration) {
      updatedMap.set(parentKey, { ...parent, startDate: newStart, dueDate: newDue, duration: newDuration });
      cascadedOut.add(parentKey);
    }
  }
}
function cascadeAll(issues, workingDayCtx) {
  if (!workingDayCtx) return { issues, cascadedKeys: /* @__PURE__ */ new Set() };
  const updatedMap = buildIssuesMap(issues);
  const newCascaded = /* @__PURE__ */ new Set();
  for (const [key, issue] of updatedMap) {
    if (!issue.startDate) continue;
    const start = parseDate(issue.startDate);
    if (!start) continue;
    const snappedStart = getNextWorkingDay(start, workingDayCtx);
    const snappedStartStr = formatDate(snappedStart);
    if (snappedStartStr !== issue.startDate) {
      const dur = effectiveDuration(issue, workingDayCtx);
      issue.startDate = snappedStartStr;
      issue.dueDate = formatDate(addWorkingDays(snappedStart, Number(dur), workingDayCtx));
      issue.duration = dur;
      newCascaded.add(key);
      updatedMap.set(key, issue);
    } else if (issue.dueDate) {
      const due = parseDate(issue.dueDate);
      if (due) {
        const snappedDue = getNextWorkingDay(due, workingDayCtx);
        if (formatDate(snappedDue) !== issue.dueDate) {
          issue.dueDate = formatDate(snappedDue);
          issue.duration = workingDaysBetween(issue.startDate, issue.dueDate, workingDayCtx) || 1;
          newCascaded.add(key);
          updatedMap.set(key, issue);
        }
      }
    }
  }
  const allKeys = [...updatedMap.keys()];
  const roots = allKeys.filter((k) => {
    const iss = updatedMap.get(k);
    return !iss.predecessors || iss.predecessors.length === 0;
  });
  const MAX_SWEEPS = allKeys.length + 2;
  let sweepChanged = true;
  for (let sweep = 0; sweepChanged && sweep < MAX_SWEEPS; sweep++) {
    sweepChanged = false;
    for (const rootKey of roots) {
      const chain = getAffectedChain(rootKey, updatedMap);
      for (const key of chain) {
        if (key === rootKey) continue;
        const issue = updatedMap.get(key);
        if (!issue) continue;
        const predecessors = issue.predecessors || [];
        if (predecessors.length === 0) continue;
        const requiredStart = requiredStartFromPreds(issue, updatedMap, workingDayCtx);
        if (!requiredStart) continue;
        const requiredStartStr = formatDate(requiredStart);
        if (issue.startDate === requiredStartStr) continue;
        const dur = effectiveDuration(issue, workingDayCtx);
        issue.startDate = requiredStartStr;
        if (issue.buffer === "Yes") {
          const origDue = parseDate(issue._original?.dueDate || issue.dueDate);
          if (origDue && requiredStart <= origDue) {
            issue.duration = workingDaysBetween(requiredStartStr, formatDate(origDue), workingDayCtx) || 1;
            issue.dueDate = formatDate(origDue);
          } else if (origDue) {
            issue.dueDate = requiredStartStr;
            issue.duration = 1;
          } else {
            const declaredDur = Number(issue._original?.duration || issue.duration) || 0;
            if (declaredDur > 0) {
              issue.duration = declaredDur;
              issue.dueDate = formatDate(addWorkingDays(requiredStart, declaredDur, workingDayCtx));
            } else {
              issue.dueDate = requiredStartStr;
              issue.duration = 1;
            }
          }
        } else {
          issue.duration = Number(dur);
          issue.dueDate = formatDate(addWorkingDays(requiredStart, Number(dur), workingDayCtx));
        }
        newCascaded.add(key);
        updatedMap.set(key, issue);
        sweepChanged = true;
      }
    }
  }
  rollupParents(updatedMap, new Set(newCascaded), workingDayCtx, newCascaded);
  const updatedIssues = issues.map((iss) => updatedMap.get(iss.key) || iss);
  return { issues: updatedIssues, cascadedKeys: newCascaded };
}

// ../lz-ppm-forge/static/ppm-ui/src/utils/schedule-forecast-inputs.js
function isStrictScheduleDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && formatDate(parseDate(value)) === value;
}
function forecastCoverage(issues) {
  const parents = new Set(issues.map((i) => i.parentKey).filter(Boolean));
  const coverage = {
    totalLeaves: 0,
    datedLeaves: 0,
    parentCount: 0,
    uncertainCount: 0,
    doneCount: 0,
    bufferCount: 0,
    milestoneCount: 0,
    missingDateKeys: [],
    invalidDateKeys: [],
    invertedDateKeys: [],
    baselineDateKeys: []
  };
  for (const issue of issues) {
    const isParent = parents.has(issue.key);
    if (isParent) coverage.parentCount++;
    else coverage.totalLeaves++;
    const { startDate: start, dueDate: due } = issue;
    const invalid = start != null && start !== "" && !isStrictScheduleDate(start) || due != null && due !== "" && !isStrictScheduleDate(due);
    const inverted = !invalid && start && due && start > due;
    if (invalid) coverage.invalidDateKeys.push(issue.key);
    else if (inverted) coverage.invertedDateKeys.push(issue.key);
    else if (!isParent && (!start || !due)) coverage.missingDateKeys.push(issue.key);
    else if (!isParent) {
      coverage.datedLeaves++;
      if (issue.statusCategory === "done") coverage.doneCount++;
      else if (issue.buffer === "Yes") coverage.bufferCount++;
      else if (isDeclaredZeroDuration(issue)) coverage.milestoneCount++;
      else coverage.uncertainCount++;
    }
    const baselineDue = issue._original?.dueDate;
    let invalidBaseline = issue.buffer === "Yes" && baselineDue && !isStrictScheduleDate(baselineDue);
    const usesSpan = !(Number(issue.duration) > 0) && !(Number(issue._original?.duration) > 0) && !isDeclaredZeroDuration(issue);
    if (usesSpan) {
      const s = issue._original?.startDate || start;
      const d = baselineDue || due;
      if (s && d && (!isStrictScheduleDate(s) || !isStrictScheduleDate(d) || s > d)) invalidBaseline = true;
    }
    if (invalidBaseline && !invalid && !inverted) coverage.baselineDateKeys.push(issue.key);
  }
  return { ...coverage, unavailable: ["missingDateKeys", "invalidDateKeys", "invertedDateKeys", "baselineDateKeys"].some((field) => coverage[field].length > 0) };
}

// ../lz-ppm-forge/static/ppm-ui/src/utils/schedule-simulation.js
function dayDiff(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 864e5);
}
function mulberry32(seed) {
  let a = seed >>> 0 || 1;
  return function next() {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function triangular(u, lo, mode, hi) {
  if (hi <= lo) return lo;
  const f = (mode - lo) / (hi - lo);
  if (u < f) return lo + Math.sqrt(u * (hi - lo) * (mode - lo));
  return hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
}
var UNCERTAINTY = {
  low: { key: "low", label: "Low \u221210% / +15%", shrink: 0.1, stretch: 0.15 },
  medium: { key: "medium", label: "Medium \u221215% / +35%", shrink: 0.15, stretch: 0.35 },
  high: { key: "high", label: "High \u221220% / +60%", shrink: 0.2, stretch: 0.6 }
};
function parentKeySet(issues) {
  const s = /* @__PURE__ */ new Set();
  for (const i of issues) if (i.parentKey) s.add(i.parentKey);
  return s;
}
function uncertainLeaves(issues) {
  const parents = parentKeySet(issues);
  return issues.filter((i) => !parents.has(i.key) && isStrictScheduleDate(i.startDate) && isStrictScheduleDate(i.dueDate) && i.startDate <= i.dueDate && i.buffer !== "Yes" && i.statusCategory !== "done" && !isDeclaredZeroDuration(i));
}
function planFinish(issues) {
  const parents = parentKeySet(issues);
  let max = null;
  for (const i of issues) {
    if (parents.has(i.key) || !isStrictScheduleDate(i.dueDate)) continue;
    if (!max || i.dueDate > max) max = i.dueDate;
  }
  return max;
}
function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx];
}
function simulateOnce(issues, workingDayCtx, rnd, preset, leafKeys) {
  const copy = issues.map((i) => ({ ...i }));
  const byKey = new Map(copy.map((i) => [i.key, i]));
  for (const key of leafKeys) {
    const issue = byKey.get(key);
    if (!issue) continue;
    const base = effectiveDuration(issue, workingDayCtx);
    const sampled = triangular(rnd(), base * (1 - preset.shrink), base, base * (1 + preset.stretch));
    const dur = Math.max(1, Math.round(sampled));
    if (dur === base) continue;
    const start = parseDate(issue.startDate);
    if (!start) continue;
    issue.duration = dur;
    issue.dueDate = formatDate(addWorkingDays(start, dur, workingDayCtx));
    issue._original = { ...issue._original || {}, duration: dur };
  }
  const settled = cascadeAll(copy, workingDayCtx).issues;
  return { issues: settled, finish: planFinish(settled) };
}
function simulateSchedule(issues, workingDayCtx, opts = {}) {
  const t0 = Date.now();
  const preset = UNCERTAINTY[opts.uncertainty] || UNCERTAINTY.medium;
  const coverage = forecastCoverage(issues);
  if (coverage.unavailable || !coverage.totalLeaves) return unavailableResult(coverage, opts, preset, issues);
  const runs = Math.max(1, Math.min(2e3, opts.runs || 200));
  const rnd = mulberry32(opts.seed ?? 42);
  const leafKeys = uncertainLeaves(issues).map((i) => i.key);
  const collected = prepareCollection(issues, leafKeys, opts);
  for (let r = 0; r < runs; r++) collectRun(issues, workingDayCtx, rnd, preset, leafKeys, collected);
  return { ...aggregate(issues, collected, { ...opts, runs, preset }), available: true, coverage, durationMs: Date.now() - t0 };
}
function prepareCollection(issues, leafKeys, opts) {
  return {
    finishes: [],
    perIssue: new Map(leafKeys.map((key) => [key, []])),
    targets: (opts.milestones || []).filter((target) => target && isStrictScheduleDate(target.date)).map((target) => ({ target, scope: resolveTargetScope(target, issues), finishes: [] }))
  };
}
function collectRun(issues, workingDayCtx, rnd, preset, leafKeys, collected) {
  const { issues: settled, finish } = simulateOnce(issues, workingDayCtx, rnd, preset, leafKeys);
  if (finish) collected.finishes.push(finish);
  const byKey = new Map(settled.map((issue) => [issue.key, issue]));
  for (const target of collected.targets) {
    if (!target.scope.available) continue;
    let targetFinish = null, complete = true;
    for (const key of target.scope.memberKeys) {
      const due = byKey.get(key)?.dueDate;
      if (!isStrictScheduleDate(due)) {
        complete = false;
        break;
      }
      if (!targetFinish || due > targetFinish) targetFinish = due;
    }
    if (complete && targetFinish) target.finishes.push(targetFinish);
  }
  for (const i of settled) {
    const arr = collected.perIssue.get(i.key);
    if (arr && i.dueDate) arr.push(i.dueDate);
  }
}
function unavailableResult(coverage, opts, preset, issues) {
  return { ...aggregate(issues, prepareCollection(issues, [], opts), { ...opts, runs: 0, preset }), baselineFinish: null, available: false, coverage, durationMs: 0 };
}
function aggregate(issues, collected, opts) {
  const finishes = collected.finishes.slice().sort();
  const baselineFinish = planFinish(issues);
  const p10 = percentile(finishes, 0.1), p50 = percentile(finishes, 0.5), p80 = percentile(finishes, 0.8), p90 = percentile(finishes, 0.9);
  const histogram = [];
  if (finishes.length) {
    const first = parseDate(finishes[0]);
    const last = parseDate(finishes[finishes.length - 1]);
    const weeks = Math.max(1, Math.floor(dayDiff(first, last) / 7) + 1);
    const counts = new Array(weeks).fill(0);
    for (const f of finishes) counts[Math.min(weeks - 1, Math.floor(dayDiff(first, parseDate(f)) / 7))]++;
    for (let w = 0; w < weeks; w++) {
      const d = new Date(first.getTime() + w * 7 * 864e5);
      histogram.push({ weekStart: formatDate(d), count: counts[w], share: counts[w] / finishes.length });
    }
  }
  const milestones = collected.targets.map(({ target: m, scope, finishes: targetFinishes }) => {
    const available = scope.available && opts.runs > 0 && targetFinishes.length === opts.runs;
    const ordered = targetFinishes.slice().sort();
    return {
      id: m.id || m.name,
      name: m.name || m.date,
      date: m.date,
      ...m.scope ? { scope: m.scope } : {},
      available,
      scopeLabel: scope.scopeLabel,
      memberCount: scope.memberCount,
      memberKeys: scope.memberKeys,
      reason: available ? null : scope.reason || "The full dependency network is incomplete or the forecast could not finish.",
      probability: available ? targetFinishes.filter((finish) => finish <= m.date).length / opts.runs : null,
      p50: available ? percentile(ordered, 0.5) : null,
      p80: available ? percentile(ordered, 0.8) : null,
      p90: available ? percentile(ordered, 0.9) : null
    };
  });
  const onBaseline = finishes.length && baselineFinish ? finishes.filter((f) => f <= baselineFinish).length / finishes.length : null;
  const byKey = new Map(issues.map((i) => [i.key, i]));
  const drivers = [];
  for (const [key, dues] of collected.perIssue) {
    if (dues.length < 2) continue;
    dues.sort();
    const lo = parseDate(percentile(dues, 0.1)), hi = parseDate(percentile(dues, 0.9));
    const iss = byKey.get(key);
    drivers.push({ key, summary: iss?.summary || "", spreadDays: lo && hi ? dayDiff(lo, hi) : 0, p80: percentile(dues, 0.8), successors: (iss?.successors || []).length });
  }
  drivers.sort((a, b) => b.spreadDays - a.spreadDays || String(b.p80).localeCompare(String(a.p80)) || a.key.localeCompare(b.key));
  return {
    runs: opts.runs,
    seed: opts.seed ?? 42,
    uncertainty: opts.preset.key,
    leafCount: collected.perIssue.size,
    baselineFinish,
    onBaseline,
    p10,
    p50,
    p80,
    p90,
    slipP80Days: baselineFinish && p80 ? dayDiff(parseDate(baselineFinish), parseDate(p80)) : null,
    histogram,
    milestones,
    drivers: drivers.slice(0, 6)
  };
}

// ../lz-ppm-forge/static/ppm-ui/src/utils/forecast-model-config.js
var FORECAST_MODEL_VERSION = "duration-triangular-fs-v1";
function forecastRunsForCount(count) {
  if (count > 3e3) return 40;
  if (count > 1e3) return 80;
  if (count > 300) return 150;
  return 300;
}

// ../lz-ppm-forge/static/ppm-ui/src/utils/capacity-model.js
function capacityDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// ../lz-ppm-forge/src/services/plan-snapshot-store.mjs
import { createHash } from "node:crypto";
var MAX_CHUNK_BYTES = 180 * 1024;
var MAX_DESCRIPTOR_BYTES = 100 * 1024;
var canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
var snapshotHash = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

// ../lz-ppm-forge/src/services/sponsor-report-analytics.mjs
function reportForecast(captured) {
  const calendar = captured.calendar;
  const calendarValid = Array.isArray(calendar?.workingDays) && calendar.workingDays.length > 0 && calendar.workingDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) && Array.isArray(calendar.holidays || []) && (calendar.holidays || []).every((holiday) => capacityDate(typeof holiday === "string" ? holiday : holiday?.date));
  const result = calendarValid ? simulateSchedule(captured.issues, buildWorkingDayCtx(calendar), {
    runs: forecastRunsForCount(captured.issues.length),
    seed: 42,
    uncertainty: captured.uncertainty,
    milestones: (captured.milestones || []).map((target, n) => ({ ...target, id: target.id || `target-${n + 1}` }))
  }) : { available: false, leafCount: 0, coverage: forecastCoverage(captured.issues), milestones: [] };
  const available = result.available && result.leafCount > 0;
  const coverage = result.coverage;
  const reason = available ? null : !calendarValid ? "The captured working calendar is unavailable or invalid." : !coverage.totalLeaves ? "No leaf tasks in the captured plan." : coverage.unavailable ? "The full captured network has missing, invalid or inverted dates, including required baseline dates." : "No open non-buffer task durations are available to sample.";
  return {
    forecast: {
      state: available ? "available" : "unavailable",
      reason,
      modelVersion: FORECAST_MODEL_VERSION,
      runs: available ? result.runs : 0,
      seed: 42,
      uncertainty: captured.uncertainty,
      inputHash: snapshotHash({ issues: captured.issues, calendar: captured.calendar, targets: captured.milestones, uncertainty: captured.uncertainty }),
      p50: available ? result.p50 : null,
      p80: available ? result.p80 : null,
      p90: available ? result.p90 : null,
      onPlannedFinish: available ? result.onBaseline : null,
      coverage: {
        totalLeaves: coverage.totalLeaves,
        datedLeaves: coverage.datedLeaves,
        sampledLeaves: result.leafCount,
        missingDates: coverage.missingDateKeys.length,
        invalidDates: coverage.invalidDateKeys.length,
        invertedDates: coverage.invertedDateKeys.length,
        invalidBaselines: coverage.baselineDateKeys.length
      }
    },
    targets: new Map(result.milestones.map((target) => [String(target.id), {
      forecastState: available && target.available ? "available" : "unavailable",
      probability: available && target.available ? target.probability : null,
      p50: available && target.available ? target.p50 : null,
      p80: available && target.available ? target.p80 : null,
      p90: available && target.available ? target.p90 : null,
      forecastReason: available && target.available ? null : reason || target.reason
    }]))
  };
}

// ../lz-ppm-forge/src/services/schedule-state.mjs
function scheduleStatePatch(input, { complete = false } = {}) {
  const out = {};
  for (const field of ["startDate", "dueDate", "duration", "buffer"]) {
    if (complete || Object.hasOwn(input, field)) out[field] = input[field] ?? (field === "buffer" ? "No" : null);
  }
  if (Object.hasOwn(input, "duration")) out.durationExplicitlyCleared = input.duration === null;
  return out;
}

// ../lz-ppm-forge/src/services/plan-snapshot-data.mjs
var EDIT_FIELDS = /* @__PURE__ */ new Set(["startDate", "dueDate", "duration", "buffer"]);
var KINDS = /* @__PURE__ */ new Set(["scenario", "baseline", "forecast", "report"]);
var isoDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && (/* @__PURE__ */ new Date(`${v}T00:00:00Z`)).toISOString().slice(0, 10) === v;
function snapshotCaptureData(meta, indexedIssues, payload, calendar) {
  if (!meta || !Array.isArray(indexedIssues) || indexedIssues.length !== meta.issueCount) throw new Error("The complete plan could not be read; refresh before capturing a snapshot");
  if (!KINDS.has(payload.kind)) throw new Error("Choose a supported snapshot kind");
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name || name.length > 120) throw new Error("Snapshot name must be 1\u2013120 characters");
  if (payload.expectedVersion !== void 0 && payload.expectedVersion !== meta.version) throw new Error("The plan changed; refresh before capturing a snapshot");
  if (!Array.isArray(payload.changes || [])) throw new Error("Working changes must be an array");
  if (indexedIssues.some((issue) => !issue || typeof issue.key !== "string" || !issue.key) || new Set(indexedIssues.map((issue) => issue.key)).size !== indexedIssues.length) throw new Error("The indexed scope contains missing or duplicate issue keys");
  const byKey = new Map(indexedIssues.map((issue) => [issue.key, issue]));
  const changed = /* @__PURE__ */ new Set();
  for (const patch of payload.changes || []) {
    if (!patch || !byKey.has(patch.key) || changed.has(patch.key)) throw new Error("Working changes contain unknown or duplicate issue keys");
    if (Object.keys(patch).some((key) => key !== "key" && !EDIT_FIELDS.has(key))) throw new Error("Working changes may only contain schedule fields");
    changed.add(patch.key);
    const result = { ...byKey.get(patch.key) };
    for (const field of EDIT_FIELDS) if (Object.hasOwn(patch, field)) {
      const value = patch[field];
      if ((field === "startDate" || field === "dueDate") && value !== null && !isoDate(value)) throw new Error(`Invalid ${field} for ${patch.key}`);
      if (field === "duration" && value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) throw new Error(`Invalid duration for ${patch.key}`);
      if (field === "buffer" && !["Yes", "No"].includes(value)) throw new Error(`Invalid buffer for ${patch.key}`);
      result[field] = value;
    }
    byKey.set(patch.key, {
      ...result,
      ...scheduleStatePatch(patch),
      // Retained working edits are not raw imports. A value equal to a stale
      // Jira duration, or a row without _original, must survive later hydration.
      ...Object.hasOwn(patch, "duration") ? { capturedDuration: patch.duration !== null } : {}
    });
  }
  const uncertainty = payload.uncertainty || "medium";
  if (!["low", "medium", "high"].includes(uncertainty)) throw new Error("Invalid duration uncertainty");
  return {
    kind: payload.kind,
    name,
    sourceVersion: meta.version,
    sources: meta.sources || [],
    // Only authorized server metadata can establish private-model provenance.
    ...meta.mode === "simulation" ? { mode: "simulation" } : {},
    calendar,
    milestones: meta.milestones || [],
    uncertainty,
    fieldOverrides: meta.fieldOverrides || {},
    assets: meta.assets || null,
    workingChangeCount: changed.size,
    // The captured original is needed by effectiveDuration and declared-zero
    // semantics when comparing forecasts. Adoption must keep the LIVE original
    // instead: a snapshot is never an authoritative Apply baseline.
    issues: [...byKey.values()].map(({ fieldAvail, ...issue }) => issue)
  };
}

// ../lz-ppm-forge/static/ppm-ui/src/utils/duration-normalize.js
function importedSpan(start, due, ctx) {
  if (!isStrictScheduleDate(start) || !isStrictScheduleDate(due) || due < start) return null;
  const span = workingDaysBetween(start, due, ctx);
  return span > 0 ? span : null;
}
var declaredZero = (duration) => duration != null && Number(duration) === 0;
function normalizeImportedDurations(issues, ctx) {
  if (!ctx || !Array.isArray(issues)) return issues;
  let changed = false;
  const out = issues.map((issue) => {
    const span = importedSpan(issue.startDate, issue.dueDate, ctx);
    if (span == null) return issue;
    const original = issue._original;
    const legacyBaseline = original && original.startDate === void 0 && original.dueDate === void 0;
    const sameDates = !original || legacyBaseline || issue.startDate === original.startDate && issue.dueDate === original.dueDate;
    const sameDuration = !original || issue.duration === original.duration || issue.duration == null && original.duration == null || issue.duration === span;
    const explicitlyCleared = issue.durationExplicitlyCleared === true && issue.duration === null;
    const explicitlyCaptured = issue.capturedDuration === true && Number.isFinite(issue.duration);
    const duration = !explicitlyCleared && !explicitlyCaptured && !declaredZero(issue.duration) && sameDates && sameDuration ? span : issue.duration;
    const baselineSpan = original && importedSpan(
      legacyBaseline ? issue.startDate : original.startDate,
      legacyBaseline ? issue.dueDate : original.dueDate,
      ctx
    );
    const originalDuration = original && !declaredZero(original.duration) && baselineSpan != null ? baselineSpan : original?.duration;
    const durationChanged = duration !== issue.duration;
    const baselineChanged = original && originalDuration !== original.duration;
    if (!durationChanged && !baselineChanged) return issue;
    changed = true;
    return {
      ...issue,
      ...durationChanged ? { duration } : {},
      ...baselineChanged ? { _original: { ...original, duration: originalDuration } } : {}
    };
  });
  return changed ? out : issues;
}

// ../lz-ppm-forge/static/ppm-ui/src/utils/snapshot-comparison.js
function snapshotIssues(snapshot) {
  if (snapshot?.working || snapshot?.mode === "simulation") return snapshot.issues || [];
  return normalizeImportedDurations(snapshot?.issues || [], buildWorkingDayCtx(snapshot?.calendar));
}

// ../lz-ppm-forge/static/ppm-ui/src/utils/sponsor-report.js
var reportHydratedIssues = (issues, calendar, mode) => snapshotIssues({ issues, calendar, mode });

// ../lz-ppm-forge/old-packed-producer-entry.mjs
function oldPackedForecast(plan, calendar) {
  return reportForecast(snapshotCaptureData(plan.meta, reportHydratedIssues(plan.issues, calendar), { kind: "report", name: "Unchanged packed upgrade report", uncertainty: "medium", changes: [] }, calendar)).forecast;
}
export {
  oldPackedForecast
};

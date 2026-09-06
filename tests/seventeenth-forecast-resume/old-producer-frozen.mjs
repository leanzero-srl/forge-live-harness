// ../lz-ppm-forge/src/services/plan-snapshot-store.mjs
import { createHash } from "node:crypto";
var SNAPSHOT_SCHEMA = 1;
var MAX_CHUNK_BYTES = 180 * 1024;
var MAX_DESCRIPTOR_BYTES = 100 * 1024;
var idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
var bytes = (value2) => Buffer.byteLength(JSON.stringify(value2), "utf8");
var canonical = (value2) => Array.isArray(value2) ? value2.map(canonical) : value2 && typeof value2 === "object" ? Object.fromEntries(Object.keys(value2).sort().map((key) => [key, canonical(value2[key])])) : value2;
var snapshotHash = (value2) => createHash("sha256").update(JSON.stringify(canonical(value2))).digest("hex");
var digest = snapshotHash;
function prefix(planId) {
  if (!idPattern.test(planId || "")) throw new Error("Invalid plan ID");
  return `p:${planId}:history:`;
}
function paths(planId, id) {
  if (!idPattern.test(id || "")) throw new Error("Invalid snapshot ID");
  const base = prefix(planId);
  return { entry: `${base}entry:${id}`, tombstone: `${base}deleted:${id}`, chunk: (n) => `${base}chunk:${id}:${n}` };
}
function snapshotChunks(issues, limit = MAX_CHUNK_BYTES) {
  if (!Array.isArray(issues)) throw new Error("Snapshot issues must be an array");
  const seen = /* @__PURE__ */ new Set();
  const chunks = [];
  let chunk = [], size = 2;
  for (const issue of issues) {
    if (!issue || typeof issue.key !== "string" || !issue.key || seen.has(issue.key)) throw new Error("Snapshot issues require unique keys");
    seen.add(issue.key);
    const itemBytes = bytes(issue);
    if (itemBytes + 2 > limit) throw new Error(`Issue ${issue.key} is too large to snapshot`);
    if (size + itemBytes + (chunk.length ? 1 : 0) > limit) {
      chunks.push(chunk);
      chunk = [];
      size = 2;
    }
    chunk.push(issue);
    size += itemBytes + (chunk.length > 1 ? 1 : 0);
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}
function prepareSnapshot(planId, input) {
  const { id, issues, ...details } = JSON.parse(JSON.stringify(input));
  paths(planId, id);
  if (!["baseline", "scenario", "forecast", "report"].includes(details.kind)) throw new Error("Invalid snapshot kind");
  if (typeof details.name !== "string" || !details.name.trim() || details.name.length > 120) throw new Error("Snapshot name must be 1\u2013120 characters");
  for (const key of ["schemaVersion", "planId", "issueCount", "chunkCount", "chunkHashes", "hash", "state"]) {
    if (Object.hasOwn(details, key)) throw new Error("Snapshot input contains reserved metadata");
  }
  details.name = details.name.trim();
  const chunks = snapshotChunks(issues);
  const hash = digest({ details, issues });
  const descriptor = {
    ...details,
    name: details.name.trim(),
    schemaVersion: SNAPSHOT_SCHEMA,
    planId,
    id,
    issueCount: issues.length,
    chunkCount: chunks.length,
    chunkHashes: chunks.map(digest),
    hash,
    state: "preparing"
  };
  if (bytes(descriptor) > MAX_DESCRIPTOR_BYTES) throw new Error("Snapshot settings are too large");
  return { descriptor, chunks };
}

// ../lz-ppm-forge/src/services/report-preparation.mjs
function prepareSponsorReport(planId, { baseline, sections, ...input }) {
  const document = {}, pages = [];
  for (const section of ["timeline", "targets", "changes", ...["capacity", "availability", "unallocated"].filter((name) => Array.isArray(sections?.[name]))]) {
    if (!Array.isArray(sections?.[section])) throw new Error("Complete report sections are required");
    const chunks = [];
    for (let n = 0; n < sections[section].length; n += 50) chunks.push(...snapshotChunks(sections[section].slice(n, n + 50)));
    document[section] = { total: sections[section].length, sizes: chunks.map((rows) => rows.length), hashes: chunks.map(snapshotHash) };
    chunks.forEach((rows, n) => pages.push({ key: `p:${planId}:sponsor-reports:page:${input.id}:${section}:${n}`, rows }));
  }
  if (snapshotHash(sections.timeline) !== snapshotHash(input.issues) || snapshotHash(sections.targets) !== snapshotHash(input.targets)) throw new Error("Report document does not match its captured rows");
  const retainedBaseline = baseline ? prepareSnapshot(planId, { ...baseline, id: input.id, kind: "baseline" }) : null;
  const copied = retainedBaseline?.descriptor;
  let current;
  try {
    current = prepareSnapshot(planId, { ...input, kind: "report", document, baseline: copied ? {
      ...copied.mode === "simulation" ? { mode: "simulation" } : {},
      id: copied.id,
      hash: copied.hash,
      issueCount: copied.issueCount,
      name: copied.name,
      takenAt: copied.takenAt || null,
      sourceSnapshotId: copied.sourceSnapshotId || null,
      coverageNote: copied.coverageNote || null
    } : null });
  } catch (error) {
    if (error.message === "Snapshot settings are too large") throw new Error("Report settings and page manifest exceed the storage limit; narrow the capacity window or plan scope. No report was published.");
    throw error;
  }
  return { current, baseline: retainedBaseline, pages };
}

// ../lz-ppm-forge/static/ppm-ui/src/utils/target-scope.js
function strictTargetDate(value2) {
  if (typeof value2 !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value2)) return false;
  const d = /* @__PURE__ */ new Date(`${value2}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value2;
}
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
function isStrictScheduleDate(value2) {
  return typeof value2 === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value2) && formatDate(parseDate(value2)) === value2;
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
function capacityDate(value2) {
  if (typeof value2 !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value2)) return false;
  const date = /* @__PURE__ */ new Date(`${value2}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value2;
}

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
var REPORT_PAGE_SIZE = 50;
var REPORT_SECTIONS = ["timeline", "targets", "changes"];
var privateReportContext = "Private simulation model \xB7 Captured modeled scope, calendar and dependency network. This report does not write changes to Jira.";
var reportSections = (summary) => [...REPORT_SECTIONS, ...["capacity", "availability", "unallocated"].filter((section) => summary.document?.[section])];
var fields = ["startDate", "dueDate", "duration", "buffer"];
var value = (v) => v == null ? null : v;
var validRange = (i) => strictTargetDate(i.startDate) && strictTargetDate(i.dueDate) && i.startDate <= i.dueDate;
var schedule = (i) => i ? Object.fromEntries(fields.map((f) => [f, value(i[f])])) : null;
function reportIssueRows(snapshot) {
  return snapshotIssues(snapshot).map((i) => ({
    key: i.key,
    summary: typeof i.summary === "string" ? i.summary : "",
    ...schedule(i),
    statusCategory: typeof i.statusCategory === "string" ? i.statusCategory : "unknown",
    parentKey: typeof i.parentKey === "string" ? i.parentKey : null
  }));
}
function reportChanges(issues, baseline) {
  if (!baseline) return [];
  const old = new Map(baseline.map((i) => [i.key, i])), current = new Map(issues.map((i) => [i.key, i]));
  return [.../* @__PURE__ */ new Set([...old.keys(), ...current.keys()])].sort().flatMap((key) => {
    const from = old.get(key), to = current.get(key);
    if (from && to && fields.every((f) => value(from[f]) === value(to[f]))) return [];
    return [{ key, summary: to?.summary || from?.summary || "", change: !from ? "Added" : !to ? "Removed" : "Schedule changed", from: schedule(from), to: schedule(to) }];
  });
}
function reportSummary(report, baseline) {
  const issues = report.issues, changes = reportChanges(issues, baseline?.issues);
  const leaves = new Set(planLeafKeys(issues)), leafRows = issues.filter((i) => leaves.has(i.key));
  const valid = issues.filter(validRange), incomplete = leafRows.filter((i) => !validRange(i));
  return {
    ...report.mode === "simulation" ? { mode: "simulation" } : {},
    id: report.id,
    hash: report.hash,
    name: report.name,
    planName: report.planName,
    takenAt: report.takenAt,
    sourceVersion: report.sourceVersion,
    workingChangeCount: report.workingChangeCount,
    calendar: report.calendar,
    forecast: report.forecast || { state: "unavailable", reason: "No numerical forecast was retained with this earlier report.", p50: null, p80: null, p90: null },
    capacity: report.capacity || { state: "not-included", reason: "Capacity was not retained with this earlier report." },
    uncertainty: report.uncertainty,
    consistency: report.consistency,
    baseline: report.baseline || null,
    counts: { timeline: issues.length, targets: report.targets.length, changes: changes.length, ...Object.fromEntries(["capacity", "availability", "unallocated"].filter((section) => report.document?.[section]).map((section) => [section, report.document[section].total])) },
    pages: Object.fromEntries(reportSections(report).map((section) => [section, report.document?.[section]?.sizes.length ?? Math.ceil({ timeline: issues.length, targets: report.targets.length, changes: changes.length }[section] / REPORT_PAGE_SIZE)])),
    document: report.document || null,
    pageSize: REPORT_PAGE_SIZE,
    coverage: {
      leafTasks: leafRows.length,
      unscheduledOrInvalidLeaves: incomplete.length,
      validRows: valid.length,
      unavailableRows: issues.length - valid.length
    },
    span: valid.length ? { start: valid.map((i) => i.startDate).sort()[0], finish: valid.map((i) => i.dueDate).sort().at(-1) } : null,
    plannedFinish: leafRows.length && !incomplete.length ? leafRows.map((i) => i.dueDate).sort().at(-1) : null,
    changeCounts: { added: changes.filter((i) => i.change === "Added").length, removed: changes.filter((i) => i.change === "Removed").length, changed: changes.filter((i) => i.change === "Schedule changed").length }
  };
}
var escape = (v) => String(v ?? "\u2014").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var td = (v) => `<td>${escape(v)}</td>`;
var reportNumber = (value2) => typeof value2 === "number" && Number.isFinite(value2) ? Number(value2.toFixed(2)).toString() : "Unavailable";
var reportPercent = (value2) => typeof value2 === "number" && Number.isFinite(value2) ? `${reportNumber(value2 * 100)}%` : "Unavailable";
var reportForecastText = (forecast) => forecast?.state === "available" ? `P50 ${forecast.p50} \xB7 P80 ${forecast.p80} \xB7 P90 ${forecast.p90}` : `Forecast unavailable: ${forecast?.reason || "No numerical forecast was retained."}`;
var availabilityText = (row) => row.profile ? `${row.profile.hoursPerDay}h/day \xD7 ${row.profile.partTimePct}% part-time \xD7 ${100 - row.profile.reservePct}% after reserve; weekdays ${row.profile.workingDays.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")}; leave ${row.profile.leaveDates.length ? row.profile.leaveDates.join(", ") : "none"}` : "No saved availability; capacity remains unknown.";
function timelineRow(i, span) {
  let bar = "Dates unavailable";
  if (validRange(i) && span) {
    const start = Date.parse(span.start), range = Math.max(864e5, Date.parse(span.finish) - start + 864e5);
    const left = (Date.parse(i.startDate) - start) / range * 100;
    const width = Math.max(0.3, (Date.parse(i.dueDate) - Date.parse(i.startDate) + 864e5) / range * 100);
    bar = `<span class="track"><span class="bar" style="margin-left:${left.toFixed(3)}%;width:${Math.min(width, 100 - left).toFixed(3)}%"></span></span>`;
  }
  return `<tr data-issue-key="${escape(i.key)}">${td(i.key)}${td(i.summary)}${td(i.startDate)}${td(i.dueDate)}${td(i.duration)}${td(i.statusCategory)}<td>${bar}</td></tr>`;
}
var formattedSchedule = (s) => s ? `${s.startDate ?? "\u2014"} \u2192 ${s.dueDate ?? "\u2014"}; duration ${s.duration ?? "\u2014"}; buffer ${s.buffer ?? "\u2014"}` : "Outside scope";
function validateReportPage(summary, page, section, number) {
  const total = summary.counts[section], count = summary.pages[section], manifest = summary.document?.[section];
  if (!page || page.reportId !== summary.id || page.hash !== summary.hash || page.section !== section || page.page !== number || page.pageCount !== count || page.total !== total || !Array.isArray(page.rows) || page.rows.length !== (manifest ? manifest.sizes[number] : Math.min(REPORT_PAGE_SIZE, total - number * REPORT_PAGE_SIZE)) || manifest && page.pageHash !== manifest.hashes[number]) throw new Error("Report pages changed or are incomplete");
  return page;
}
function assembleReportPages(summary, pages) {
  const result = {};
  if (!summary?.id || !summary.hash || summary.pageSize !== REPORT_PAGE_SIZE) throw new Error("Report manifest is invalid");
  if (!Array.isArray(pages) || pages.length !== reportSections(summary).reduce((n, section) => n + summary.pages[section], 0)) throw new Error("Report download is incomplete");
  for (const section of reportSections(summary)) {
    const total = summary.counts[section], count = summary.pages[section];
    const manifest = summary.document?.[section];
    if (!Number.isSafeInteger(total) || total < 0 || (manifest ? manifest.total !== total || count !== manifest.sizes.length || manifest.hashes.length !== count || manifest.sizes.reduce((a, b) => a + b, 0) !== total : count !== Math.ceil(total / REPORT_PAGE_SIZE))) throw new Error("Report counts are invalid");
    const selected = pages.filter((p) => p.section === section).sort((a, b) => a.page - b.page);
    if (selected.length !== count) throw new Error("Report download is incomplete");
    selected.forEach((p, n) => {
      validateReportPage(summary, p, section, n);
    });
    const rows = selected.flatMap((p) => p.rows);
    if (rows.some((r) => typeof r.key !== "string" || !r.key) || new Set(rows.map((r) => r.key)).size !== total) throw new Error("Report rows are missing or duplicated");
    result[section] = rows;
  }
  return result;
}
function sponsorReportHtml(summary, pages) {
  const rows = assembleReportPages(summary, pages);
  const calendar = summary.calendar || {};
  const weekdays = (calendar.workingDays || []).map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] || "Invalid day").join(", ");
  const holidays = (calendar.holidays || []).map((h) => typeof h === "string" ? h : `${h.date} ${h.name || ""}`).join("; ");
  const section = (name, sectionRows, headings, widths, render) => {
    const heading = `<div class="section-heading"><h2>${escape(name)}</h2><p>${sectionRows.length} rows \xB7 complete captured section</p></div>`;
    if (!sectionRows.length) return `<section class="report-section">${heading}<p>No rows in this section.</p></section>`;
    return `<section class="report-section">${heading}<table><colgroup>${widths.map((width) => `<col style="width:${width}%">`).join("")}</colgroup><thead><tr>${headings.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${sectionRows.map(render).join("")}</tbody></table></section>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${escape(summary.name)} \u2014 sponsor report</title><style>
  *{box-sizing:border-box}
  body{font:14px/1.4 system-ui,sans-serif;color:#15233b;margin:28px auto;max-width:1400px;padding:0 24px}
  h1{font-size:28px;line-height:1.2;margin:7px 0}h2{font-size:20px;line-height:1.25;color:#1d4ed8;margin:16px 0 7px}
  p{margin:5px 0 9px}header{background:#15233b;color:white;padding:20px 24px;border-radius:12px}header p{margin:4px 0}
  .cover-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin:12px 0}.cover-grid section{min-width:0}.cover-grid h2:first-child{margin-top:0}
  .report-provenance{overflow-wrap:anywhere;font-size:11px;line-height:1.35;border-top:1px solid #64748b;padding-top:8px;break-inside:avoid}
  .report-section{margin-top:28px}.section-heading{break-inside:avoid;break-after:avoid}.section-heading p{font-size:12px;margin-bottom:9px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{text-align:left;border:1px solid #64748b;padding:6px;vertical-align:top;overflow-wrap:anywhere;line-height:1.3}
  th{background:#1d4ed8;color:white;font-size:12px;font-weight:650}td{font-size:12px}
  .track{display:block;height:12px}.bar{display:block;background:#2563eb;min-width:2px;height:12px}
  @page{size:A4 landscape;margin:12mm}
  @media print{
    body{margin:0;padding:0;max-width:none;font-size:9pt;line-height:1.3}
    h1{font-size:21pt}h2{font-size:12pt;margin:10pt 0 4pt}
    header{border-radius:0;padding:12pt 15pt}header p{margin:3pt 0}
    .cover-grid{gap:15pt;margin:10pt 0 7pt}.cover-grid p{margin:4pt 0 6pt}
    .report-provenance{font-size:7.5pt;margin:6pt 0 0;padding-top:5pt;orphans:3;widows:3}
    header,th,.bar{print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .report-section{margin-top:14pt;break-before:auto}.section-heading p{font-size:8pt;margin:3pt 0 6pt}
    thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}
    td,th{padding:3pt 4pt;font-size:8.5pt;line-height:1.25}p{orphans:3;widows:3}
  }
  </style></head><body><div class="report-cover"><header><p>LeanZero Management \xB7 Sponsor report</p><h1>${escape(summary.name)}</h1>${summary.mode === "simulation" ? `<p>${privateReportContext}</p>` : ""}<p>${escape(summary.planName)} \xB7 captured ${escape(summary.takenAt)} \xB7 plan revision ${escape(summary.sourceVersion)}</p><p>${summary.counts.timeline} current issues \xB7 ${summary.counts.targets} scoped targets \xB7 ${summary.counts.changes} baseline changes</p></header>
  <div class="cover-grid"><section><h2>Schedule and coverage</h2><p>Planned leaf finish: ${escape(summary.plannedFinish || "Unavailable")}. ${summary.coverage.unscheduledOrInvalidLeaves} of ${summary.coverage.leafTasks} leaf tasks have missing, invalid or inverted dates. All ${summary.counts.timeline} issue rows are included below; unavailable dates remain explicit.</p><p>Timeline axis: ${escape(summary.span?.start)} \u2192 ${escape(summary.span?.finish)} (calendar dates). ${summary.workingChangeCount || 0} working schedule edits included at capture.</p>
  <h2>Baseline comparison</h2><p>${summary.baseline ? `Compared with the retained copy of ${escape(summary.baseline.name)} captured ${escape(summary.baseline.takenAt)}; ${summary.baseline.issueCount} baseline issues. ${escape(summary.baseline.coverageNote || "")}` : "No active baseline existed at capture. No baseline comparison is available."}</p><p>${summary.changeCounts.added} added \xB7 ${summary.changeCounts.removed} removed \xB7 ${summary.changeCounts.changed} schedules changed. Dates, duration and buffer are compared; issue membership changes remain explicit.</p>
  </section><section><h2>Assumptions and provenance</h2><p>This is the captured planned schedule, not a historical or calibrated probability guarantee. Planned dates and simulated finishes are distinct. ${escape(reportForecastText(summary.forecast))}. Duration uncertainty: ${escape(summary.uncertainty)}. ${summary.forecast?.state === "available" ? `Model ${escape(summary.forecast.modelVersion)}, seed ${escape(summary.forecast.seed)}, ${escape(summary.forecast.runs)} simulated finishes. P90 means at least 90% of simulated finishes on or before that date, not a commitment.` : ""}</p><p>Calendar: ${escape(calendar.calendarName || "Unnamed")}. Working weekdays: ${escape(weekdays || "Unavailable")}. Holidays: ${escape(holidays || "None")}. Durations are working days, not person effort. A zero duration is retained as a declared milestone; missing duration remains explicit when intentionally cleared.</p><p>${summary.mode === "simulation" ? "Scope is the authorized private model\u2019s captured issue set, modeled calendar and dependency network, including working schedule edits." : "Scope is the authorized plan\u2019s complete indexed issue set and working schedule edits at capture."} Issue-level Jira visibility is not re-evaluated for a historical report. Assets fields and object labels are excluded. Parent rows are retained for context; target membership uses leaf tasks.</p><p>Capture consistency: ${escape(summary.consistency?.method || "Unavailable")}. Two matching reads detect changes during capture; they are not a global transaction across all plan data. The report retains its baseline copy independently of later baseline deletion or changes.</p></section></div><p class="report-provenance">Report ${escape(summary.id)} \xB7 integrity ${escape(summary.hash)}</p></div>
  ${section("Timeline", rows.timeline, ["Issue", "Summary", "Start", "Finish", "Working days", "Status", "Timeline"], [8, 35, 9, 9, 7, 12, 20], (i) => timelineRow(i, summary.span))}
  ${section("Scoped targets", rows.targets, ["Target / date", "Scope / tasks", "Planned finish", "Simulated P50 / P80 / P90", "By target", "Availability"], [18, 22, 10, 21, 9, 20], (i) => `<tr data-target-key="${escape(i.key)}">${td(`${i.name} \xB7 ${i.date}`)}${td(`${i.scopeLabel} (${i.scopeType}${i.scopeId ? ` ${i.scopeId}` : ""}) \xB7 ${i.memberCount} tasks`)}${td(i.plannedFinish)}${td(i.forecastState === "available" ? `${i.p50} / ${i.p80} / ${i.p90}` : "Unavailable")}${td(reportPercent(i.probability))}${td(`${i.state}${i.reason ? ` \u2014 ${i.reason}` : ""}${i.forecastReason ? ` \u2014 ${i.forecastReason}` : ""}`)}</tr>`)}
  <section class="report-section"><h2>Captured capacity context</h2><p>${escape(summary.capacity?.assumptions || summary.capacity?.reason || "Capacity was not included at capture.")}</p>${summary.capacity?.startDate ? `<p>${escape(summary.capacity.startDate)} \u2192 ${escape(summary.capacity.endDate)} \xB7 effort as of ${escape(summary.capacity.asOfDate)} \xB7 Jira read ${escape(summary.capacity.readStartedAt)} \u2192 ${escape(summary.capacity.readAt)} \xB7 saved availability revision ${escape(summary.capacity.profileVersion)}.</p><p>${escape(summary.capacity.reason || "")} ${escape(summary.capacity.coverage?.missingEffort || 0)} missing estimates; ${escape(summary.capacity.coverage?.unavailableIssueCount || 0)} unreadable issues. Known effort ${escape(reportNumber(summary.capacity.totals?.knownEffortHours))}h; allocated ${escape(reportNumber(summary.capacity.totals?.allocatedHours))}h; outside window ${escape(reportNumber(summary.capacity.totals?.outsideWindowHours))}h; unallocated ${escape(reportNumber(summary.capacity.totals?.unallocatedHours))}h.</p>` : ""}</section>
  ${rows.capacity ? section("Weekly capacity", rows.capacity, ["Person / stable ID", "Week", "Demand hours", "Capacity hours", "Unknown effort", "Result"], [30, 14, 12, 12, 12, 20], (i) => `<tr data-capacity-key="${escape(i.key)}">${td(`${i.name} (${i.personId})`)}${td(i.week)}${td(reportNumber(i.demandHours))}${td(reportNumber(i.capacityHours))}${td(i.unknownEffortCount)}${td(i.status)}</tr>`) : ""}
  ${rows.availability ? section("Included availability assumptions", rows.availability, ["Person / stable ID", "Saved assumption"], [30, 70], (i) => `<tr>${td(`${i.name} (${i.key})`)}${td(availabilityText(i))}</tr>`) : ""}
  ${rows.unallocated ? section("Unallocated remaining effort", rows.unallocated, ["Issue identity", "Person ID", "Hours", "Reason"], [28, 25, 12, 35], (i) => `<tr>${td(i.key)}${td(i.personId)}${td(reportNumber(i.hours))}${td(i.reason)}</tr>`) : ""}
  ${section("Baseline changes", rows.changes, ["Issue", "Summary", "Change", "Baseline schedule", "Captured schedule"], [9, 31, 10, 25, 25], (i) => `<tr>${td(i.key)}${td(i.summary)}${td(i.change)}${td(formattedSchedule(i.from))}${td(formattedSchedule(i.to))}</tr>`)}
  </body></html>`;
}
export {
  prepareSponsorReport,
  reportForecast,
  reportIssueRows,
  reportSummary,
  sponsorReportHtml
};

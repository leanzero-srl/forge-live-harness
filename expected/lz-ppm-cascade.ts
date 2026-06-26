// Deterministic ORACLE for lz-ppm: imports the app's OWN frontend cascade engine
// (cascade-core.js — the authoritative "what Apply writes") + its parity fixtures,
// so expected dates stay in lock-step with the app. esbuild/tsx (Playwright runner)
// resolves cascade-core's extensionless relative imports automatically.
import { cascadeFromIssue } from "../../lz-ppm-forge/static/ppm-ui/src/hooks/cascade-core.js";
import { buildWorkingDayCtx } from "../../lz-ppm-forge/static/ppm-ui/src/utils/date-utils.js";
export { FIXTURES } from "../../lz-ppm-forge/test/parity/fixtures.mjs";

// Mon–Fri working week, no holidays (matches the parity harness calendar).
const ctx = buildWorkingDayCtx({ workingDays: [1, 2, 3, 4, 5], holidays: [] });

/** {key: {startDate,dueDate,duration,buffer}} for the settled state after an edit. */
export function expectedAfterEdit(issues, editKey, changes) {
  const fe = cascadeFromIssue(issues, editKey, changes, ctx);
  const out = {};
  for (const i of fe.issues) {
    out[i.key] = { startDate: i.startDate, dueDate: i.dueDate, duration: i.duration, buffer: i.buffer };
  }
  return out;
}

/** Convenience: expected settled state for a named FIXTURES entry. */
export function expectedForFixture(fx) {
  return expectedAfterEdit(fx.issues, fx.edit.key, fx.edit.changes);
}

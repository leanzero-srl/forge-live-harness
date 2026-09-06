// Deterministic ORACLE for lz-ppm: imports the app's OWN frontend cascade engine
// (cascade-core.js — the authoritative "what Apply writes") + its parity fixtures,
// so expected dates stay in lock-step with the app. esbuild/tsx (Playwright runner)
// resolves cascade-core's extensionless relative imports automatically.
import { cascadeFromIssue } from "../../lz-ppm-forge/static/ppm-ui/src/hooks/cascade-core.js";
import { buildWorkingDayCtx } from "../../lz-ppm-forge/static/ppm-ui/src/utils/date-utils.js";
export { FIXTURES } from "../../lz-ppm-forge/test/parity/fixtures.mjs";

// Mon–Fri working week, no holidays (matches the parity harness calendar).
const ctx = buildWorkingDayCtx({ workingDays: [1, 2, 3, 4, 5], holidays: [] });

export interface CascadeSchedule {
  startDate?: string | null;
  dueDate?: string | null;
  duration?: number | string | null;
  buffer?: string | null;
}
export interface CascadeIssue extends CascadeSchedule {
  key: string;
  predecessors?: string[];
  successors?: string[];
  predecessorLags?: Record<string, number>;
  parentKey?: string | null;
  children?: string[];
  _original?: Partial<CascadeIssue>;
}
export interface CascadeFixture {
  issues: CascadeIssue[];
  edit: { key: string; changes: Partial<CascadeSchedule> };
}

/** {key: {startDate,dueDate,duration,buffer}} for the settled state after an edit. */
export function expectedAfterEdit(issues: CascadeIssue[], editKey: string, changes: Partial<CascadeSchedule>): Record<string, CascadeSchedule> {
  const fe = cascadeFromIssue(issues, editKey, changes, ctx);
  if (!fe) throw new Error(`Oracle edit issue "${editKey}" is not in the fixture`);
  const out: Record<string, CascadeSchedule> = {};
  for (const i of fe.issues) {
    out[i.key] = { startDate: i.startDate, dueDate: i.dueDate, duration: i.duration, buffer: i.buffer };
  }
  return out;
}

/** Convenience: expected settled state for a named FIXTURES entry. */
export function expectedForFixture(fx: CascadeFixture | undefined): Record<string, CascadeSchedule> {
  if (!fx) throw new Error("The requested oracle fixture is unavailable");
  return expectedAfterEdit(fx.issues, fx.edit.key, fx.edit.changes);
}

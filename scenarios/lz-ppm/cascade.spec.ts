// lz-ppm DEEP suite — the live backend cascade engine must equal the oracle
// (lz-ppm's own parity-locked frontend engine) for every fixture. Pure REST + hook
// + oracle → fully deterministic, no Gantt-drag. Buffer fixtures are covered
// separately (the PPM Buffer select has no options on WFH).
import { test, expect } from "@playwright/test";
import { runCascadeFixture } from "./cascade-runner";

// These 5 are pure BACKEND cascade (iron-clad successor scheduling + duration
// recompute) and match the oracle deterministically. NOTE (finding): "parent
// rollup" is intentionally excluded — the backend `recalculateFullPlan` rolls up
// only subtask `.children`, NOT parentKey-based Epic→child parents; that rollup is
// done by the FRONTEND engine (what the app writes on apply). So backend-settle
// legitimately differs from the frontend oracle there. See lz-ppm parent-rollup.js.
const FIXTURES = [
  "simple chain A->B, push A due",
  "three-link chain A->B->C, push A due",
  "multi-predecessor: successor follows the later predecessor",
  "fan-out: one predecessor blocks two successors",
  "milestone successor stays a point after a cascade",
];

test.describe.configure({ timeout: 150_000 });

for (const name of FIXTURES) {
  test(`lz-ppm cascade == oracle: ${name}`, async () => {
    const { oracle, got } = await runCascadeFixture(name);
    expect(got).toEqual(oracle);
  });
}

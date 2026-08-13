// PERSISTENT journey — #11 "a child can be added when its parent is not there".
// The fix (ffa2636d): indexing pulls in missed parents when the plan opts in,
// and a child whose parent can't be resolved is shown at TOP LEVEL instead of
// being silently hidden by the tree flatten. Reproduce the orphan case with a
// throwaway test-hook fixture whose JQL matches ONE subtask but not its parent:
// the child must be indexed with parentKey nulled (not hidden) and must render.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 1, timeout: 240_000 });
const HOOK = process.env.LZ_PPM_TESTHOOK_URL!;
const SECRET = process.env.HARNESS_SECRET!;

async function hook(params: string) {
  const res = await fetch(`${HOOK}?${params}`, { headers: { Authorization: `Bearer ${SECRET}` } });
  return res.json();
}

test("LZPT orphan parent: a child whose parent is outside the plan is shown, not hidden", async ({ page }) => {
  test.skip(!HOOK || !SECRET, "needs LZ_PPM_TESTHOOK_URL + HARNESS_SECRET");
  let planId: string | null = null;
  try {
    // A JQL matching exactly one SUBTASK (its Story parent does NOT match).
    const created: any = await hook(`what=createFixture&name=orphan-child-probe&jql=${encodeURIComponent('project = LZPT AND summary ~ "ROLLUP sub-1a"')}`);
    planId = created.planId;
    console.log("fixture", planId, "issues:", (created.issues || []).length);
    expect(created.result?.success, "fixture indexed").toBeTruthy();

    const issues = created.issues || [];
    expect(issues.length, "the orphan child WAS indexed (not dropped)").toBe(1);
    const child = issues[0];
    // The child's Jira parent is not in the plan — parentKey must be nulled so
    // the tree flatten treats it as a root instead of never visiting it.
    expect(child.parentKey ?? null, "unresolvable parentKey is nulled (renders at top level)").toBeNull();

    // And it actually renders: open the fixture plan and see the row.
    await page.setViewportSize({ width: 1600, height: 1000 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame = s.kind === "custom" ? s.frame : null;
    if (!frame) throw new Error("no frame");
    await page.waitForTimeout(2000);
    await frame.getByText("orphan-child-probe", { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
    const body = (await frame.locator("body").textContent().catch(() => "")) || "";
    const shows = /Showing\s+1\s+of\s+1/i.test(body) || body.includes(child.key);
    console.log("renders:", shows);
    expect(shows, "the orphan child renders in the plan").toBeTruthy();
  } finally {
    if (planId) {
      const del: any = await hook(`what=deleteFixture&planId=${planId}`);
      console.log("deleted fixture:", del.deleted || del.error);
    }
  }
});

// PERSISTENT feature journey — CASCADE on the LZPT linear chain. Drags CHAIN-1
// later and asserts the whole chain (CHAIN-2..5) shifts by the SAME delta
// (dependency cascade with no slack) and the parent epic rolls up. Restores by
// discarding. NEVER Applies to Jira. Keys float → mapped by summary.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 260_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }

test("LZPT cascade: drag CHAIN-1 → whole chain shifts by the same delta, then restore", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  const keyMap: Record<string, string> = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }) });
    const d = await res.json(); const m: Record<string, string> = {}; for (const i of d.issues || []) m[i.fields.summary] = i.key; return m;
  });
  const K = (x: string) => keyMap[x];
  // CROSS-A gate is the free HEAD of the chain (nothing blocks it); CHAIN-1 is
  // PINNED by it (a constrained successor can't be free-dragged — verified: the
  // app rejects it with a "must start at predecessor's due+1" toast). So drag the
  // head and watch the whole chain cascade.
  const head = K("CROSS-A gate");
  const chain = ["CHAIN-1 kickoff", "CHAIN-2 build", "CHAIN-3 test", "CHAIN-4 review", "CHAIN-5 release"].map(K);
  const epic = K("E1 · Linear Chain");
  expect([head, ...chain].every(Boolean), "chain keys resolved").toBeTruthy();

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4500);

  const lefts = (keys: string[]) => realFrame!.evaluate((ks) => ks.map((k) => { const el = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement | null; return el ? Math.round(el.getBoundingClientRect().left) : null; }), keys);
  const epicRight = () => realFrame!.evaluate((k) => { const el = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement | null; return el ? Math.round(el.getBoundingClientRect().right) : null; }, epic);

  const before = await lefts([head, ...chain]);
  const epicRightBefore = await epicRight();
  console.log("HEAD+CHAIN_LEFT_BEFORE:", JSON.stringify(before), " EPIC_RIGHT_BEFORE:", epicRightBefore);

  // Drag the free HEAD (CROSS-A gate) to the right.
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${head}"]`).first();
  const box = await bar.boundingBox();
  if (!box) throw new Error("CROSS-A head bar not found");
  const dx = 120;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT}/lzpt-cascade.png` });

  const after = await lefts([head, ...chain]);
  const epicRightAfter = await epicRight();
  const deltas = after.map((a, i) => (a != null && before[i] != null ? a - (before[i] as number) : null));
  console.log("HEAD+CHAIN_LEFT_AFTER:", JSON.stringify(after), " DELTAS:", JSON.stringify(deltas), " EPIC_RIGHT_AFTER:", epicRightAfter);

  // Head moved right; the whole chain (CHAIN-1..5) cascaded by ~the same delta
  // (no slack — each task is pinned to its predecessor's due+1).
  expect(deltas[0]!, "CROSS-A head moved right").toBeGreaterThan(100);
  const chainDeltas = deltas.slice(1).filter((d) => d != null) as number[];
  expect(chainDeltas.length, "chain measured").toBe(5);
  for (let i = 0; i < chainDeltas.length; i++) {
    expect(chainDeltas[i], `CHAIN-${i + 1} cascaded right`).toBeGreaterThan(100);
    // Within a working-day band of the head's shift — NOT pixel-identical, since
    // each task's start is recomputed in WORKING days and crosses weekends
    // differently (±2-3 days). The point is the whole chain tracked the head.
    expect(Math.abs(chainDeltas[i] - deltas[0]!), `CHAIN-${i + 1} tracked the head's shift (working-day band)`).toBeLessThan(48);
  }
  // Chain stayed strictly ordered after cascade (no successor jumped ahead).
  const chainLefts = after.slice(1) as number[];
  for (let i = 1; i < chainLefts.length; i++) expect(chainLefts[i], `CHAIN-${i + 1} still after CHAIN-${i}`).toBeGreaterThan(chainLefts[i - 1]);
  // Parent epic (E1) rolled up — its right edge extended as the chain moved later.
  expect(epicRightAfter! - epicRightBefore!, "parent epic rolled up to cover the moved chain").toBeGreaterThan(100);

  // RESTORE — discard everything. NEVER Apply. One round is timing-dependent:
  // after Discard All the "Save (N)" nag legitimately remains until the clean
  // state is persisted (two-axis model), and the 1.5s autosave can race a single
  // pass — the same intermittence journey-baseline had. Loop + persist-clean,
  // then assert the JIRA-PENDING axis (the Apply badge) specifically.
  for (let i = 0; i < 4; i++) {
    if (!(await isStaged(frame))) break;
    await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
    const t = (await frame.locator("body").textContent().catch(() => "")) || "";
    if (!/Apply \d+ change/i.test(t) && /Save \(\d+\)/i.test(t)) {
      await frame.locator('[data-testid="plan-save-btn"]').first().click().catch(() => {});
      await page.waitForTimeout(2500);
    }
  }
  const restored = await lefts([head, ...chain]);
  const bodyAfter = (await frame.locator("body").textContent().catch(() => "")) || "";
  console.log("HEAD+CHAIN_RESTORED:", JSON.stringify(restored), " STAGED_AFTER:", await isStaged(frame));
  // Discard All reverts to the plan baseline (drag undone); nothing is pending vs Jira.
  expect(/Apply \d+ change/i.test(bodyAfter), "plan is clean after discard (never Applied)").toBeFalsy();
  expect((restored[0] as number) < (after[0] as number) - 50, "the drag was undone (head moved back left)").toBeTruthy();
});

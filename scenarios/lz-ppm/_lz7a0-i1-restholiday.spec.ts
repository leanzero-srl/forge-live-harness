// LZ7A0 item 1 — a REST holiday declared by ANOTHER ACCOUNT reaches an open client.
// A has the plan open in Table view with an UNSAVED edit. A POST
// ?resource=schedule&action=holiday under a token minted for a DIFFERENT accountId
// must: re-derive the schedule on A's screen, raise exactly ONE toast, keep the
// unsaved edit, and NOT reload the plan. DELETE must work with the date in the BODY
// and with the date as a QUERY parameter.
import { test, expect } from "../../fixtures/forge";
import fs from "node:fs";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SP = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7a0";
const PLAN = "LZ7A0 retest bed";
const PLAN_ID = "plan-muauibqb-i4pndo";
const MOVER = "WFH-3742";        // D rollout, 2026-11-02 -> 2026-11-13, spans the holiday
const EDITED = "WFH-3740";       // B build, Sep 22 -> Oct 9, untouched by the holiday
const HOLIDAY = "2026-11-04";
test.describe.configure({ retries: 0, timeout: 1_500_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("I1: foreign-account REST holiday reaches an open client", async ({ page }) => {
  const tok = JSON.parse(fs.readFileSync(`${SP}/tok-foreign.json`, "utf8"));
  const post = async (method: string, qs: string, body?: any) => {
    const r = await fetch(`${tok.url}?${qs}`, { method, headers: { Authorization: `Bearer ${tok.token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const t = await r.text();
    return { status: r.status, body: t.slice(0, 300) };
  };

  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(8000);
  const shell = await bodyText(frame);
  console.log("SHELL_UI_REV", (shell.match(/v?4\.58\.\d+/) || [])[0], "| 7.10 present:", /7\.10\.0/.test(shell));
  console.log("SHELL_SNIP", shell.slice(0, 240));

  for (let i = 0; i < 8; i++) {
    await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
    if (await frame.getByRole("button", { name: /^Table/i }).count()) break;
  }
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SP}/i1-00-open.png` });

  const dueOf = async (k: string) => frame.locator(`[data-testid="table-row"][data-row-key="${k}"]`).first().getAttribute("data-row-due").catch(() => null);
  const durOf = async (k: string) => frame.locator(`[data-testid="table-row"][data-row-key="${k}"]`).first().getAttribute("data-row-duration").catch(() => null);
  const before = await dueOf(MOVER);
  console.log("BEFORE", MOVER, "due =", before, "| dur =", await durOf(MOVER));
  expect(before, "bed: D rollout starts on its Jira due date").toBe("2026-11-13");

  // ---- stage an UNSAVED edit on a row the holiday cannot touch ----
  const durCell = frame.locator(`[data-testid="table-row"][data-row-key="${EDITED}"]`).first().locator("div").filter({ hasText: /^\d+d$/ }).first();
  await durCell.click().catch(() => {});
  await page.waitForTimeout(1200);
  const numeric = frame.locator('input[inputmode="numeric"]').first();
  if (await numeric.count()) {
    await numeric.fill("12");
    await numeric.press("Enter");
  } else {
    console.log("NO_NUMERIC_EDITOR — falling back to clicking the duration column cell by index");
  }
  await page.waitForTimeout(2500);
  const staged0 = await bodyText(frame);
  const saveLabel = (staged0.match(/Save\s*\(\d+\)/i) || [])[0] || null;
  console.log("STAGED_AFTER_EDIT", saveLabel, "| edited row dur =", await durOf(EDITED), "due =", await dueOf(EDITED));
  await page.screenshot({ path: `${SP}/i1-01-staged.png` });
  expect(saveLabel, "an unsaved edit must be staged before the holiday arrives").toBeTruthy();
  const editedDue = await dueOf(EDITED), editedDur = await durOf(EDITED);

  // ---- observers: toasts, and a window marker that a plan RELOAD would destroy ----
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await realFrame!.evaluate(() => {
    (window as any).__toasts = [];
    (window as any).__marker = "LZ7A0-ALIVE";
    const seen = new Set<string>();
    const scan = () => document.querySelectorAll('[data-testid="toast"]').forEach((n: any) => {
      const t = (n.textContent || "").replace(/\s+/g, " ").trim();
      if (t && !seen.has(t)) { seen.add(t); (window as any).__toasts.push({ t, at: Date.now() }); }
    });
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    scan();
  });

  // ================= A. POST the holiday under the FOREIGN account =================
  const t0 = Date.now();
  console.log("POST holiday ->", JSON.stringify(await post("POST", `resource=schedule&action=holiday&planId=${PLAN_ID}`, { date: HOLIDAY, name: "LZ7A0 REST holiday" })));
  let ms = -1, after: any = before;
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(500);
    const n = await dueOf(MOVER);
    if (n && n !== before) { after = n; ms = Date.now() - t0; break; }
  }
  console.log("DELIVERY:", MOVER, before, "->", after, "| latency ms", ms);
  await page.waitForTimeout(4000);
  const toasts = await realFrame!.evaluate(() => (window as any).__toasts);
  console.log("TOASTS", JSON.stringify(toasts));
  console.log("MARKER_ALIVE", await realFrame!.evaluate(() => (window as any).__marker));
  const afterBody = await bodyText(frame);
  console.log("STAGED_AFTER_HOLIDAY", (afterBody.match(/Save\s*\(\d+\)/i) || [])[0], "| edited row dur =", await durOf(EDITED), "due =", await dueOf(EDITED));
  await page.screenshot({ path: `${SP}/i1-02-after-holiday.png` });

  expect(after, "D rollout must be re-derived past the declared holiday").toBe("2026-11-16");
  const calToasts = toasts.filter((x: any) => /calendar/i.test(x.t));
  expect(calToasts.length, `exactly ONE calendar toast (saw ${JSON.stringify(toasts)})`).toBe(1);
  expect(calToasts[0].t).toContain("The plan calendar changed — the schedule has been re-derived. Your edits are kept.");
  expect(toasts.some((x: any) => /Dates recalculated for new working day schedule/i.test(x.t)), "the second, weaker toast must be suppressed").toBeFalsy();
  expect(await realFrame!.evaluate(() => (window as any).__marker), "no plan reload").toBe("LZ7A0-ALIVE");
  expect((afterBody.match(/Save\s*\(\d+\)/i) || [])[0], "the unsaved edit survives").toBe(saveLabel);
  expect(await durOf(EDITED), "the edited row's staged duration is unchanged").toBe(editedDur);
  expect(await dueOf(EDITED), "the edited row's staged due is unchanged").toBe(editedDue);

  // ================= B. DELETE with the date in the BODY =================
  await realFrame!.evaluate(() => { (window as any).__toasts = []; });
  const t1 = Date.now();
  console.log("DELETE(body) ->", JSON.stringify(await post("DELETE", `resource=schedule&action=holiday&planId=${PLAN_ID}`, { date: HOLIDAY })));
  let ms1 = -1, rev1: any = after;
  for (let i = 0; i < 120; i++) { await page.waitForTimeout(500); const n = await dueOf(MOVER); if (n && n !== after) { rev1 = n; ms1 = Date.now() - t1; break; } }
  console.log("REVERT(body):", after, "->", rev1, "| latency ms", ms1, "| toasts", JSON.stringify(await realFrame!.evaluate(() => (window as any).__toasts)));
  expect(rev1, "removing the holiday by BODY reverts the schedule").toBe("2026-11-13");

  // ================= C. re-add, then DELETE with the date as a QUERY param =========
  console.log("POST holiday #2 ->", JSON.stringify(await post("POST", `resource=schedule&action=holiday&planId=${PLAN_ID}`, { date: HOLIDAY, name: "LZ7A0 REST holiday" })));
  for (let i = 0; i < 120; i++) { await page.waitForTimeout(500); if ((await dueOf(MOVER)) === "2026-11-16") break; }
  console.log("RE-ADDED due =", await dueOf(MOVER));
  await realFrame!.evaluate(() => { (window as any).__toasts = []; });
  const t2 = Date.now();
  console.log("DELETE(query) ->", JSON.stringify(await post("DELETE", `resource=schedule&action=holiday&planId=${PLAN_ID}&date=${HOLIDAY}`)));
  let ms2 = -1, rev2: any = null;
  for (let i = 0; i < 120; i++) { await page.waitForTimeout(500); const n = await dueOf(MOVER); if (n === "2026-11-13") { rev2 = n; ms2 = Date.now() - t2; break; } }
  console.log("REVERT(query):", "->", rev2, "| latency ms", ms2, "| toasts", JSON.stringify(await realFrame!.evaluate(() => (window as any).__toasts)));
  await page.screenshot({ path: `${SP}/i1-03-after-removals.png` });
  expect(rev2, "removing the holiday by QUERY PARAM reverts the schedule").toBe("2026-11-13");

  // ---- the edit is still there at the end; discard it ----
  const endBody = await bodyText(frame);
  console.log("STAGED_AT_END", (endBody.match(/Save\s*\(\d+\)/i) || [])[0]);
  console.log("CALENDAR_AT_END", JSON.stringify(await post("GET", `resource=schedule&planId=${PLAN_ID}&view=calendar`)));
});

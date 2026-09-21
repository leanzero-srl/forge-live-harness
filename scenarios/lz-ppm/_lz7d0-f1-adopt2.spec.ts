// LZ7D0 item 1 (d) + (e), second attempt — dev 7.13.0 / UI v4.58.650.
// The bed at rest offers NOTHING adoptable (every LZPT date is in the past bar the
// FANOUT cluster) and NO retained captures, so both controls are made drivable:
//  (d) a hook lag on LZPT-205 -> LZPT-206 (Jira 2026-10-05..10-07, the only FUTURE
//      rows) makes 206 a derived row the dialog can adopt; its Epic LZPT-188 is
//      pushed past its own Jira due (2026-10-12) so the ROLLUP number moves too.
//  (e) drag LZPT-215 (the only child that sets BOTH ends of undated Epic LZPT-190),
//      Save, capture a SCENARIO, Discard, then adopt the capture back — the
//      scenario-adopt publish path with a captured parent envelope.
// Restores: lag back to 0, capture deleted, Discard All. NEVER applies to Jira.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7d0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const EPICS = ["LZPT-186", "LZPT-187", "LZPT-188", "LZPT-189", "LZPT-190", "LZPT-191"];
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const F = ["startDate", "dueDate", "duration", "buffer"];
  const iss = p.issues || [];
  const rows: any = {};
  for (const i of iss) rows[i.key] = { s: i.startDate ?? null, d: i.dueDate ?? null, du: i.duration ?? null, b: i.buffer ?? null };
  return {
    n: iss.length,
    dec: iss.filter((i: any) => i.durationExplicitlyCleared === true).map((i: any) => i.key),
    storedDur: iss.filter((i: any) => i.duration !== null && i.duration !== undefined).map((i: any) => `${i.key}=${i.duration}`),
    epicDur: EPICS.map((k) => `${k}=${JSON.stringify(rows[k]?.du)}`),
    carriers: iss.filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => `${i.key}:${i.startDate}/${i.dueDate}/${i.duration}/${i.buffer}`),
    rows,
    savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"),
  };
};
const lag = async (fromKey: string, toKey: string, n: number) => {
  const r: any = await getTestState("lz-ppm", { what: "setLag", planId: PLAN_ID, fromKey, toKey, lag: String(n) });
  console.log("HOOK_SETLAG", JSON.stringify(r));
};
const open = async (page: any, view: "Gantt" | "Table" | "Planning") => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: new RegExp(`^${view}`, "i") }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.locator("[data-gantt-scroll]").first().evaluate((el: any) => { el.scrollLeft = 0; }).catch(() => {});
  await page.waitForTimeout(1500);
  return frame;
};
const mk = (page: any, frame: any) => ({
  gate: async (tag: string) => {
    console.log(tag, "STAGED_TEXT", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
    if (!(await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count())) { console.log(tag, "NO_APPLY_BUTTON"); return []; }
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    const rows = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
    console.log(tag, "APPLY_ROWS", JSON.stringify(rows, null, 1));
    console.log(tag, "EPIC_DUR_LINES", JSON.stringify(rows.filter((r: any) => EPICS.includes(r.key) && /Dur\s*:/i.test(r.text)).map((r: any) => `${r.key} :: ${r.text}`)));
    console.log(tag, "ANY_DUR_LINE", JSON.stringify(rows.filter((r: any) => /Dur\s*:/i.test(r.text)).map((r: any) => `${r.key} :: ${(r.text.match(/Dur[^A-Z]{0,30}/i) || [])[0]}`)));
    await page.screenshot({ path: `${OUT}/d3-${tag}-review.png` });
    await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(1800);
    return rows;
  },
  save: async (tag: string) => {
    const btn = frame.locator('[data-testid="plan-save-btn"]').first();
    console.log(tag, "SAVE_LABEL_BEFORE", ((await btn.textContent().catch(() => "")) || "").trim());
    await btn.click({ timeout: 30000 }).catch((e: any) => console.log(tag, "SAVE_CLICK_ERR", String(e).slice(0, 90)));
    for (let i = 0; i < 240; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
    await page.waitForTimeout(3000);
    console.log(tag, "SAVE_LABEL_AFTER", ((await btn.textContent().catch(() => "")) || "").trim());
    await page.waitForTimeout(6000);
    console.log(tag, "SAVE_LABEL_+6s", ((await btn.textContent().catch(() => "")) || "").trim(), "state", await btn.getAttribute("data-save-state").catch(() => null));
    const post = await snap();
    console.log(tag, "POSTSAVE EPIC_DUR", JSON.stringify(post.epicDur), "STORED_DUR", JSON.stringify(post.storedDur), "DEC", JSON.stringify(post.dec));
    console.log(tag, "POSTSAVE carriers", JSON.stringify(post.carriers));
    await page.screenshot({ path: `${OUT}/d3-${tag}-saved.png` });
    return post;
  },
  discard: async (tag: string) => {
    if (!(await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count())) { console.log(tag, "NOTHING_TO_DISCARD"); return await snap(); }
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3000);
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(14000);
    const d = await snap();
    console.log(tag, "POSTDISCARD EPIC_DUR", JSON.stringify(d.epicDur), "STORED_DUR", JSON.stringify(d.storedDur), "DEC", JSON.stringify(d.dec));
    console.log(tag, "POSTDISCARD carriers", JSON.stringify(d.carriers), "savedEditsKey", d.savedEditsKey);
    console.log(tag, "STAGED_AFTER_DISCARD", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
    return d;
  },
});

test("D3a: adopt a DERIVED row (dialog) — future FANOUT rows made derived by a lag", async ({ page }) => {
  console.log("PRE", JSON.stringify((await snap()).carriers));
  await lag("LZPT-205", "LZPT-206", 10);
  await assertLoggedIn(page);
  const frame = await open(page, "Gantt");
  const g = mk(page, frame);
  const bar = async (k: string) => {
    const b = frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
    if (!(await b.count())) return "ABSENT";
    return `${await b.getAttribute("data-bar-start")}..${await b.getAttribute("data-bar-due")}`;
  };
  await frame.locator('[data-testid="gantt-bar"][data-key="LZPT-206"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1500);
  console.log("BARS 206", await bar("LZPT-206"), "EPIC188", await bar("LZPT-188"));
  const chip = frame.locator('[data-testid="derived-count-chip"]').first();
  console.log("CHIP_TEXT", ((await chip.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim());
  await chip.dispatchEvent("click");
  await page.waitForTimeout(3000);
  console.log("DIALOG_SUBTITLE", ((await frame.locator('[data-testid="derived-review-subtitle"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim());
  const drows = await frame.locator('[data-testid="derived-review-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-key"), sel: e.getAttribute("data-selected"), text: (e.textContent || "").replace(/\s+/g, " ") })));
  console.log("DIALOG_ROWS", JSON.stringify(drows, null, 1));
  await page.screenshot({ path: `${OUT}/d3-00-dialog.png` });
  const adoptBtn = frame.locator('[data-testid="derived-review-adopt"]').first();
  console.log("ADOPT_LABEL", ((await adoptBtn.textContent().catch(() => "")) || "").trim(), "disabled=", await adoptBtn.isDisabled().catch(() => "n/a"));
  if (!(await adoptBtn.isDisabled().catch(() => true))) {
    await adoptBtn.dispatchEvent("click");
    await page.waitForTimeout(12000);
    console.log("AFTER_ADOPT", ((await bodyText(frame)).match(/adopt[^.]{0,160}\./i) || [])[0]);
    await page.screenshot({ path: `${OUT}/d3-01-adopted.png` });
    console.log("BARS_AFTER 206", await bar("LZPT-206"), "EPIC188", await bar("LZPT-188"));
    await g.gate("Dadopt");
    await g.save("Dadopt");
    await g.discard("Dadopt");
  } else {
    console.log("ADOPT_DISABLED — derived adoption NOT DRIVEN");
  }
  await lag("LZPT-205", "LZPT-206", 0);
  const fin = await snap();
  console.log("D3a FINAL carriers", JSON.stringify(fin.carriers), "STORED_DUR", JSON.stringify(fin.storedDur), "DEC", JSON.stringify(fin.dec), "savedEditsKey", fin.savedEditsKey);
});

test("D3b: adopt a SCENARIO capture (History) — captured parent envelope", async ({ page }) => {
  await assertLoggedIn(page);
  const frame = await open(page, "Gantt");
  const g = mk(page, frame);
  const dayNum = (iso: string | null) => (iso ? Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000) : NaN);
  const anchor = async (k: string) => await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first().evaluate((el: any) => ({ left: parseFloat(el.style.left), start: el.getAttribute("data-bar-start") }));
  const aA = await anchor("LZPT-218"), aB = await anchor("LZPT-226");
  let dayPx = (aB.left - aA.left) / (dayNum(aB.start) - dayNum(aA.start));
  const bar = frame.locator('[data-testid="gantt-bar"][data-key="LZPT-215"]').first();
  const TARGET = dayNum("2026-05-05");
  for (let a = 0; a < 10; a++) {
    await bar.scrollIntoViewIfNeeded().catch(() => {});
    const before = dayNum(await bar.getAttribute("data-bar-start"));
    const need = TARGET - before; if (need === 0) break;
    const dx = Math.max(-150, Math.min(150, need * dayPx));
    const bb = await bar.boundingBox(); if (!bb) throw new Error("no bar box");
    const cx = Math.min(bb.x + 40, bb.x + bb.width / 2), cy = bb.y + bb.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + (i * dx) / 8, cy, { steps: 2 }); await page.waitForTimeout(70); }
    await page.waitForTimeout(350); await page.mouse.up(); await page.waitForTimeout(2200);
    const after = dayNum(await bar.getAttribute("data-bar-start"));
    console.log(`DRAG ${a}: ${before} -> ${after}`);
    if (after !== before) dayPx = dx / (after - before);
  }
  console.log("215_AFTER_DRAG", await bar.getAttribute("data-bar-start"), await bar.getAttribute("data-bar-due"));
  await g.save("Eseed");

  // capture the moved schedule as a SCENARIO
  await frame.getByRole("button", { name: /^Planning/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  await frame.getByRole("button", { name: /Scenarios & history/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await frame.getByLabel("Capture name").first().fill("LZ7D0 scenario probe");
  await page.waitForTimeout(600);
  await frame.getByRole("button", { name: /Capture working plan/i }).first().dispatchEvent("click");
  await page.waitForTimeout(14000);
  const entries = await frame.locator(".lz-history-list button").evaluateAll((els: any[]) => els.map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()));
  console.log("HISTORY_ENTRIES", JSON.stringify(entries));
  await page.screenshot({ path: `${OUT}/d3-02-captured.png` });

  // put the working schedule back, so the capture and the plan disagree
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await g.discard("Eseed");
  console.log("AFTER_REVERT 215", await bar.getAttribute("data-bar-start").catch(() => "?"), await bar.getAttribute("data-bar-due").catch(() => "?"));

  // adopt the capture
  await frame.getByRole("button", { name: /^Planning/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  await frame.getByRole("button", { name: /Scenarios & history/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await frame.locator(".lz-history-list button").filter({ hasText: /LZ7D0 scenario probe/ }).first().dispatchEvent("click");
  await page.waitForTimeout(6000);
  console.log("HISTORY_STATS", (await bodyText(frame)).match(/\d+ changed schedules[\s\S]{0,120}/)?.[0]);
  console.log("ADOPT_BTN", await frame.getByRole("button", { name: /Adopt schedule/i }).count());
  await frame.getByRole("button", { name: /Adopt schedule/i }).first().dispatchEvent("click");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/d3-03-adopt-confirm.png` });
  await frame.getByRole("button", { name: /Create working draft/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(12000);
  console.log("ADOPT_NOTICE", (await bodyText(frame)).match(/Scenario adopted[^.]*\.|Keep your current[^.]*\.|already matches[^.]*\.|Wait for the current[^.]*\./)?.[0]);
  await page.screenshot({ path: `${OUT}/d3-04-adopted.png` });

  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  await g.gate("E");
  await g.save("E");
  await g.discard("E");

  // delete the capture
  await frame.getByRole("button", { name: /^Planning/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  await frame.getByRole("button", { name: /Scenarios & history/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await frame.locator(".lz-history-list button").filter({ hasText: /LZ7D0 scenario probe/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByRole("button", { name: /Delete capture/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/d3-05-delete-confirm.png` });
  await frame.getByRole("button", { name: /^Delete capture$/i }).last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  console.log("HISTORY_AFTER_DELETE_EMPTY", /No retained captures yet/i.test(await bodyText(frame)));
  console.log("HISTORY_ENTRIES_AFTER", JSON.stringify(await frame.locator(".lz-history-list button").evaluateAll((els: any[]) => els.map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()))));
  await page.screenshot({ path: `${OUT}/d3-06-final.png` });
  const fin = await snap();
  console.log("D3b FINAL carriers", JSON.stringify(fin.carriers), "STORED_DUR", JSON.stringify(fin.storedDur), "DEC", JSON.stringify(fin.dec), "savedEditsKey", fin.savedEditsKey, "n", fin.n);
});

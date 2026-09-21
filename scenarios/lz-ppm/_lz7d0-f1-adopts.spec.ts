// LZ7D0 item 1 (d) + (e) + item 5 — dev 7.13.0 / UI v4.58.650, bed "LZPT Scenarios".
// (d) adopt a DERIVED row through the derived review dialog; (e) History -> adopt a
// retained capture (if one exists; otherwise reported NOT VERIFIED). After each:
// the Apply review carries no `Dur:` line on any Epic, ?what=plan holds no stored
// Epic duration, the Save button reads Saved, Discard All leaves the bed clean.
// Item 5 re-runs the savedEdits mark checks and the derived-chip sweep.
// NEVER applies to Jira.
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
test.describe.configure({ retries: 0, timeout: 2_400_000 });

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
const mark = async () => {
  const p: any = await getTestState("lz-ppm", { what: "planMeta", planId: PLAN_ID });
  return { has: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"), at: p.meta?.savedEdits?.at ?? null };
};
const pollMark = async (tag: string, want: "present" | "absent", ms = 20000) => {
  const t0 = Date.now(); let last: any = null;
  while (Date.now() - t0 < ms) {
    last = await mark();
    if (want === "present" ? !!last.at : !last.has) { console.log(`${tag} -> ${want} after ${Date.now() - t0}ms`); return Date.now() - t0; }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`${tag} -> STILL NOT ${want} after ${ms}ms`, JSON.stringify(last));
  return -1;
};

test("D2: derived adopt + history adopt leave no stored Epic duration; chip sweep", async ({ page }) => {
  const pre = await snap();
  console.log("PRE", JSON.stringify({ n: pre.n, dec: pre.dec, storedDur: pre.storedDur, carriers: pre.carriers, savedEditsKey: pre.savedEditsKey }));

  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
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
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);

  const applyRows = async () => await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
  const gate = async (tag: string) => {
    console.log(tag, "STAGED_TEXT", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
    if (!(await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count())) { console.log(tag, "NO_APPLY_BUTTON"); return []; }
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    const rows = await applyRows();
    console.log(tag, "APPLY_ROW_COUNT", rows.length);
    console.log(tag, "EPIC_ROWS", JSON.stringify(rows.filter((r: any) => EPICS.includes(r.key))));
    console.log(tag, "EPIC_DUR_LINES", JSON.stringify(rows.filter((r: any) => EPICS.includes(r.key) && /Dur\s*:/i.test(r.text)).map((r: any) => `${r.key} :: ${r.text}`)));
    console.log(tag, "ANY_DUR_LINE", JSON.stringify(rows.filter((r: any) => /Dur\s*:/i.test(r.text)).map((r: any) => `${r.key} :: ${(r.text.match(/Dur[^A-Z]{0,30}/i) || [])[0]}`)));
    console.log(tag, "SAMPLE_ROWS", JSON.stringify(rows.slice(0, 6), null, 1));
    await page.screenshot({ path: `${OUT}/d2-${tag}-review.png` });
    await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(1800);
    return rows;
  };
  const saveAndRead = async (tag: string) => {
    const btn = frame.locator('[data-testid="plan-save-btn"]').first();
    console.log(tag, "SAVE_LABEL_BEFORE", ((await btn.textContent().catch(() => "")) || "").trim());
    await btn.click({ timeout: 30000 }).catch((e: any) => console.log(tag, "SAVE_CLICK_ERR", String(e).slice(0, 120)));
    for (let i = 0; i < 240; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
    await page.waitForTimeout(3000);
    console.log(tag, "SAVE_LABEL_AFTER", ((await btn.textContent().catch(() => "")) || "").trim());
    await pollMark(`${tag}_MARK_AFTER_SAVE`, "present", 20000);
    await page.waitForTimeout(5000);
    console.log(tag, "SAVE_LABEL_+5s", ((await btn.textContent().catch(() => "")) || "").trim(), "state", await btn.getAttribute("data-save-state").catch(() => null));
    const post = await snap();
    console.log(tag, "POSTSAVE EPIC_DUR", JSON.stringify(post.epicDur), "STORED_DUR", JSON.stringify(post.storedDur), "DEC", JSON.stringify(post.dec));
    console.log(tag, "POSTSAVE carriers(n)", post.carriers.length, JSON.stringify(post.carriers.slice(0, 12)));
    await page.screenshot({ path: `${OUT}/d2-${tag}-saved.png` });
    return post;
  };
  const discard = async (tag: string) => {
    if (!(await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count())) { console.log(tag, "NOTHING_TO_DISCARD"); return await snap(); }
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3000);
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
    await pollMark(`${tag}_MARK_AFTER_DISCARD`, "absent", 25000);
    await page.waitForTimeout(8000);
    const d = await snap();
    console.log(tag, "POSTDISCARD EPIC_DUR", JSON.stringify(d.epicDur), "STORED_DUR", JSON.stringify(d.storedDur), "DEC", JSON.stringify(d.dec));
    console.log(tag, "POSTDISCARD carriers", JSON.stringify(d.carriers), "savedEditsKey", d.savedEditsKey);
    console.log(tag, "STAGED_AFTER_DISCARD", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
    await page.screenshot({ path: `${OUT}/d2-${tag}-discarded.png` });
    return d;
  };

  // ============ (e) HISTORY ADOPT — does a capture exist? ============
  await frame.getByRole("button", { name: /^Planning/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  console.log("PLANNING_PRESENT", await frame.locator('[data-testid="planning-workspace"]').count());
  await frame.getByRole("button", { name: /Scenarios & history/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const histText = await bodyText(frame);
  console.log("HISTORY_EMPTY_COPY", /No retained captures yet/i.test(histText));
  const entries = await frame.locator(".lz-history-list button, .lz-history-list a, .lz-history-list li").evaluateAll((els: any[]) => els.map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean));
  console.log("HISTORY_ENTRIES", JSON.stringify(entries.slice(0, 20)));
  await page.screenshot({ path: `${OUT}/d2-00-history.png` });
  let historyDone = false;
  if (entries.length) {
    await frame.locator(".lz-history-list button").first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(4000);
    console.log("SNAPSHOT_DETAIL", await frame.locator('[data-testid="snapshot-detail"]').count());
    const adoptBtn = frame.getByRole("button", { name: /Adopt schedule/i }).first();
    console.log("ADOPT_BTN", await frame.getByRole("button", { name: /Adopt schedule/i }).count());
    if (await frame.getByRole("button", { name: /Adopt schedule/i }).count()) {
      await adoptBtn.dispatchEvent("click");
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/d2-01-adopt-confirm.png` });
      await frame.getByRole("button", { name: /Create working draft/i }).first().dispatchEvent("click").catch(() => {});
      await page.waitForTimeout(9000);
      const notice = (await bodyText(frame)).match(/Scenario adopted[^.]*\.|Keep your current alternative[^.]*\.|already matches[^.]*\./);
      console.log("ADOPT_NOTICE", notice?.[0]);
      await page.screenshot({ path: `${OUT}/d2-02-adopted.png` });
      await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
      await page.waitForTimeout(6000);
      await gate("E");
      await saveAndRead("E");
      await discard("E");
      historyDone = true;
    }
  }
  console.log("HISTORY_ADOPT_VERIFIED", historyDone);

  // ============ (d) DERIVED ADOPT ============
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const chip = frame.locator('[data-testid="derived-count-chip"]').first();
  console.log("CHIP_COUNT", await frame.locator('[data-testid="derived-count-chip"]').count());
  console.log("CHIP_TEXT", ((await chip.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim());
  const cb = await chip.boundingBox();
  if (cb) await page.screenshot({ path: `${OUT}/d2-03-chip.png`, clip: { x: Math.max(0, cb.x - 20), y: Math.max(0, cb.y - 20), width: 700, height: 70 } });
  await chip.dispatchEvent("click");
  await page.waitForTimeout(3000);
  console.log("DIALOG", await frame.locator('[data-testid="derived-review-dialog"]').count());
  console.log("DIALOG_SUBTITLE", ((await frame.locator('[data-testid="derived-review-subtitle"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim());
  const drows = await frame.locator('[data-testid="derived-review-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-key"), sel: e.getAttribute("data-selected"), text: (e.textContent || "").replace(/\s+/g, " ") })));
  console.log("DIALOG_ROW_COUNT", drows.length);
  console.log("DIALOG_ROWS", JSON.stringify(drows.slice(0, 12), null, 1));
  console.log("DIALOG_FINISH", ((await frame.locator('[data-testid="derived-review-finish"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim());
  await page.screenshot({ path: `${OUT}/d2-04-dialog.png` });
  const adopt2 = frame.locator('[data-testid="derived-review-adopt"]').first();
  console.log("ADOPT_LABEL", ((await adopt2.textContent().catch(() => "")) || "").trim(), "disabled=", await adopt2.isDisabled().catch(() => "n/a"));
  await adopt2.dispatchEvent("click");
  await page.waitForTimeout(10000);
  console.log("AFTER_ADOPT_TOAST", ((await bodyText(frame)).match(/adopt[^.]{0,140}\./i) || [])[0]);
  await page.screenshot({ path: `${OUT}/d2-05-after-adopt.png` });
  await gate("D");
  await saveAndRead("D");
  await discard("D");

  const fin = await snap();
  console.log("FINAL EPIC_DUR", JSON.stringify(fin.epicDur), "STORED_DUR", JSON.stringify(fin.storedDur), "DEC", JSON.stringify(fin.dec));
  console.log("FINAL carriers", JSON.stringify(fin.carriers), "savedEditsKey", fin.savedEditsKey, "n", fin.n);
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/d2-06-final.png` });
});

// SEC-7 (d), second half (UX critique 2026-09-19): the expiry sweep had NEVER handled section
// seals — an attachment seal got a halfway reminder, three overdue reminders and an automatic
// release; a section seal got nothing and stayed sealed forever when its owner left. After the fix
// the sweep walks `section-protection-` beside `protection-` through ONE mapping (lapseSubject),
// posts the same notices with the word "section", and hands the section back through the same
// teardown unseal-section uses (release.js: wrapper unwrapped, records gone, activity
// section.auto-released). Server-only, through the hook's expirySweep seam with the clocks planted
// on the record. FAILS before (the sweep answers 0 for a lapsed section), PASSES after.
import { test, expect } from "../../fixtures/forge";
import { setupWorkflowPage, inv, getKvs, setKvs, delKvs, MIHAI } from "./_wf";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
// @ts-ignore
import { readPage, getComments } from "../../data/confluence.mjs";

test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;
const BODY = [heading("Scope", 2), paragraph("What is in and out."), heading("Risks", 2), paragraph("The risks we accept."), heading("Decisions", 2), paragraph("What we decided.")];
const GLOBAL = "admin-settings-global";
const H = 3600_000;
const strip = (s: string) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const sweep = async () => (await inv("expirySweep")).result;

test("SEC-7 sweep: a section seal gets the halfway reminder, the overdue reminders and the automatic release", async () => {
  const bed = await setupWorkflowPage("sec7-sweep", { body: BODY });
  const P = bed.pageId;
  const before = await getKvs(GLOBAL);
  let sid: string | null = null;
  try {
    // The comment master ON for the run (the app default is off); halfway + expiry sub-switches at their default (on).
    await setKvs(GLOBAL, { ...(before || {}), enableEmailDispatches: true, enableConfluenceDispatches: true, autoUnlockEnabled: true });
    const hs = await call("list-page-headings", { pageId: P });
    const risks = (hs?.headings || []).find((h: any) => h.text === "Risks");
    const s = await call("seal-section", { pageId: P, headingIndex: risks.index, headingText: "Risks", lockDuration: 2 * 3600 });
    expect(s?.success, `seal (${JSON.stringify(s).slice(0, 160)})`).toBe(true);
    sid = s.sectionId;
    const rec0 = await getKvs(`section-protection-${sid}`);

    // ── halfway: sealed 1h50 ago for 2h → the midpoint has passed, the seal is live ──────────
    const now = Date.now();
    await setKvs(`section-protection-${sid}`, { ...rec0, timestamp: new Date(now - 110 * 60_000).toISOString(), expiresAt: new Date(now + 10 * 60_000).toISOString() });
    const r1 = await sweep();
    console.log("### sweep 1 (halfway):", JSON.stringify(r1));
    expect(r1?.fiftyPctReminders, "a halfway reminder went out").toBeGreaterThanOrEqual(1);
    expect(await getKvs(`fifty-percent-reminder-sent-${sid}`), "…and is marked on the SECTION's key").toBeTruthy();
    let bodies = (await getComments(P)).map((c: any) => strip(c.body?.storage?.value));
    console.log("### comments after halfway:", JSON.stringify(bodies));
    const half = bodies.find((b: string) => /midpoint/i.test(b)) || "";
    expect(half, "the halfway comment is on the page").toBeTruthy();
    expect(half).toMatch(/section "Risks"/);
    expect(half).not.toMatch(/\bfile\b/);
    expect((await sweep())?.fiftyPctReminders ?? 0, "a second sweep does not remind again for this seal").toBeLessThan((r1?.fiftyPctReminders ?? 0) + 1);

    // ── lapsed: reminder 1 of 3, a dispatch for the ribbon, the seal still on the page ───────
    await setKvs(`section-protection-${sid}`, { ...rec0, timestamp: new Date(now - 3 * H).toISOString(), expiresAt: new Date(now - 60_000).toISOString() });
    const r2 = await sweep();
    console.log("### sweep 2 (lapsed):", JSON.stringify(r2));
    expect(r2?.notifiedCount, "an overdue reminder went out").toBeGreaterThanOrEqual(1);
    const counter = await getKvs(`expiry-notified-${sid}`);
    console.log("### counter:", JSON.stringify(counter));
    expect(counter?.count, "reminder 1 of 3 recorded on the section's counter").toBe(1);
    expect(counter?.sectionId).toBe(sid);
    expect(await getKvs(`section-protection-${sid}`), "the seal is still there after reminder 1").toBeTruthy();
    const feed = (await getKvs("recent-notifications"))?.events || [];
    const disp = feed.find((e: any) => e.sectionId === sid && e.type === "reservation-expired");
    expect(disp, "a reservation-expired dispatch names the section").toBeTruthy();
    expect(disp?.attachmentName).toBe("Risks");
    bodies = (await getComments(P)).map((c: any) => strip(c.body?.storage?.value));
    const overdue = bodies.find((b: string) => /Seal Overdue/i.test(b)) || "";
    console.log("### overdue comment:", overdue);
    expect(overdue).toMatch(/section "Risks"/);
    expect(overdue).toMatch(/reminder 1 of 3/);
    expect(overdue).toMatch(/⋯ .{0,2}Extend the seal/); // the arrow is &rarr; in storage format
    expect(overdue).not.toMatch(/\bfile\b/);
    expect((await sweep())?.notifiedCount ?? 0, "an hour has not passed: no second reminder yet").toBeLessThan((r2?.notifiedCount ?? 0) + 1);

    // ── the reminders ran out: the section is handed back ────────────────────────────────────
    await setKvs(`expiry-notified-${sid}`, { ...counter, count: 3, sentAt: new Date(now - 25 * H).toISOString(), firstSentAt: new Date(now - 73 * H).toISOString() });
    const r3 = await sweep();
    console.log("### sweep 3 (release):", JSON.stringify(r3));
    expect(r3?.autoReleasedCount, "the section was released automatically").toBeGreaterThanOrEqual(1);
    expect(await getKvs(`section-protection-${sid}`), "the seal record is gone").toBeNull();
    expect(await getKvs(`section-snapshot-${sid}`), "the snapshot is gone").toBeNull();
    if (rec0.spaceId) expect(await getKvs(`space-section-protection-${rec0.spaceId}-${sid}`), "the space index row is gone").toBeNull();
    expect(await getKvs(`expiry-notified-${sid}`), "the counter is gone").toBeNull();
    const page = await readPage(P);
    const wrappers = (page.adf.content || []).filter((n: any) => n.type === "bodiedExtension");
    expect(wrappers.length, "the wrapper was unwrapped — the body is back on the page").toBe(0);
    expect(JSON.stringify(page.adf), "…with its text intact").toContain("The risks we accept.");
    const act = await call("get-page-activity", { pageId: P, limit: 10 });
    const auto = (act?.entries || []).find((e: any) => e.type === "section.auto-released");
    console.log("### activity:", JSON.stringify(auto));
    expect(auto, "the trail says the section seal lapsed and was released").toBeTruthy();
    expect(auto?.details?.noticeCount).toBe(3);
    expect(auto?.details?.unwrapped).toBe(true);
    const feed2 = (await getKvs("recent-notifications"))?.events || [];
    expect(feed2.some((e: any) => e.sectionId === sid && e.type === "seal-auto-released"), "a seal-auto-released dispatch names the section").toBe(true);
    bodies = (await getComments(P)).map((c: any) => strip(c.body?.storage?.value));
    const released = bodies.find((b: string) => /released automatically/i.test(b)) || "";
    console.log("### release comment:", released);
    expect(released).toMatch(/section "Risks"/);
    expect(released).not.toMatch(/\bfile\b/);
    const rows = await call("enumerate-section-seals", { pageId: P });
    expect((rows?.sections || []).length, "no section rows remain").toBe(0);
    sid = null;
  } finally {
    if (sid) await call("unseal-section", { sectionId: sid }).catch(() => {});
    if (before == null) await delKvs(GLOBAL).catch(() => {}); else await setKvs(GLOBAL, before);
    await bed.restore();
  }
});

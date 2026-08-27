// Owner feedback 2026-08-27 — the "Overdue" dead end, proved live against the deployed resolvers.
//
// Three items in that review share one root: a lapsed seal had no way forward.
//
//   F1  "When I request edit permissions on a sealed picture sometimes the request remain
//        available even if I choose approve; it disappear if I choose deny instead."
//        approveEditRequest refuses an expired seal (a grant carries the seal's expiresAt, so it
//        would be born dead). denyEditRequest never had that check. Every seal in the reported
//        screenshot was OVERDUE — so approve always failed and deny always worked.
//
//   F4  There was no way to renew a seal at all. The only exit was unseal-and-seal-again, which
//        loses the labels, the comment, the presentation baseline and every edit grant.
//
//   F5  "If a sealed image is overdue a notice message must be sent to the owner and after 3
//        notifications/days if the user dosen't extend the period the image must became
//        available (there are situation when a user is leaving the company and if he is stealing
//        a section/image this remain as unavailable)."
//        The sweep notified ONCE and held the seal for ever.
//
// Everything here runs through the dev testhook against the REAL resolvers and the REAL scheduled
// task. The seals are synthetic and carry contentId:null so the sweep skips its comment — no real
// page is touched. The clock is moved by rewriting the sweep's own bookkeeping record, which is
// the only honest way to see a three-day countdown inside one run.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
// Owner and requester are SYNTHETIC on purpose. Every resolver driven here decides from the
// caller's own accountId against the seal record and never touches Confluence content, so the
// SV-SEC-1 content gate is not on these paths (see CLAUDE.md: "Synthetic ids remain fine where
// the path filters on the caller's own accountId and never touches content"). The gate itself is
// covered by authz-content-gate.spec.ts.
const OWNER = "sv-aql-lapse-owner";
const REQUESTER = "sv-aql-lapse-requester";
const STRANGER = "sv-aql-lapse-stranger";

const inv = (fn: string, params: Record<string, string> = {}) =>
  getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const setKvs = (key: string, val: any) =>
  getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });

const DAY = 24 * 3600 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function seal(attId: string, expiresAt: string) {
  return {
    attachmentId: attId,
    lockedBy: OWNER,
    lockedByName: "Lapse Owner",
    timestamp: ago(30 * DAY),
    expiresAt,
    spaceKey: SPACE,
    spaceId: null,       // no index leg to clean — keeps the fixture self-contained
    contentId: null,     // the sweep skips the comment, so no real page is written
    attachmentName: "harness-lapsed-seal.png",
  };
}

test.describe.configure({ timeout: 180_000 });

// ═════════════════════════════════════════════════════════════════════════════════════════
test.describe("F1/F4 — approve on a lapsed seal, and the Extend that unblocks it", () => {
  const ATT = `harness-lapse-f1-${Date.now().toString(36)}`;
  const SEAL = `protection-${ATT}`;
  const REQ = `edit-request-${ATT}-${REQUESTER}`;
  const GRANT = `edit-grant-${ATT}-${REQUESTER}`;

  test.afterAll(async () => {
    for (const k of [SEAL, REQ, GRANT, `expiry-notified-${ATT}`, `fifty-percent-reminder-sent-${ATT}`]) {
      await delKvs(k).catch(() => {});
    }
  });

  test("the reported asymmetry is real, and Extend is the way out of it", async () => {
    // ── A LAPSED seal with a pending edit request — the state in the owner's screenshot ──
    // Pin the expiry once: ago() is relative to now, so recomputing it later in the test would
    // compare against a different instant and fail on the seconds the test itself took.
    const lapsedExpiry = ago(2 * DAY);
    await setKvs(SEAL, seal(ATT, lapsedExpiry));
    await setKvs(REQ, {
      artifactId: ATT, requesterAccountId: REQUESTER, requesterName: "Lapse Requester",
      ownerAccountId: OWNER, reason: "i need it", status: "pending",
      requestedAt: new Date().toISOString(),
    });
    await delKvs(GRANT).catch(() => {});

    const listed = await inv("listEditRequests", { att: ATT, actor: OWNER });
    expect(listed.result?.requests?.length, "the owner sees the pending request").toBe(1);

    // THE BUG. Approve refuses; the panel used to swallow this into a console.error, so the row
    // simply stayed on screen looking like a dead button.
    const approveLapsed = await inv("approveEditRequest", { att: ATT, actor: OWNER, requester: REQUESTER });
    expect(approveLapsed.result?.success, "approve on a LAPSED seal is refused").toBe(false);
    expect(approveLapsed.result?.reason, "and the refusal now names the remedy the UI offers")
      .toMatch(/lapsed/i);
    expect(approveLapsed.result?.reason, "…which is Extend").toMatch(/extend/i);

    // The refusal must be inert: no grant minted, and the request is still there to act on.
    expect(await getKvs(GRANT), "a refused approve mints NO grant").toBeFalsy();
    expect((await getKvs(REQ))?.status, "…and leaves the request pending").toBe("pending");
    console.log("### F1: approve on a lapsed seal → refused, with an actionable reason ✓");

    // ── F4: Extend. This is what the owner asked for and what makes the refusal answerable. ──
    const strangerExtend = await inv("extendSeal", { att: ATT, actor: STRANGER });
    expect(strangerExtend.result?.success, "a stranger cannot extend someone else's seal").toBe(false);
    expect(strangerExtend.result?.reason).toMatch(/owner or a space steward/i);
    expect((await getKvs(SEAL))?.expiresAt, "a refused extend does not move the expiry")
      .toBe(lapsedExpiry);

    const before = await getKvs(SEAL);
    const extended = await inv("extendSeal", { att: ATT, actor: OWNER, seconds: String(3 * 24 * 3600) });
    expect(extended.result?.success, "the owner CAN extend").toBe(true);

    const after = await getKvs(SEAL);
    expect(new Date(after.expiresAt).getTime(), "the seal is no longer lapsed").toBeGreaterThan(Date.now());
    expect(new Date(after.expiresAt).getTime(), "…and it moved forward")
      .toBeGreaterThan(new Date(before.expiresAt).getTime());
    // A lapsed seal extends from NOW, not from its dead expiry — anchoring on a past date would
    // hand back a seal that is still overdue.
    const drift = Math.abs(new Date(after.expiresAt).getTime() - (Date.now() + 3 * DAY));
    expect(drift, "a LAPSED seal extends from now, not from its expired date").toBeLessThan(10 * 60 * 1000);
    expect(after.extensionCount, "the extension is recorded").toBe(1);
    expect(after.lockedBy, "…and nothing else about the seal changed").toBe(OWNER);
    expect(after.attachmentName).toBe("harness-lapsed-seal.png");
    console.log(`### F4: extend → expiresAt ${before.expiresAt} → ${after.expiresAt} ✓`);

    // ── And now the same approve that failed, succeeds. The dead end is gone. ──
    const approveLive = await inv("approveEditRequest", { att: ATT, actor: OWNER, requester: REQUESTER });
    expect(approveLive.result?.success, "approve succeeds once the seal is live again").toBe(true);
    const grant = await getKvs(GRANT);
    expect(grant, "the grant exists").toBeTruthy();
    expect(grant.editorAccountId, "…for the requester").toBe(REQUESTER);
    expect(new Date(grant.expiresAt).getTime(), "…and it is scoped to the EXTENDED expiry")
      .toBeGreaterThan(Date.now());
    expect(await getKvs(REQ), "…and the request is consumed, so the row leaves the panel").toBeFalsy();
    console.log("### F1: after Extend, approve consumes the request ✓");
  });

  test("a live seal extends from its current expiry, and carries its edit grants with it", async () => {
    // The other half of the extend rule: a seal that has NOT lapsed must not lose the time it
    // already has. And its grants are TTL'd to the old expiry — extending the seal without
    // extending them would silently revoke an approved editor partway through the new period.
    const liveExpiry = new Date(Date.now() + 2 * DAY).toISOString();
    await setKvs(SEAL, { ...seal(ATT, liveExpiry) });
    await setKvs(GRANT, {
      artifactId: ATT, editorAccountId: REQUESTER, editorName: "Lapse Requester",
      grantedBy: OWNER, grantedAt: new Date().toISOString(), expiresAt: liveExpiry,
    });

    const r = await inv("extendSeal", { att: ATT, actor: OWNER, seconds: String(3 * 24 * 3600) });
    expect(r.result?.success, "extending a live seal works too").toBe(true);

    const after = await getKvs(SEAL);
    const drift = Math.abs(new Date(after.expiresAt).getTime() - (new Date(liveExpiry).getTime() + 3 * DAY));
    expect(drift, "a LIVE seal extends from its current expiry — the owner keeps what they had")
      .toBeLessThan(10 * 60 * 1000);

    const grant = await getKvs(GRANT);
    expect(grant, "the edit grant survived the extension").toBeTruthy();
    expect(grant.expiresAt, "…and was carried forward to the new expiry").toBe(after.expiresAt);
    console.log("### F4: live seal extends from its expiry; the grant follows ✓");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
test.describe("F5 — three reminders, then the file is handed back", () => {
  const ATT = `harness-lapse-f5-${Date.now().toString(36)}`;
  const SEAL = `protection-${ATT}`;
  const COUNTER = `expiry-notified-${ATT}`;

  test.afterAll(async () => {
    for (const k of [SEAL, COUNTER, `fifty-percent-reminder-sent-${ATT}`, `reminder-sent-${ATT}`]) {
      await delKvs(k).catch(() => {});
    }
  });

  // Move the sweep's own bookkeeping back in time. The countdown is a real clock — a day between
  // reminders — so this is what lets one test run observe three days of it.
  async function rewindLastNotice(byMs: number) {
    const rec = await getKvs(COUNTER);
    expect(rec, "there is a counter to rewind").toBeTruthy();
    await setKvs(COUNTER, { ...rec, sentAt: new Date(new Date(rec.sentAt).getTime() - byMs).toISOString() });
  }

  test("an overdue seal is reminded 3 times and then RELEASED — the departed-owner case", async () => {
    await setKvs(SEAL, seal(ATT, ago(1 * DAY)));
    await delKvs(COUNTER);
    expect(await getKvs(COUNTER), "no reminders sent yet").toBeFalsy();

    // ── Reminder 1 ──────────────────────────────────────────────────────────
    let res = await inv("expirySweep");
    let counter = await getKvs(COUNTER);
    expect(counter, "the sweep recorded a reminder").toBeTruthy();
    expect(counter.count, "reminder 1 of 3").toBe(1);
    expect(counter.firstSentAt, "the run's start is recorded").toBeTruthy();
    expect(await getKvs(SEAL), "the seal is still held after one reminder").toBeTruthy();

    // ── The interval guard: the sweep runs HOURLY and must not comment hourly ──
    res = await inv("expirySweep");
    counter = await getKvs(COUNTER);
    expect(counter.count, "an immediate second sweep sends nothing — one reminder per day").toBe(1);
    console.log("### F5: reminder 1 sent; an immediate re-sweep is silent ✓");

    // ── Reminder 2, a day later ─────────────────────────────────────────────
    await rewindLastNotice(25 * 3600 * 1000);
    await inv("expirySweep");
    counter = await getKvs(COUNTER);
    expect(counter.count, "a day later, reminder 2").toBe(2);
    expect(await getKvs(SEAL), "still held").toBeTruthy();

    // ── Reminder 3 ──────────────────────────────────────────────────────────
    await rewindLastNotice(25 * 3600 * 1000);
    await inv("expirySweep");
    counter = await getKvs(COUNTER);
    expect(counter.count, "two days later, reminder 3 — the last one").toBe(3);
    expect(await getKvs(SEAL), "STILL held: three reminders were promised, three were sent").toBeTruthy();
    console.log("### F5: reminders 2 and 3 sent, seal still held ✓");

    // ── The release ─────────────────────────────────────────────────────────
    await rewindLastNotice(25 * 3600 * 1000);
    res = await inv("expirySweep");
    expect(res.result?.autoReleasedCount, "the sweep reports the release").toBeGreaterThanOrEqual(1);
    expect(await getKvs(SEAL), "THE SEAL IS GONE — the file is available to everyone again").toBeFalsy();
    // The bookkeeping goes with it, so a later re-seal of the same file starts a clean countdown
    // rather than inheriting a spent one.
    expect(await getKvs(COUNTER), "the reminder counter was cleaned up with the seal").toBeFalsy();
    console.log("### F5: after 3 reminders the seal auto-released ✓");

    // ── And it does not keep releasing something that is already gone ────────
    const after = await inv("expirySweep");
    expect(after.result?.autoReleasedCount, "nothing left to release").toBe(0);
  });

  test("extending a lapsed seal cancels the countdown", async () => {
    // The whole point of the reminders is that the owner can act on them. If Extend did not reset
    // the counter, a seal extended after two reminders would be released after only one more.
    const ATT2 = `harness-lapse-f5b-${Date.now().toString(36)}`;
    const SEAL2 = `protection-${ATT2}`;
    const COUNTER2 = `expiry-notified-${ATT2}`;
    try {
      await setKvs(SEAL2, seal(ATT2, ago(1 * DAY)));
      await delKvs(COUNTER2);

      await inv("expirySweep");
      let c = await getKvs(COUNTER2);
      expect(c?.count, "one reminder against this seal").toBe(1);

      const ext = await inv("extendSeal", { att: ATT2, actor: OWNER, seconds: String(7 * 24 * 3600) });
      expect(ext.result?.success, "the owner extends after the reminder").toBe(true);
      expect(await getKvs(COUNTER2), "the countdown is reset, not merely paused").toBeFalsy();

      // A sweep now finds a live seal and leaves it alone entirely.
      await inv("expirySweep");
      expect(await getKvs(COUNTER2), "a live seal produces no reminder").toBeFalsy();
      expect(await getKvs(SEAL2), "…and is certainly not released").toBeTruthy();
      console.log("### F5: extending cancels the countdown ✓");
    } finally {
      await delKvs(SEAL2).catch(() => {});
      await delKvs(COUNTER2).catch(() => {});
    }
  });

  test("a seal released by the owner trashing it (trashedOnly) is never auto-released", async () => {
    // S7 tracking records are not seals. The sweep must skip them, or the auto-release would fire
    // on a record that represents an already-released seal.
    const ATT3 = `harness-lapse-f5c-${Date.now().toString(36)}`;
    const SEAL3 = `protection-${ATT3}`;
    const COUNTER3 = `expiry-notified-${ATT3}`;
    try {
      await setKvs(SEAL3, { ...seal(ATT3, ago(30 * DAY)), trashedOnly: true });
      await delKvs(COUNTER3);
      await inv("expirySweep");
      expect(await getKvs(COUNTER3), "a trashedOnly record produces no reminder").toBeFalsy();
      expect(await getKvs(SEAL3), "…and is left exactly where it was").toBeTruthy();
      console.log("### F5: trashedOnly tracking records are skipped ✓");
    } finally {
      await delKvs(SEAL3).catch(() => {});
      await delKvs(COUNTER3).catch(() => {});
    }
  });
});

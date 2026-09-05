// Coverage gap (2026-09-05) — check-seal-stamp, the 5-second cross-surface poll every panel and
// ribbon runs to learn that a seal changed somewhere else. Proven by reading the stamp, making a
// real seal mutation through a resolver (extend-seal on the fixture seal, +60 s on a one-year
// seal — harmless and self-evidently the cause), and reading the stamp again: it must move
// forward, and the seal's expiry must have moved by the amount asked for.
//
// NOT claimed here: enumerate-operator-seals ("My Sealed Files"). Its rows are built by probing
// every attachment asUser(), and a webtrigger has no user session, so from the hook every row is
// skipped and the list is empty for everyone — an assertion on that would prove the limitation,
// not the feature. The populated list is a browser-lane proof (My Sealed Files tab as Mihai).
// @covers resolver:check-seal-stamp
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const ATT = process.env.SV_ATTACHMENT_ID || "att265945089";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086"; // owns the fixture seal
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;

test.describe.configure({ timeout: 120_000, retries: 1 });

test("check-seal-stamp moves when a seal is extended", async () => {
  const seal0 = await getKvs(`protection-${ATT}`);
  expect(seal0?.lockedBy, `fixture seal protection-${ATT} owned by Mihai (run npm run ensure-fixture)`).toBe(MIHAI);
  expect(new Date(seal0.expiresAt).getTime(), "fixture seal is live").toBeGreaterThan(Date.now());

  const before = await inv("checkSealStamp");
  expect(before.result, "the stamp read returns { stamp }").toHaveProperty("stamp");
  const stampBefore = Number(before.result.stamp) || 0;

  // A real mutation through a real resolver, as the owner.
  await new Promise((r) => setTimeout(r, 5)); // Date.now() granularity guard for the stamp compare
  const ext = await inv("extendSeal", { att: ATT, actor: MIHAI, seconds: "60" });
  expect(ext.result?.success, `the owner extends the fixture seal (got: ${ext.result?.reason})`).toBe(true);

  const after = await inv("checkSealStamp");
  const stampAfter = Number(after.result.stamp) || 0;
  expect(stampAfter, "the stamp advanced after the mutation").toBeGreaterThan(stampBefore);
  expect(stampAfter, "…to a wall-clock timestamp (ms), which is what the 5-second poll compares").toBeGreaterThan(Date.now() - 5 * 60_000);
  expect(stampAfter).toBeLessThanOrEqual(Date.now() + 60_000);

  const seal1 = await getKvs(`protection-${ATT}`);
  const moved = new Date(seal1.expiresAt).getTime() - new Date(seal0.expiresAt).getTime();
  expect(Math.abs(moved - 60_000), "the seal expiry moved by the 60 s asked for (a live seal extends from its current expiry)").toBeLessThan(5_000);
  expect(seal1.extensionCount, "the extension was recorded").toBe((Number(seal0.extensionCount) || 0) + 1);
  expect(seal1.lockedBy, "ownership untouched").toBe(MIHAI);

  const again = await inv("checkSealStamp");
  expect(Number(again.result.stamp), "a plain read does not move the stamp").toBe(stampAfter);
  console.log(`### check-seal-stamp ✓ (${stampBefore} → ${stampAfter}; expiry +${Math.round(moved / 1000)}s)`);
});

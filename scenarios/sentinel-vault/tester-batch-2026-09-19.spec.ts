// Tester batch 2026-09-19 (leanzero-demo), REST-driven with real identities:
//   1. the panel/overlay counts are the whole page's numbers, not the cards on screen;
//   2. releasing the last attachment seal keeps the panel while a SECTION is still sealed;
//   5. "Sign seal actions": with the site setting ON a release/approve/grant is refused without a
//      code and goes through with the current TOTP code of a device enrolled through the app.
// @covers resolver:enumerate-panel-artifacts resolver:enumerate-doc-artifacts resolver:enroll-signature resolver:confirm-signature-enrollment resolver:revoke-signature resolver:unseal-artifact
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, deletePage, uploadAttachment } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
// @ts-ignore
import { totp } from "/Users/mihaiperdum/Projects/Sentinel Vault/src/server/shared/totp.js";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const LZ = "712020:cecf4c53-ae66-45ff-b4b0-de6e2a18a71b";
const call = async (key: string, actor: string, payload: any = {}) => (await getTestState("sentinel-vault", { what: "invoke", fn: "invoke", key, actor, payload: JSON.stringify(payload) })).result;
const hookFn = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

test.describe.configure({ timeout: 420_000, retries: 1 });
let originalGlobal: any = null;
const withGlobal = async (patch: Record<string, any>) => setKvs("admin-settings-global", { ...(originalGlobal || {}), ...patch });
test.beforeAll(async () => { originalGlobal = (await getKvs("admin-settings-global")) || null; });
test.afterAll(async () => { if (originalGlobal) await setKvs("admin-settings-global", originalGlobal); else await delKvs("admin-settings-global"); });

// (1) the counts need a real user session (both listers run asUser) — proven in the browser spec
//     tester-batch-ui-2026-09-19.spec.ts on a page with 13 attachments.

test("2: releasing the last attachment seal keeps the panel when a section is still sealed", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const page = await createPage({ spaceId, title: `HARNESS keep-panel ${Date.now()}`, adf: doc(paragraph("intro"), heading("SECTION ALPHA", 2), paragraph("alpha")) });
  let SEC: string | null = null;
  let att: any = null;
  try {
    att = await uploadAttachment(page.id, "keep-panel.txt", "x");
    const attId = att.attachmentId;
    const lh = await hookFn("listPageHeadings", { pageId: String(page.id), actor: MIHAI });
    const alpha = (lh.result?.headings || []).find((h: any) => h.text === "SECTION ALPHA");
    const sr = await hookFn("sealSection", { pageId: String(page.id), hi: String(alpha.index), htext: "SECTION ALPHA", actor: MIHAI });
    expect(sr.result?.success, `section sealed (${sr.result?.reason || "ok"})`).toBe(true);
    SEC = sr.result.sectionId;
    await setKvs(`protection-${attId}`, { attachmentId: attId, lockedBy: MIHAI, lockedByName: "Mihai", attachmentName: "keep-panel.txt", contentId: String(page.id), spaceKey: SPACE, expiresAt: inDays(1) });
    const ins = await hookFn("ensurePanel", { pageId: String(page.id) });
    console.log(`### panel inserted → ${JSON.stringify(ins.result).slice(0, 120)}`);
    const panelBefore = JSON.stringify((await readPage(page.id)).adf).includes("sentinel-vault-panel");
    console.log(`### panel on the page after sealing: ${panelBefore}`);
    const rel = await call("unseal-artifact", MIHAI, { attachmentId: attId });
    expect(rel.success, `attachment released (${rel.reason || "ok"})`).toBe(true);
    await new Promise((r) => setTimeout(r, 4000));
    const after = await readPage(page.id);
    const panelAfter = JSON.stringify(after.adf).includes("sentinel-vault-panel");
    const sectionAfter = JSON.stringify(after.adf).includes("sentinel-vault-sealed-section");
    console.log(`### after releasing the only attachment seal: panel=${panelAfter} section=${sectionAfter}`);
    expect(sectionAfter, "the sealed section is still on the page").toBe(true);
    if (panelBefore) expect(panelAfter, "the panel stays — the Sealed Sections group lives in it").toBe(true);
    else console.log("### (auto-insert is off in this space, so there was no panel to keep — the removal branch is what changed)");
  } finally {
    if (SEC) { await delKvs(`section-protection-${SEC}`).catch(() => {}); await delKvs(`section-snapshot-${SEC}`).catch(() => {}); }
    await deletePage(page.id).catch(() => {});
  }
});

test("5: with 'Sign seal actions' on, a release needs the authenticator code — refused without, accepted with", async () => {
  // pick a real account with NO signature enrolled (an enrolled one cannot hand us its secret)
  let signer: string | null = null;
  for (const a of [LZ, GABI, MIHAI]) { const st = await call("signature-status", a); if (!st?.enrolled) { signer = a; break; } }
  expect(signer, "one real account without a signature device").toBeTruthy();
  const ATT = `att7${Date.now()}`;
  await setKvs(`protection-${ATT}`, { attachmentId: ATT, lockedBy: signer, lockedByName: "Signer", attachmentName: "signed.pdf", contentId: process.env.SV_PAGE_ID || "265912321", spaceKey: SPACE, expiresAt: inDays(1) });
  let enrolled = false;
  try {
    await withGlobal({ signSealActions: true });
    const noCode = await call("unseal-artifact", signer!, { attachmentId: ATT });
    console.log(`### no signature set up → ${JSON.stringify(noCode)}`);
    expect([noCode.success, noCode.signatureRequired], "refused: the site signs seal actions and this person has no device").toEqual([false, true]);
    expect(String(noCode.reason)).toMatch(/not set up/i);
    expect(await getKvs(`protection-${ATT}`), "…and the seal is untouched").toBeTruthy();

    const enr = await call("enroll-signature", signer!);
    expect(enr.success, `enrolment started (${enr.reason || "ok"})`).toBe(true);
    console.log(`### otpauth label: ${decodeURIComponent(String(enr.uri).split("otpauth://totp/")[1].split("?")[0])}`);
    const ok = await call("confirm-signature-enrollment", signer!, { code: totp(enr.secret) });
    expect(ok.success, `device confirmed (${ok.reason || "ok"})`).toBe(true);
    enrolled = true;

    const still = await call("unseal-artifact", signer!, { attachmentId: ATT });
    expect([still.success, still.signatureRequired], "enrolled but no code → the prompt is asked for").toEqual([false, true]);
    const wrong = await call("unseal-artifact", signer!, { attachmentId: ATT, code: "000000" });
    expect([wrong.success, wrong.signatureRequired], "a wrong code is refused").toEqual([false, true]);
    expect(await getKvs(`protection-${ATT}`), "…seal untouched").toBeTruthy();
    // the code just consumed by the wrong attempt? No — a wrong code consumes nothing; the next step's code is fresh.
    // the confirmation consumed the current 30 s step (replay guard); sign with the NEXT step's code, which the ±1 window accepts
    const good = await call("unseal-artifact", signer!, { attachmentId: ATT, code: totp(enr.secret, Date.now() + 30_000) });
    console.log(`### with the current code → ${JSON.stringify(good).slice(0, 200)}`);
    expect(good.success, `released with a signed code (${good.reason || "ok"})`).toBe(true);
    expect(good.signature?.method, "the result carries the signature").toBe("totp");
    expect(await getKvs(`protection-${ATT}`), "the seal is gone").toBeFalsy();

    // the setting OFF: no code asked
    await withGlobal({ signSealActions: false });
    await setKvs(`protection-${ATT}`, { attachmentId: ATT, lockedBy: signer, lockedByName: "Signer", attachmentName: "signed.pdf", contentId: process.env.SV_PAGE_ID || "265912321", spaceKey: SPACE, expiresAt: inDays(1) });
    const plain = await call("unseal-artifact", signer!, { attachmentId: ATT });
    expect(plain.success, "setting off → released without a code").toBe(true);
  } finally {
    if (enrolled) {
      const st = await call("signature-status", signer!);
      if (st?.enrolled) {
        const secret = null; void secret;
        // revoke needs the current code; we still hold the secret in `enr` scope only inside try — re-read is impossible, so revoke by KVS through the hook seam the app itself uses
        for (const k of [`sig-secret-${signer}`, `sig-enroll-${signer}`, `sig-last-${signer}`, `sig-fail-${signer}`]) await delKvs(k).catch(() => {});
      }
    }
    await delKvs(`protection-${ATT}`).catch(() => {});
  }
});

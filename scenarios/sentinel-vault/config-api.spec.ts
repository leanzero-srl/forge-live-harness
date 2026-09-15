// Sentinel Vault — configuration REST API (docs/REST-CONFIG-API.md), live on dev.
//
// No browser: the endpoint is a STATIC web trigger driven with plain fetch, tokens are minted
// through the dev test hook (fn=createApiToken, as the real Mihai account), and the receipts are
// read back through the hook (what=kvs&key=api-job-<tokenId>:<key>) and through Confluence's own v2 REST
// (space property sentinel-vault-receipt on WFH, with the harness credentials — the customer's
// read path). The load-bearing assertions are the REFUSALS (401 / 403 / 405 / 400 / 409) and the
// state changes (admin-settings-space-WFH.defaultLockDuration, protection-att265945089).
//
// Fixture facts: page 265912321 in WFH holds att265945089, SEALED by Mihai (seeded by
// test-harness/scripts/ensure-fixture.mjs). A bundle that seals it is therefore the design's
// "already sealed by the same owner → no-op success" case; the unseal at the end releases it and
// ensure-fixture re-seeds it so every other spec keeps its fixture.
//
// Red-team round (2026-09-15): the minter is a site admin who can edit every page on the site, so
// a per-page REFUSAL cannot be manufactured with a real page (SVSEC1P is private to Gabriela, not
// to Mihai). The refusal proven instead is the one canEditPage gives for a target that does not
// exist — the same gate, answering false — recorded as `refused` in the receipt.
import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey } from "../../data/confluence.mjs";
// @ts-ignore
import { get } from "../../data/jira.mjs";

const URL_ = process.env.SENTINEL_CONFIG_API_URL || "";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const SPACE = "WFH";
const PAGE = "265912321";
const ATT = "att265945089";
const POLICY_KEY = `admin-settings-space-${SPACE}`;
const SV_ROOT = "/Users/mihaiperdum/Projects/Sentinel Vault";

const hook = (q: Record<string, string>) => getTestState("sentinel-vault", q);
const kv = async (key: string) => (await hook({ what: "kvs", key })).value;
const inv = (fn: string, params: Record<string, string>) => hook({ what: "invoke", fn, ...params });
const uniq = (p: string) => `${p}-${Date.now().toString(36)}`;
// Job rows are per token: api-job-<tokenId>:<key>; the busy marker is api-active-<tokenId>.
const jobKey = (tokenId: string, key: string) => `api-job-${tokenId}:${key}`;
const job = (tokenId: string, key: string) => kv(jobKey(tokenId, key));

async function post(token: string | null, op: string, key: string | null, body: any, method = "POST") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers["Idempotency-Key"] = key;
  const res = await fetch(`${URL_}?op=${op}`, { method, headers, body: body === undefined || method === "GET" ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function waitReceipt(tokenId: string, key: string, { timeoutMs = 120_000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await job(tokenId, key);
    if (v && !["queued", "running"].includes(v.status)) return v;
    if (Date.now() - t0 > timeoutMs) {
      // The dev queue can lag; the hook can drive the consumer synchronously.
      if (v?.status === "queued") { await inv("runApiJob", { id: `${tokenId}:${key}` }); return job(tokenId, key); }
      throw new Error(`receipt ${key} not settled after ${timeoutMs}ms: ${JSON.stringify(v).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

test.describe.configure({ timeout: 600_000 });

test("config API: admission, roles, a real bundle, the receipt on both read paths, restore", async () => {
  expect(URL_, "SENTINEL_CONFIG_API_URL must be set in .env (forge webtrigger create -f config-api)").toBeTruthy();

  // ── tokens through the hook seam (the resolver's own store) ────────────────
  const admin = (await inv("createApiToken", { actor: MIHAI, name: "harness-admin", role: "admin" })).result;
  const editor = (await inv("createApiToken", { actor: MIHAI, name: "harness-editor", role: "editor" })).result;
  const viewer = (await inv("createApiToken", { actor: MIHAI, name: "harness-viewer", role: "viewer" })).result;
  const admin2 = (await inv("createApiToken", { actor: MIHAI, name: "harness-admin-2", role: "admin" })).result;
  expect(admin.token).toMatch(/^svt_[0-9a-f]{48}$/);
  expect(editor.row.role).toBe("editor");
  expect(viewer.row.role).toBe("viewer");
  const cleanup: string[] = [admin.row.id, editor.row.id, viewer.row.id, admin2.row.id];
  const A = admin.row.id; const E = editor.row.id; const V = viewer.row.id; const A2 = admin2.row.id;
  const seeded: string[] = [];

  try {
    // ── method / auth / key negatives ────────────────────────────────────────
    expect((await post(admin.token, "dry-run", "x", { version: 1 }, "GET")).status).toBe(405);
    expect((await post("svt_" + "0".repeat(48), "dry-run", uniq("bad"), { version: 1 })).status).toBe(401);
    expect((await post(null, "dry-run", uniq("noauth"), { version: 1 })).status).toBe(401);
    expect((await post(admin.token, "dry-run", null, { version: 1 })).status, "no Idempotency-Key → 400").toBe(400);
    expect((await post(admin.token, "bundle", uniq("bad-bundle"), { version: 2 })).status, "wrong version → 400").toBe(400);
    expect((await post(admin.token, "bundle", uniq("bad-op"), { version: 1, content: [{ op: "seal-attachment", attachmentId: ATT, adminOverride: true }] })).status, "foreign field → 400").toBe(400);
    expect((await post(admin.token, "nuke", uniq("bad-opname"), { version: 1 })).status, "unknown op → 400").toBe(400);

    // ── dry-run: 202, then the same key while running is 409 / once done 202 no-op ──
    const dryKey = uniq("dry");
    const dryBundle = { version: 1, spaces: { [SPACE]: { policy: { defaultLockDuration: 4321 } } }, content: [{ op: "seal-attachment", pageId: PAGE, attachmentId: ATT }] };
    expect((await post(admin.token, "dry-run", dryKey, dryBundle)).status).toBe(202);
    const again = await post(admin.token, "dry-run", dryKey, dryBundle);
    expect([202, 409], `same key again → ${again.status}`).toContain(again.status);
    const dry = await waitReceipt(A, dryKey);
    expect(dry.status).toBe("done");
    expect(dry.op).toBe("dry-run");
    expect(dry.plan.map((s: any) => s.resolverKey)).toEqual(["store-policy", "seal-artifact"]);
    expect(dry.results.every((r: any) => r.status === "skipped" && r.reason === "dry-run")).toBe(true);
    expect((await post(admin.token, "dry-run", dryKey, dryBundle)).status, "settled key → 202 no-op").toBe(202);
    expect((await job(A, dryKey)).finishedAt, "no-op did not rewrite the receipt").toBe(dry.finishedAt);

    // ── role floor: an editor token may not post site/space config, may post content ──
    const forbKey = uniq("forb");
    expect((await post(editor.token, "bundle", forbKey, { version: 1, site: { policy: { allowAdminOverride: true } } })).status).toBe(403);
    const forb = await job(E, forbKey);
    expect(forb?.status, "a refused submission still leaves a receipt").toBe("refused");
    expect(forb.reason).toMatch(/editor/);
    // Role is decided BEFORE validation: an INVALID site bundle from an editor is 403, not 400
    // (400 would be a validation oracle for config the token may not submit).
    expect((await post(editor.token, "bundle", uniq("forb-invalid"), { version: 1, site: { polcy: {} } })).status, "invalid + under-privileged → 403 first").toBe(403);
    const edKey = uniq("ed");
    expect((await post(editor.token, "dry-run", edKey, { version: 1, content: [{ op: "unseal-attachment", attachmentId: ATT, reason: "never runs" }] })).status, "editor + content-only → 202").toBe(202);
    expect((await waitReceipt(E, edKey)).status).toBe("done");

    // ── a viewer token may post nothing but whoami ───────────────────────────
    expect((await post(viewer.token, "bundle", uniq("viewer-site"), { version: 1, site: { policy: { allowAdminOverride: true } } })).status, "viewer + site → 403").toBe(403);
    expect((await post(viewer.token, "bundle", uniq("viewer-content"), { version: 1, content: [{ op: "classify-page", pageId: PAGE, levelId: null }] })).status, "viewer + content → 403").toBe(403);
    expect((await post(viewer.token, "dry-run", uniq("viewer-dry"), { version: 1 })).status, "viewer + empty dry-run → 403").toBe(403);

    // whoami for any live token
    const whoKey = uniq("who");
    expect((await post(editor.token, "whoami", whoKey, undefined)).status).toBe(202);
    const who = await waitReceipt(E, whoKey);
    expect(who.identity).toMatchObject({ accountId: MIHAI, role: "editor", tokenId: editor.row.id });
    const vwhoKey = uniq("vwho");
    expect((await post(viewer.token, "whoami", vwhoKey, undefined)).status, "viewer whoami → 202").toBe(202);
    expect((await waitReceipt(V, vwhoKey)).identity.role).toBe("viewer");

    // ── the ?b= fallback is gone: a bundle only in the query is 400 ─────────
    {
      const b = Buffer.from(JSON.stringify({ version: 1 })).toString("base64url");
      const r = await fetch(`${URL_}?op=dry-run&b=${b}`, { method: "POST", headers: { Authorization: `Bearer ${admin.token}`, "Idempotency-Key": uniq("qb") } });
      expect(r.status, "?b= body fallback removed → 400").toBe(400);
    }

    // ── Idempotency-Key is per token: the same key on two tokens → two independent jobs ──
    const sharedKey = uniq("shared");
    expect((await post(admin.token, "dry-run", sharedKey, { version: 1, content: [{ op: "classify-page", pageId: PAGE, levelId: null }] })).status).toBe(202);
    expect((await post(admin2.token, "dry-run", sharedKey, { version: 1 })).status, "same key, other token → its own 202 (never 409)").toBe(202);
    const s1 = await waitReceipt(A, sharedKey); const s2 = await waitReceipt(A2, sharedKey);
    expect([s1.tokenId, s2.tokenId]).toEqual([A, A2]);
    expect(s1.plan.length, "token A's job is its own bundle").toBe(1);
    expect(s2.plan.length, "token B's job is its own bundle").toBe(0);
    expect(await kv(`api-job-${sharedKey}`), "no site-wide row under the bare key").toBeNull();

    // ── the per-target gate: a target that does not exist is refused, never applied ──
    const ghostKey = uniq("ghost");
    expect((await post(admin.token, "bundle", ghostKey, { version: 1, content: [
      { op: "classify-page", pageId: "999999999999", levelId: null },
      { op: "seal-attachment", pageId: "999999999999", attachmentId: "att999999999999" },
    ] })).status).toBe(202);
    const ghost = await waitReceipt(A, ghostKey);
    expect(ghost.results.map((r: any) => r.status), JSON.stringify(ghost.results)).toEqual(["refused", "refused"]);
    expect(ghost.status).toBe("failed");

    // ── the real bundle ──────────────────────────────────────────────────────
    const policyBefore = await kv(POLICY_KEY);
    const sealBefore = await kv(`protection-${ATT}`);
    const original = policyBefore?.defaultLockDuration ?? null;
    const distinct = original === 4321 ? 4322 : 4321;
    const realKey = uniq("real");
    const res = await post(admin.token, "bundle", realKey, {
      version: 1,
      spaces: { [SPACE]: { policy: { defaultLockDuration: distinct } } },
      content: [{ op: "seal-attachment", pageId: PAGE, attachmentId: ATT, lockDuration: 3600, note: "config-api spec" }],
    });
    expect(res.status).toBe(202);
    const real = await waitReceipt(A, realKey);
    expect(real.status, JSON.stringify(real.results)).toBe("done");
    expect(real.results.map((r: any) => [r.path, r.status])).toEqual([[`spaces.${SPACE}.policy`, "applied"], ["content[0]", "applied"]]);
    expect(real.summary).toEqual({ applied: 2, refused: 0, failed: 0, skipped: 0 });
    expect((await kv(POLICY_KEY)).defaultLockDuration, "space policy changed through store-policy").toBe(distinct);
    const sealAfter = await kv(`protection-${ATT}`);
    expect(sealAfter, "protection record exists").toBeTruthy();
    expect(sealAfter.lockedBy).toBe(MIHAI);
    if (sealBefore && sealBefore.lockedBy === MIHAI && !(sealBefore.expiresAt && new Date(sealBefore.expiresAt) < new Date())) {
      expect(real.results[1].reason, "already held by the minter → no-op, expiry untouched").toMatch(/no-op/);
      expect(sealAfter.expiresAt).toBe(sealBefore.expiresAt);
    }
    // The effective config was mirrored to the space property (write:space:confluence is consented on major 7).
    expect(real.configMirror?.spaces?.[SPACE], "sentinel-vault-config space mirror").toBe(true);
    expect(real.receiptMirror?.spaces?.[SPACE], "sentinel-vault-receipt space mirror").toBe(true);

    // ── the customer's read path: v2 space properties with the harness (Confluence) creds ──
    const spaceId = await spaceIdByKey(SPACE);
    const rp = await get(`/wiki/api/v2/spaces/${spaceId}/properties?key=sentinel-vault-receipt`);
    const receipts = rp.results?.[0]?.value?.receipts || [];
    expect(receipts[0]?.id, "newest receipt first on the space property").toBe(realKey);
    expect(receipts.map((r: any) => r.id)).toContain(dryKey);
    expect(receipts.length).toBeLessThanOrEqual(20);
    const cp = await get(`/wiki/api/v2/spaces/${spaceId}/properties?key=sentinel-vault-config`);
    const cfg = cp.results?.[0]?.value;
    expect(cfg?.policy?.defaultLockDuration, "effective config readable over REST").toBe(distinct);
    // The mirror is readable by every space viewer, so it carries NONE of what the resolvers
    // withhold from non-stewards (red-team HIGH).
    expect(cfg, "no roster / workflow settings / AI prompts on the space property").not.toHaveProperty("spaceAdmins");
    expect(cfg).not.toHaveProperty("workflowSettings");
    expect(cfg.policy).not.toHaveProperty("adminUsers");
    expect(cfg.policy).not.toHaveProperty("adminGroups");
    if (cfg.validation) { expect(cfg.validation).not.toHaveProperty("ai"); expect(cfg.validation).not.toHaveProperty("rules"); }
    for (const w of cfg.workflows || []) expect(w).not.toHaveProperty("def");
    const text = JSON.stringify(cfg);
    for (const u of (policyBefore?.adminUsers || []).map((x: any) => x.accountId)) expect(text, `roster id ${u} leaked`).not.toContain(u);

    // ── busy: one job per token — PROVEN by seeding a live queued job for the token ──
    // A second key while a job for the same token is still queued/running is 429. The dev
    // consumer settles a real job faster than a second POST lands, so the queued state is seeded
    // through the hook (the same rows the trigger writes) and removed afterwards.
    {
      const held = uniq("held");
      const heldRow = { id: held, status: "queued", op: "dry-run", submittedBy: MIHAI, tokenId: A, role: "admin", bundle: null, submittedAt: new Date().toISOString() };
      await hook({ what: "set", key: jobKey(A, held), value: JSON.stringify(heldRow) });
      await hook({ what: "set", key: `api-active-${A}`, value: JSON.stringify({ jobId: held, at: heldRow.submittedAt }) });
      seeded.push(jobKey(A, held), `api-active-${A}`);
      expect((await post(admin.token, "dry-run", uniq("busy"), { version: 1 })).status, "another key while the token's job is queued → 429").toBe(429);
      expect((await post(admin.token, "dry-run", held, { version: 1 })).status, "the queued key itself → 409").toBe(409);
      expect((await post(admin2.token, "dry-run", uniq("other-token"), { version: 1 })).status, "busy is per token").toBe(202);
      await hook({ what: "delete", key: jobKey(A, held) }); await hook({ what: "delete", key: `api-active-${A}` });
      expect((await post(admin.token, "dry-run", uniq("free"), { version: 1 })).status, "slot freed → 202").toBe(202);
    }

    // ── a job wedged in `running` past the consumer timeout is reclaimed, not 409 forever ──
    {
      const wedged = uniq("wedged");
      const row = { id: wedged, status: "running", op: "bundle", submittedBy: MIHAI, tokenId: A, role: "admin", submittedAt: new Date(Date.now() - 600_000).toISOString(), startedAt: new Date(Date.now() - 600_000).toISOString(), results: [] };
      await hook({ what: "set", key: jobKey(A, wedged), value: JSON.stringify(row) });
      await hook({ what: "set", key: `api-active-${A}`, value: JSON.stringify({ jobId: wedged, at: row.startedAt }) });
      seeded.push(jobKey(A, wedged));
      expect((await post(admin.token, "dry-run", uniq("not-busy"), { version: 1 })).status, "a stale running job does not count as busy").toBe(202);
      expect((await post(admin.token, "bundle", wedged, { version: 1 })).status, "the stale key itself → 202 (settled), not 409").toBe(202);
      const settled = await job(A, wedged);
      expect(settled.status).toBe("failed");
      expect(settled.reason).toMatch(/consumer timed out; resubmit with a new Idempotency-Key/);
    }

    // ── site.receiptPageId the minter cannot edit → skipped, nothing mirrored there ──
    {
      const rpKey = uniq("rp");
      expect((await post(admin.token, "bundle", rpKey, { version: 1, site: { receiptPageId: "999999999999" } })).status).toBe(202);
      const rp = await waitReceipt(A, rpKey);
      expect(rp.results.find((r: any) => r.path === "site.receiptPageId")?.status, JSON.stringify(rp.results)).toBe("skipped");
      expect(rp.receiptMirror?.page, "no page mirror attempted").toBeNull();
    }

    // ── restore: policy back, unseal through the API, fixture re-seeded ─────
    const restoreKey = uniq("restore");
    const restoreBundle: any = { version: 1, content: [{ op: "unseal-attachment", attachmentId: ATT, reason: "config-api spec restore" }] };
    if (original != null) restoreBundle.spaces = { [SPACE]: { policy: { defaultLockDuration: original } } };
    expect((await post(admin.token, "bundle", restoreKey, restoreBundle)).status).toBe(202);
    const restored = await waitReceipt(A, restoreKey);
    expect(restored.status, JSON.stringify(restored.results)).toBe("done");
    expect(await kv(`protection-${ATT}`), "unsealed through unseal-artifact").toBeNull();
    // store-policy merges, so a key the fixture never had cannot be removed by a bundle: put the
    // exact original row back through the hook.
    await hook({ what: "set", key: POLICY_KEY, value: JSON.stringify(policyBefore) });
    expect(await kv(POLICY_KEY)).toEqual(policyBefore);
  } finally {
    for (const k of seeded) await hook({ what: "delete", key: k }).catch(() => {});
    for (const id of cleanup) await inv("revokeApiToken", { id });
    // ensure-fixture re-seeds the fixture seal that other specs depend on.
    try { execSync("npm run -s ensure-fixture", { cwd: `${SV_ROOT}/test-harness`, stdio: "pipe", timeout: 120_000 }); } catch (e: any) { console.warn("ensure-fixture:", String(e?.stdout || e).slice(0, 400)); }
  }
  expect((await post(admin.token, "dry-run", uniq("revoked"), { version: 1 })).status, "revoked token → 401").toBe(401);
  expect(await kv(`protection-${ATT}`), "fixture seal re-seeded").toBeTruthy();
});

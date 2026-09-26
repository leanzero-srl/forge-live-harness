#!/usr/bin/env node
// App REST API (Forge `apiRoute`) — 3LO consent + the functional probes, for any LeanZero app whose
// REST surface rides apiRoute (the Runs-on-Atlassian-eligible door). First user: lz-ppm (development).
//
//   node scripts/apiroute-probe.mjs consent [--headed] [--no-offline]   # browser consent → .auth/<prefix>-apiroute-token.json
//   node scripts/apiroute-probe.mjs refresh                             # use the refresh token (if one came back)
//   node scripts/apiroute-probe.mjs probe [--only P-1,P-3]               # run the probes → evidence/apiroute/<ts>.json
//
// Env (forge-live-harness/.env, gitignored): <PREFIX>_APIROUTE_BASE, _CLIENT_ID, _CLIENT_SECRET, _REDIRECT, _SNS,
// and JIRA_BASE_URL / JIRA_ADMIN_EMAIL / JIRA_API_TOKEN (used ONLY to find a second real accountId for the
// forgery probe). PREFIX defaults to LZ (APIROUTE_PREFIX=… to point at another app).
//
// Why each probe exists: lz-ppm-forge docs/quality-loop/hunt/SPIKE-apiroute-eligibility-2026-09-26.md §4.
// P-3 is the security-critical one: the app takes the calling user from the
// x-slauth-user-context-account-id header, so a caller who can forge it could act as anyone.
//
// Secrets: never printed. Tokens are written 0600 under .auth/ (gitignored).
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { harnessHome } from "../config/home.mjs";
import { loadEnv } from "../data/env.mjs";
import { cloneProfile, removeOwnedRun, runsRoot } from "../forge/auth-clone.mjs";

loadEnv();
const PREFIX = (process.env.APIROUTE_PREFIX || "LZ").toUpperCase();
const E = (k) => process.env[`${PREFIX}_APIROUTE_${k}`];
const BASE = (E("BASE") || "").replace(/\/+$/, "");
const CLIENT_ID = E("CLIENT_ID");
const CLIENT_SECRET = E("CLIENT_SECRET");
const REDIRECT = E("REDIRECT") || "http://localhost:9876/callback";
const SNS = E("SNS");
const SCOPES = (E("SCOPES") || "read:plan:custom write:plan:custom manage:plan:custom read:forge-app:jira").split(/\s+/).filter(Boolean);
const authDir = path.join(harnessHome(), ".auth");
const TOKEN_FILE = path.join(authDir, `${PREFIX.toLowerCase()}-apiroute-token.json`);
const args = process.argv.slice(2);
const cmd = args[0];
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

function need(...names) {
  const missing = names.filter((n) => !E(n));
  if (missing.length) { console.error(`missing in .env: ${missing.map((n) => `${PREFIX}_APIROUTE_${n}`).join(", ")}`); process.exit(2); }
}
function saveToken(t) {
  fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...t, obtainedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}
function loadToken() {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")); } catch { return null; }
}
function tokenSummary(t) {
  return { token_type: t.token_type, expires_in: t.expires_in, scope: t.scope, refresh_token: t.refresh_token ? "present" : "absent" };
}

async function exchange(body) {
  const r = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...body }),
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text.slice(0, 300) }; }
  if (!r.ok) throw new Error(`token endpoint ${r.status}: ${JSON.stringify({ error: j.error, error_description: j.error_description, raw: j.raw })}`);
  return j;
}

// ---------------------------------------------------------------- consent
async function consent() {
  need("BASE", "CLIENT_ID", "CLIENT_SECRET", "SNS");
  const scopes = flag("--no-offline") ? SCOPES : [...SCOPES, "offline_access"];
  const state = crypto.randomBytes(12).toString("hex");
  const u = new URL("https://auth.atlassian.com/authorize");
  u.search = new URLSearchParams({
    audience: "api.atlassian.com", client_id: CLIENT_ID, scope: scopes.join(" "), redirect_uri: REDIRECT,
    state, response_type: "code", prompt: "consent", sns: SNS,
  }).toString();
  const port = Number(new URL(REDIRECT).port || 80);

  const gotCode = new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const q = new URL(req.url, REDIRECT).searchParams;
      if (!req.url.startsWith(new URL(REDIRECT).pathname)) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "content-type": "text/plain" }).end("Consent received — you can close this tab.");
      srv.close();
      if (q.get("error")) reject(new Error(`consent refused: ${q.get("error")} ${q.get("error_description") || ""}`));
      else if (q.get("state") !== state) reject(new Error("state mismatch — ignoring the callback"));
      else resolve(q.get("code"));
    });
    srv.listen(port, "127.0.0.1");
    const waitMs = Number(opt("--wait-min") || 30) * 60_000;
    setTimeout(() => { srv.close(); reject(new Error(`no callback within ${waitMs / 60000} minutes`)); }, waitMs).unref();
  });

  console.log(`scopes requested: ${scopes.join(" ")}`);
  if (flag("--print")) {
    console.log(`open this URL as the consenting user:\n${u}`);
  } else {
    await driveConsent(u.toString());
  }
  const code = await gotCode;
  const t = await exchange({ grant_type: "authorization_code", code, redirect_uri: REDIRECT });
  saveToken(t);
  console.log(`token saved → ${TOKEN_FILE}`);
  console.log(JSON.stringify(tokenSummary(t)));
}

// The consent page on a CLONE of the harness's saved (logged-in) profile. It picks the site if asked
// and presses Accept. Screenshots land in evidence/apiroute/ so a refusal is readable afterwards.
async function driveConsent(url) {
  const { chromium } = await import("@playwright/test");
  const source = process.env.HARNESS_AUTH_SOURCE ? path.resolve(process.env.HARNESS_AUTH_SOURCE) : path.join(authDir, "profile");
  const runDir = path.join(runsRoot(authDir), `apiroute-consent-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`);
  const evDir = path.join(harnessHome(), "evidence", "apiroute");
  fs.mkdirSync(evDir, { recursive: true });
  cloneProfile(source, path.join(runDir, "base"), { purpose: "apiroute-consent" });
  const ctx = await chromium.launchPersistentContext(path.join(runDir, "base"), { headless: !flag("--headed"), viewport: { width: 1280, height: 900 } });
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const deadline = Date.now() + 120_000;
    let step = 0;
    while (Date.now() < deadline) {
      await page.waitForTimeout(2500);
      const at = page.url();
      if (at.startsWith(REDIRECT.split("?")[0])) { console.log("consent: redirected to the callback"); return; }
      await page.screenshot({ path: path.join(evDir, `consent-${++step}.png`) }).catch(() => {});
      const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 600);
      if (/log in|sign in|continue with/i.test(body) && /id\.atlassian\.com/.test(at)) throw new Error(`consent: the saved profile is not logged in (${at}). Run \`npm run auth\` (headed, owner).`);
      // Site picker (Atlassian's own custom select) — choose wolfaenpak when present.
      const site = new URL(process.env.JIRA_BASE_URL || "https://wolfaenpak.atlassian.net").hostname;
      const picker = page.getByText(/choose a site|use app on/i).first();
      if (await picker.isVisible().catch(() => false)) {
        await page.getByRole("combobox").first().click().catch(() => {});
        await page.getByText(site, { exact: false }).first().click().catch(() => {});
      }
      const accept = page.getByRole("button", { name: /^(accept|allow)$/i });
      if (await accept.isVisible().catch(() => false)) {
        if (await accept.isEnabled().catch(() => false)) { await accept.click(); console.log("consent: Accept pressed"); continue; }
      }
      console.log(`consent: waiting (${at.slice(0, 80)}) — ${body.replace(/\s+/g, " ").slice(0, 160)}`);
    }
    throw new Error("consent: did not reach the callback within 2 minutes (see evidence/apiroute/consent-*.png)");
  } finally {
    await ctx.close().catch(() => {});
    try { removeOwnedRun(authDir, runDir); } catch (e) { console.error(`(clone left at ${runDir}: ${e.message})`); }
  }
}

async function refresh() {
  need("CLIENT_ID", "CLIENT_SECRET");
  const t = loadToken();
  if (!t?.refresh_token) { console.error("no refresh token stored — run `consent` again"); process.exit(3); }
  const n = await exchange({ grant_type: "refresh_token", refresh_token: t.refresh_token });
  saveToken({ ...t, ...n });
  console.log(JSON.stringify(tokenSummary({ ...t, ...n })));
}

// ---------------------------------------------------------------- probes
async function call(method, p, { headers = {}, body, token } = {}) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, ms: Date.now() - t0, json, text: json ? undefined : text.slice(0, 400) };
}

async function jiraBasic(p) {
  const base = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
  const auth = Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
  const r = await fetch(`${base}${p}`, { headers: { authorization: `Basic ${auth}`, accept: "application/json" } });
  return r.ok ? r.json() : null;
}

async function probe() {
  need("BASE");
  const t = loadToken();
  if (!t?.access_token) { console.error("no token — run `consent` first"); process.exit(3); }
  const ageS = (Date.now() - Date.parse(t.obtainedAt)) / 1000;
  if (ageS > (t.expires_in || 3600) - 60) { console.error(`token expired ${Math.round(ageS)}s ago-ish — run \`refresh\` or \`consent\``); process.exit(3); }
  const token = t.access_token;
  const only = (opt("--only") || "").split(",").filter(Boolean);
  const want = (id) => !only.length || only.includes(id);
  const out = { at: new Date().toISOString(), base: BASE, scope: t.scope, probes: {} };
  const rec = (id, verdict, detail) => { out.probes[id] = { verdict, ...detail }; console.log(`${id}  ${verdict}  ${JSON.stringify(detail).slice(0, 700)}`); };

  // P-1 reach + shape
  const who = await call("GET", "/viewer/whoami", { token });
  const me = who.json?.token?.accountId || null;
  if (want("P-1")) rec("P-1", who.status === 200 ? "PASS" : "FAIL", { status: who.status, body: who.json || who.text });

  // P-2 principal = the consenting user (the harness admin, looked up by the basic-auth token owner)
  const myself = await jiraBasic("/rest/api/3/myself");
  if (want("P-2")) {
    rec("P-2", me && me === myself?.accountId ? "PASS" : "FAIL", { expected: myself?.accountId, reported: me });
  }

  // P-3 forgery: send another real user's accountId in the principal header (once, twice, other casing)
  if (want("P-3")) {
    const users = (await jiraBasic("/rest/api/3/users/search?maxResults=50")) || [];
    const other = users.find((u) => u.accountType === "atlassian" && u.active && u.accountId !== myself?.accountId);
    const H = "x-slauth-user-context-account-id";
    const variants = {
      single: { [H]: other?.accountId },
      upper: { "X-Slauth-User-Context-Account-Id": other?.accountId },
    };
    const results = {};
    for (const [name, headers] of Object.entries(variants)) {
      const r = await call("GET", "/viewer/whoami", { token, headers });
      const acting = r.json?.token?.accountId || null;
      results[name] = { status: r.status, acting, reportsForged: acting === other?.accountId, reportsSelf: acting === myself?.accountId, reason: r.json?.reason };
    }
    // a duplicated header value — fetch joins duplicates with ", "
    const dup = await call("GET", "/viewer/whoami", { token, headers: { [H]: `${other?.accountId}, ${myself?.accountId}` } });
    const dActing = dup.json?.token?.accountId || null;
    results.joined = { status: dup.status, acting: dActing, reportsForged: dActing === other?.accountId, reportsSelf: dActing === myself?.accountId, reason: dup.json?.reason };
    const forgedAnywhere = Object.values(results).some((x) => x.status === 200 && x.reportsForged);
    const safe = !forgedAnywhere && Object.values(results).every((x) => (x.status === 200 && x.reportsSelf) || x.status === 401);
    rec("P-3", !other ? "SKIP(no second user)" : safe ? "PASS" : "FAIL — FORGERY POSSIBLE", { forgedAccount: other?.accountId, self: myself?.accountId, results });
  }

  // P-4 floors — viewer read, viewer write refused, editor create, editor delete refused, admin delete
  if (want("P-4")) {
    const d = {};
    const list = await call("GET", "/viewer/plans", { token }); d.viewerList = { status: list.status, count: Array.isArray(list.json?.plans) ? list.json.plans.length : Array.isArray(list.json) ? list.json.length : null };
    const vPost = await call("POST", "/viewer/plans", { token, body: { name: "apiroute-probe (viewer must be refused)", jql: "project = LZPT", index: false } }); d.viewerCreate = { status: vPost.status, body: vPost.json };
    const name = `apiroute-probe ${new Date().toISOString().slice(0, 19)}`;
    const ePost = await call("POST", "/editor/plans", { token, body: { name, jql: "project = LZPT", index: false } });
    const id = ePost.json?.id || ePost.json?.plan?.id || ePost.json?.planId;
    d.editorCreate = { status: ePost.status, id };
    if (id) {
      const eDel = await call("DELETE", `/editor/plans?id=${encodeURIComponent(id)}`, { token }); d.editorDelete = { status: eDel.status, body: eDel.json };
      const aDel = await call("DELETE", `/admin/plans?id=${encodeURIComponent(id)}`, { token }); d.adminDelete = { status: aDel.status, body: aDel.json };
      const after = await call("GET", `/viewer/plans?id=${encodeURIComponent(id)}`, { token }); d.afterDelete = { status: after.status };
    }
    const pass = list.status === 200 && vPost.status === 403 && [200, 201].includes(ePost.status) && d.editorDelete?.status === 403 && [200, 204].includes(d.adminDelete?.status);
    rec("P-4", pass ? "PASS" : "FAIL", d);
  }

  // P-8 limits/errors
  if (want("P-8")) {
    const d = {};
    const unk = await call("GET", "/viewer/nosuchresource", { token }); d.unknownPath = { status: unk.status, body: unk.json || unk.text };
    const outside = await call("GET", "/nosuchtier/plans", { token }); d.unknownTier = { status: outside.status, body: outside.json || outside.text };
    const big = await call("POST", "/viewer/ai", { token, body: JSON.stringify({ pad: "x".repeat(600 * 1024) }) }); d.bigBody = { status: big.status, body: big.json || big.text };
    const noTok = await fetch(`${BASE}/viewer/whoami`); d.noToken = { status: noTok.status };
    rec("P-8", "RECORDED", d);
  }

  const evDir = path.join(harnessHome(), "evidence", "apiroute");
  fs.mkdirSync(evDir, { recursive: true });
  const file = path.join(evDir, `probe-${out.at.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`evidence → ${file}`);
}

const cmds = { consent, refresh, probe };
if (!cmds[cmd]) { console.error("usage: apiroute-probe.mjs consent|refresh|probe [--headed] [--print] [--no-offline] [--only P-1,P-3]"); process.exit(2); }
cmds[cmd]().catch((e) => { console.error(e.message); process.exit(1); });

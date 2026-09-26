// REST/HOOK PROBE LAYER — browserless checks, declared per app, run where the environment has a door.
//
// Convention: `rest/probes/<app>.ts` exports `probes: RestProbe[]`. Each probe names the DOOR it goes
// through (config/apps.mjs → doors): `site` (plain Jira/Confluence REST with the harness API token —
// always there), `hook` (the app's dev-only _testState web trigger), `rest` (the app's own REST
// surface), `static` (a static web trigger, e.g. Sentinel Vault's write-only config API).
//
// rest/probes.rest.ts turns every probe into a Playwright test in the `rest` project (no page fixture
// → no browser is launched). A probe whose door does not exist in the chosen env is SKIPPED with the
// reason, never failed: that is how a Runs on Atlassian app in production falls back to browser-only
// checks without anyone having to remember that it has no webtrigger there.
//
// Probes must be READ-ONLY or SELF-RESTORING (mint a token → use it → revoke it in `ctx.cleanup`).
// Anything that writes to Jira/Confluence data belongs in a scenario spec that restores its bed.
import fs from "node:fs";
import path from "node:path";
// @ts-ignore - plain ESM JS helper
import { loadEnv } from "../data/env.mjs";
// @ts-ignore - plain ESM JS helper
import { APPS, doorsIn, envVarFor } from "../config/apps.mjs";
import { EVIDENCE_DIR } from "../config/env";
import { runId } from "../capture/evidence";

loadEnv();

export type Env = "development" | "staging" | "production";
export type DoorName = "site" | "hook" | "rest" | "static";

export interface ProbeCtx {
  app: string;
  env: Env;
  /** Env-resolved value of a door URL/token variable (bare name on development, `<VAR>_<ENV>` elsewhere). Strict. */
  v(base: string): string;
  /** Env-resolved secret (`<VAR>_<ENV>`, falling back to the bare name). */
  secret(base: string): string;
  /** fetch + parse; never throws on HTTP status. */
  http(url: string, init?: RequestInit): Promise<{ status: number; json: any; text: string }>;
  /** Jira/Confluence REST on the test site with the harness API token (the `site` door). */
  site(pathAndQuery: string, init?: RequestInit): Promise<{ status: number; json: any; text: string }>;
  /** Record a fact into this probe's evidence JSON (redacted on write). */
  fact(key: string, value: unknown): void;
  /** Register a restore step; runs after the probe, pass or fail, in reverse order. */
  cleanup(fn: () => Promise<unknown>): void;
}

export interface RestProbe {
  name: string;
  door: DoorName;
  /** What this proves, in one line — goes into the evidence and the report. */
  proves: string;
  /** read-only, or self-restoring (writes app state and undoes it in ctx.cleanup). */
  effect: "read-only" | "self-restoring";
  /** Extra env vars (resolved per env) the probe needs beyond the door's own. */
  needs?: string[];
  run(ctx: ProbeCtx): Promise<void>;
}

export interface Availability { run: boolean; reason?: string }

/** A secret for `env`: `<VAR>_<ENV>` when set, else the bare `<VAR>`. */
export function secretFor(base: string, env: Env): string {
  return process.env[envVarFor(base, env)] || process.env[base] || "";
}

/** Is this probe's door present in `env` for `app`, and is it configured in .env? */
export function availability(appId: string, env: Env, p: RestProbe): Availability {
  const app = (APPS as any)[appId];
  if (!app) return { run: false, reason: `unknown app ${appId}` };
  if (p.door !== "site") {
    const present: string[] = doorsIn(app, env);
    if (!present.includes(p.door)) {
      const why = app.badge && env === "production"
        ? `${appId} holds the Runs on Atlassian badge: production has no ${p.door} door by design — covered by the browser checks`
        : `${appId} has no ${p.door} door in ${env}`;
      return { run: false, reason: why };
    }
    const d = app.doors[p.door];
    // URL/token vars are env-STRICT (a production probe must never fall back to the dev URL);
    // secrets fall back to the bare name (one HARNESS_SECRET may serve several envs).
    const urls: string[] = [];
    const secrets: string[] = [];
    if (d.via === "hook-mint" || (d.via === "hook-mint-or-token" && app.doors.hook?.envs.includes(env))) {
      urls.push(app.doors.hook.urlVar); secrets.push(app.doors.hook.secretVar);
    } else {
      if (d.urlVar) urls.push(d.urlVar);
      if (d.tokenVar) urls.push(d.tokenVar);
      if (d.secretVar) secrets.push(d.secretVar);
    }
    const missing = [
      ...urls.map((b) => envVarFor(b, env)).filter((n) => !process.env[n]),
      ...secrets.filter((b) => !secretFor(b, env)).map((b) => envVarFor(b, env)),
    ];
    if (missing.length) return { run: false, reason: `${p.door} door exists in ${env} but ${missing.join(", ")} is not set in .env` };
  }
  const extra = (p.needs || []).map((b) => envVarFor(b, env)).filter((n) => !process.env[n]);
  if (extra.length) return { run: false, reason: `needs ${extra.join(", ")} in .env` };
  return { run: true };
}

// --- redaction: evidence is on disk and may be shared; web-trigger URLs are capability URLs ---
const TOKEN_RE = /\b(lzm|cgr|svt|cwt)_[0-9a-f]{16,}\b/gi;
/** Redact tokens, secrets and web-trigger capability paths from any text (also error messages,
 *  which Playwright prints to the console and the html report — a 424 body echoes the /x1/ path). */
export function redactText(s: string): string {
  const secrets = ["HARNESS_SECRET", "JIRA_API_TOKEN", "ALTOMATA_TRIGGER_SECRET", "LICENSELEASH_TESTHOOK_SECRET"]
    .map((k) => process.env[k]).filter((v): v is string => Boolean(v && v.length > 6));
  let out = s.replace(TOKEN_RE, (m) => `${m.slice(0, 8)}…[redacted]`)
    // Web-trigger URLs are capability URLs (whoever holds one can call it): keep the host, drop the path.
    .replace(/(https:\/\/[a-z0-9.-]+\.(?:atlassian-dev\.net|atlassian\.app|atlassian\.net))\/(x1|public)\/[A-Za-z0-9_\-/.]+/g, "$1/$2/[redacted]")
    .replace(/(["'\s(:])\/(x1|public)\/[A-Za-z0-9_-]{12,}/g, "$1/$2/[redacted]");
  for (const sec of secrets) out = out.split(sec).join("[redacted]");
  return out;
}
function redact(value: unknown): unknown {
  return JSON.parse(redactText(JSON.stringify(value, null, 2) ?? "null"));
}

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);

export function makeCtx(appId: string, env: Env) {
  const facts: Record<string, unknown> = {};
  const restores: Array<() => Promise<unknown>> = [];
  const http = async (url: string, init: RequestInit = {}) => {
    const res = await fetch(url, init);
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { status: res.status, json, text };
  };
  const base = (process.env.JIRA_BASE_URL ?? "https://wolfaenpak.atlassian.net").replace(/\/+$/, "");
  const basic = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
  const ctx: ProbeCtx = {
    app: appId,
    env,
    v: (b) => process.env[envVarFor(b, env)] ?? "",
    secret: (b) => secretFor(b, env),
    http,
    site: (p, init = {}) => http(`${base}${p}`, { ...init, headers: { Authorization: basic, Accept: "application/json", ...(init.headers || {}) } }),
    fact: (k, val) => { facts[k] = val; },
    cleanup: (fn) => { restores.push(fn); },
  };
  return { ctx, facts, restores };
}

/** Run one probe with cleanup + evidence. Throws the probe's failure after restoring and writing. */
export async function runProbe(appId: string, env: Env, p: RestProbe): Promise<string> {
  const { ctx, facts, restores } = makeCtx(appId, env);
  const started = new Date();
  let error: unknown = null;
  const cleanupLog: string[] = [];
  try { await p.run(ctx); }
  catch (e) { error = e; }
  finally {
    for (const fn of restores.reverse()) {
      try { await fn(); cleanupLog.push("ok"); } catch (e) { cleanupLog.push(`FAILED: ${(e as Error).message}`); }
    }
  }
  const dir = path.join(EVIDENCE_DIR, runId(), "rest");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${appId}--${slug(p.name)}.json`);
  fs.writeFileSync(file, JSON.stringify(redact({
    schema: "rest-probe-v1", app: appId, env, probe: p.name, door: p.door, effect: p.effect, proves: p.proves,
    status: error ? "failed" : "passed", error: error ? String((error as Error).message ?? error) : null,
    startedAt: started.toISOString(), ms: Date.now() - started.getTime(), cleanup: cleanupLog, facts,
  }), null, 2));
  if (cleanupLog.some((c) => c.startsWith("FAILED"))) {
    throw new Error(redactText(`probe ${p.name}: cleanup failed (${cleanupLog.join(" · ")}) — see ${file}`));
  }
  if (error) throw new Error(redactText(String((error as Error)?.message ?? error)));
  return file;
}

/** Small assertion helper that reads well in evidence. */
export function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

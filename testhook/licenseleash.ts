// Client for License Leash's HMAC-gated reactivation webtrigger. We only ever call it with a
// MISSING or FORGED token to prove rejection — a valid signed token is never minted here, so no
// license is ever reactivated. URL lives in the gitignored .env.
// @ts-ignore - plain ESM JS helper
import { loadEnv } from "../data/env.mjs";

loadEnv();

const WT_URL = process.env.LICENSELEASH_REACTIVATION_WEBTRIGGER;
const TH_URL = process.env.LICENSELEASH_TESTHOOK_URL;
const TH_SECRET = process.env.LICENSELEASH_TESTHOOK_SECRET ?? "";

export const hasReactivationWebtrigger = (): boolean => Boolean(WT_URL);
export const hasTestHook = (): boolean => Boolean(TH_URL && TH_SECRET);

/** Dev-only READ-ONLY SQL state hook: what = counts|schema|activity|recentActivity|deactivationLog|config. */
export async function licenseLeashState(what: string, params: Record<string, string> = {}): Promise<any> {
  if (!TH_URL) throw new Error("LICENSELEASH_TESTHOOK_URL not set (.env). Provision the licenseleash-test-state webtrigger.");
  const u = new URL(TH_URL);
  u.searchParams.set("what", what);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), { headers: { "x-testhook-secret": TH_SECRET } });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`licenseleash testhook ${what} -> ${res.status} (non-JSON): ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(`licenseleash testhook ${what} -> ${res.status}: ${text.slice(0, 200)}`);
  return json;
}

/** GET the reactivation webtrigger. Pass `undefined` to omit the token. Returns the raw status. */
export async function callReactivationWebtrigger(token?: string): Promise<{ status: number; body: string }> {
  if (!WT_URL) throw new Error("LICENSELEASH_REACTIVATION_WEBTRIGGER not set (.env).");
  const u = new URL(WT_URL);
  if (token !== undefined) u.searchParams.set("token", token);
  const res = await fetch(u.toString());
  return { status: res.status, body: (await res.text()).slice(0, 500) };
}

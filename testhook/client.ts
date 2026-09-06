import {observeCall} from '../scenarios/lz-ppm/report-throughput-observer.mjs';
// Client for the apps' dev-gated `_testState` web triggers. Each app's webtrigger
// URL is obtained once after deploy (`forge webtrigger`) and put in .env; the
// shared HARNESS_SECRET authenticates the call. Read-only state for deterministic asserts.
// @ts-ignore - plain ESM JS helper
import { loadEnv } from "../data/env.mjs";

loadEnv();

const SECRET = process.env.HARNESS_SECRET ?? "";
const URLS: Record<string, string | undefined> = {
  "lz-ppm": process.env.LZ_PPM_TESTHOOK_URL,
  cognirunner: process.env.COGNI_TESTHOOK_URL,
  "sentinel-vault": process.env.SENTINEL_TESTHOOK_URL,
};

export async function getTestState(app: keyof typeof URLS | string, query: Record<string, string> = {}, observer:any=null): Promise<any> {
  const base = URLS[app];
  if (!base) throw new Error(`No test-hook URL for '${app}'. Deploy the app's _testState webtrigger and set its URL in .env.`);
  const u = new URL(base);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  if (!observer) {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${SECRET}` } });
    if (!res.ok) throw new Error(`testState ${app} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
  const observed=observeCall(observer,'beginExternal','hook',query.what||'unknown',query);let failed=false,cause:any;
  try {
    const res=await fetch(u.toString(), { headers: { Authorization: `Bearer ${SECRET}` } });
    observeCall(observer,'externalResponse',observed,res,{requestHeaders:{Authorization:`Bearer ${SECRET}`}});
    if (!res.ok) throw new Error(`testState ${app} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return await res.json();
  } catch(error) { failed=true;cause=error;throw error; }
  finally { observeCall(observer,'endExternal',observed,cause,failed); }
}

export const hasTestHook = (app: string): boolean => Boolean(URLS[app] && SECRET);

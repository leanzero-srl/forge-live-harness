// Client for Altomata's dev-only `altomata-backend-trigger` webtrigger.
// Unlike the other apps' `_testState` hooks (GET + Bearer HARNESS_SECRET), Altomata's
// backend trigger is a POST gated by an `x-altomata-secret` header (constant-time compared
// against the ALTOMATA_TRIGGER_SECRET Forge variable). It dispatches registry actions and
// probes via `runAndLog`, so every harness call is attributable (`via:'webtrigger'`) in the
// Activity runlog. URL + secret live in the gitignored .env.
// @ts-ignore - plain ESM JS helper
import { loadEnv } from "../data/env.mjs";

loadEnv();

const URL = process.env.ALTOMATA_TESTHOOK_URL;
const SECRET = process.env.ALTOMATA_TRIGGER_SECRET ?? "";

export const hasAltomataHook = (): boolean => Boolean(URL && SECRET);

/** Low-level POST to the backend trigger. Body is either {actionKey,params} or {probe,...}. */
export async function altomataTrigger(body: Record<string, any>): Promise<any> {
  if (!URL) {
    throw new Error(
      "ALTOMATA_TESTHOOK_URL not set (.env). Provision with:\n" +
        "  forge variables set --encrypt -e development ALTOMATA_TRIGGER_SECRET <secret> && forge deploy -e development\n" +
        "  forge webtrigger create -f altomata-backend-trigger -s wolfaenpak.atlassian.net -p Jira -e development",
    );
  }
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-altomata-secret": SECRET },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  // The backend uses HTTP status to reflect the action outcome (200 ok, 422 graceful
  // {ok:false} failure, etc.). Return the parsed body for ANY JSON response so the caller can
  // inspect .ok; only throw when the body isn't JSON at all (a routing/platform failure).
  let json: any;
  try { json = JSON.parse(text); } catch {
    throw new Error(`altomata trigger -> ${res.status} (non-JSON): ${text.slice(0, 200)}`);
  }
  return json;
}

/** Dispatch a registry action (e.g. 'clone') through the backend trigger. */
export async function altomataAction(actionKey: string, params: Record<string, any> = {}): Promise<any> {
  return altomataTrigger({ actionKey, params });
}

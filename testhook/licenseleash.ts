// Client for License Leash's HMAC-gated reactivation webtrigger. We only ever call it with a
// MISSING or FORGED token to prove rejection — a valid signed token is never minted here, so no
// license is ever reactivated. URL lives in the gitignored .env.
// @ts-ignore - plain ESM JS helper
import { loadEnv } from "../data/env.mjs";

loadEnv();

const WT_URL = process.env.LICENSELEASH_REACTIVATION_WEBTRIGGER;

export const hasReactivationWebtrigger = (): boolean => Boolean(WT_URL);

/** GET the reactivation webtrigger. Pass `undefined` to omit the token. Returns the raw status. */
export async function callReactivationWebtrigger(token?: string): Promise<{ status: number; body: string }> {
  if (!WT_URL) throw new Error("LICENSELEASH_REACTIVATION_WEBTRIGGER not set (.env).");
  const u = new URL(WT_URL);
  if (token !== undefined) u.searchParams.set("token", token);
  const res = await fetch(u.toString());
  return { status: res.status, body: (await res.text()).slice(0, 500) };
}

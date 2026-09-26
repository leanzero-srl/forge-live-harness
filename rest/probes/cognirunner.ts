// CogniRunner — no Runs on Atlassian badge (AI egress), so its Rules REST API ships in EVERY env.
// Dev/staging: URL discovered and an admin token minted through that env's test hook, revoked after.
// Production has no hook: the probe uses a token an admin minted in Settings → API access
// (COGNI_RULES_API_URL_PRODUCTION + COGNI_RULES_API_TOKEN_PRODUCTION in .env) and only READS.
import type { RestProbe, ProbeCtx } from "../probe";
import { must } from "../probe";

const hookGet = (ctx: ProbeCtx, what: string) =>
  ctx.http(`${ctx.v("COGNI_TESTHOOK_URL")}?what=${encodeURIComponent(what)}`, { headers: { Authorization: `Bearer ${ctx.secret("HARNESS_SECRET")}` } });
const hookPost = (ctx: ProbeCtx, body: unknown) =>
  ctx.http(ctx.v("COGNI_TESTHOOK_URL"), { method: "POST", headers: { Authorization: `Bearer ${ctx.secret("HARNESS_SECRET")}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** URL + token for this env; mints (and schedules the revoke of) a token where a hook exists. */
async function rulesApi(ctx: ProbeCtx): Promise<{ url: string; token: string; minted: boolean }> {
  if (ctx.env === "production") return { url: ctx.v("COGNI_RULES_API_URL"), token: ctx.v("COGNI_RULES_API_TOKEN"), minted: false };
  const u = await hookGet(ctx, "rulesApiUrl");
  must(u.status === 200 && u.json?.url, `hook rulesApiUrl → ${u.status}`);
  const me = await ctx.site("/rest/api/3/myself");
  const m = await hookPost(ctx, { action: "mintApiToken", name: `harness-probe-${Date.now().toString(36)}`, accountId: me.json.accountId });
  must(m.status === 200 && m.json?.token && m.json?.row?.id, `mintApiToken → ${m.status}: ${m.text.slice(0, 200)}`);
  const id = m.json.row.id;
  ctx.cleanup(async () => {
    const r = await hookPost(ctx, { action: "invokeResolver", name: "revokeApiToken", accountId: me.json.accountId, payload: { id } });
    must(r.status === 200 && r.json?.revoked === true, `revokeApiToken → ${r.status}: ${r.text.slice(0, 160)}`);
  });
  return { url: u.json.url, token: m.json.token, minted: true };
}

export const probes: RestProbe[] = [
  {
    name: "hook: provider + registry readable",
    door: "hook",
    effect: "read-only",
    proves: "the dev/staging test hook is deployed and its secret matches",
    async run(ctx) {
      const p = await hookGet(ctx, "provider");
      must(p.status === 200, `hook what=provider → ${p.status}: ${p.text.slice(0, 160)}`);
      const r = await hookGet(ctx, "registry");
      must(r.status === 200, `hook what=registry → ${r.status}`);
      ctx.fact("provider", p.json?.value ?? p.json);
      ctx.fact("registryRules", Array.isArray(r.json?.value) ? r.json.value.length : null);
    },
  },
  {
    name: "rest: whoami + release notes with a token, anonymous refused",
    door: "rest",
    effect: "self-restoring",
    proves: "the Rules REST API authenticates cgr_ tokens, refuses anonymous callers, and reports the deployed release",
    async run(ctx) {
      const { url, token, minted } = await rulesApi(ctx);
      ctx.fact("tokenSource", minted ? "minted via hook (revoked after)" : "pre-minted .env token");
      const call = (q: string, t?: string) => ctx.http(`${url}?${q}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
      const anon = await call("resource=whoami");
      must(anon.status === 401, `anonymous whoami → ${anon.status} (expected 401)`);
      const w = await call("resource=whoami", token);
      must(w.status === 200, `whoami → ${w.status}: ${w.text.slice(0, 200)}`);
      ctx.fact("whoami", { role: w.json?.role ?? w.json?.token?.role ?? w.json?.effective?.role ?? null, scope: w.json?.scope ?? w.json?.token?.scope ?? null });
      const rn = await call("resource=release-notes", token);
      must(rn.status === 200, `release-notes → ${rn.status}`);
      const latest = Array.isArray(rn.json?.notes) ? rn.json.notes[0] : Array.isArray(rn.json) ? rn.json[0] : rn.json?.current ?? null;
      ctx.fact("release", latest ? { version: latest.version ?? null, date: latest.date ?? null } : null);
    },
  },
];

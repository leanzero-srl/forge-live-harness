// LeanZero Management (lz-ppm-forge) — Runs on Atlassian badge app.
// Doors: the dev `_testState` hook and the `rest-api` web trigger (lzm_ tokens, minted through the
// hook). BOTH exist on development only: scripts/deploy-prod.mjs strips every webtrigger from
// production to keep the badge, so in production these probes skip and the browser render smoke is
// the check (apps.mjs `badge: true`).
import type { RestProbe, ProbeCtx } from "../probe";
import { must } from "../probe";

const hook = async (ctx: ProbeCtx, q: Record<string, string>) => {
  const u = new URL(ctx.v("LZ_PPM_TESTHOOK_URL"));
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return ctx.http(u.toString(), { headers: { Authorization: `Bearer ${ctx.secret("HARNESS_SECRET")}` } });
};

export const probes: RestProbe[] = [
  {
    name: "hook: plans index answers",
    door: "hook",
    effect: "read-only",
    proves: "the dev test hook is deployed, its secret matches, and the plan index is readable",
    async run(ctx) {
      const r = await hook(ctx, { what: "plans" });
      must(r.status === 200, `hook what=plans → ${r.status}: ${r.text.slice(0, 200)} (404 after a secret change = forge variables need a redeploy)`);
      must(Array.isArray(r.json?.plans), "hook what=plans did not return a plans array");
      ctx.fact("plans", r.json.plans.length);
    },
  },
  {
    name: "rest: token round trip (mint viewer → whoami/capabilities → revoke → refused)",
    door: "rest",
    effect: "self-restoring",
    proves: "the REST API web trigger authenticates lzm_ tokens, refuses anonymous callers, honours the viewer floor and kills a revoked token",
    async run(ctx) {
      const me = await ctx.site("/rest/api/3/myself");
      must(me.status === 200, `myself → ${me.status}`);
      const m = await hook(ctx, { what: "mintApiToken", accountId: me.json.accountId, role: "viewer", name: `harness-probe-${Date.now().toString(36)}` });
      must(m.status === 200 && /^lzm_[0-9a-f]{48}$/.test(m.json?.token ?? "") && m.json?.row?.id && m.json?.url, `mintApiToken → ${m.status}: ${m.text.slice(0, 200)}`);
      const { token, url } = m.json as { token: string; url: string };
      const id: string = m.json.row.id;
      let revoked = false;
      ctx.cleanup(async () => { if (!revoked) { const r = await hook(ctx, { what: "revokeApiToken", id }); must(r.status === 200, `revoke → ${r.status}`); } });
      const call = (q: Record<string, string>, t?: string) => {
        const u = new URL(url); for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
        return ctx.http(u.toString(), { headers: t ? { Authorization: `Bearer ${t}` } : {} });
      };
      const anon = await call({ resource: "whoami" });
      must(anon.status === 401, `anonymous whoami → ${anon.status} (expected 401)`);
      const w = await call({ resource: "whoami" }, token);
      must(w.status === 200 && w.json?.token?.role === "viewer" && w.json?.token?.accountId === me.json.accountId, `whoami → ${w.status}: ${w.text.slice(0, 200)}`);
      must(w.json.token.hash === undefined, "whoami leaked the token hash");
      const c = await call({ resource: "capabilities" }, token);
      must(c.status === 200 && c.json?.role === "viewer" && (c.json?.resolvers?.length ?? 0) > 50, `capabilities → ${c.status}`);
      const createPlan = c.json.resolvers.find((r: any) => r.name === "createPlan");
      must(createPlan && createPlan.allowed === false, "viewer capability list allows createPlan — floor broken");
      ctx.fact("capabilities", { resolvers: c.json.resolvers.length, allowedForViewer: c.json.resolvers.filter((r: any) => r.allowed).length, blocked: c.json.blocked?.length ?? null });
      const rv = await hook(ctx, { what: "revokeApiToken", id });
      must(rv.status === 200, `revokeApiToken → ${rv.status}`);
      revoked = true;
      const dead = await call({ resource: "whoami" }, token);
      must(dead.status === 401, `revoked token whoami → ${dead.status} (expected 401)`);
    },
  },
];

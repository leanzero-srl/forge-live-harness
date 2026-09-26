// License Leash (axpo-license-manager) — dev READ-ONLY SQL state hook (x-testhook-secret).
// Never drives a revoke/reactivate: those touch real group memberships.
import type { RestProbe } from "../probe";
import { must } from "../probe";

export const probes: RestProbe[] = [
  {
    name: "hook: SQL counts readable",
    door: "hook",
    effect: "read-only",
    proves: "the dev state hook is deployed, its secret matches, and Forge SQL answers",
    async run(ctx) {
      const r = await ctx.http(`${ctx.v("LICENSELEASH_TESTHOOK_URL")}?what=counts`, { headers: { "x-testhook-secret": ctx.secret("LICENSELEASH_TESTHOOK_SECRET") } });
      must(r.status === 200 && r.json?.counts, `hook what=counts → ${r.status}: ${r.text.slice(0, 160)}`);
      ctx.fact("tables", Object.keys(r.json.counts).length);
    },
  },
];

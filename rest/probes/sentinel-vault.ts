// Sentinel Vault — keeps its Runs on Atlassian badge with a write-only STATIC web trigger (the config
// API). The static door exists in every env, but it is WRITE-only, so a browserless production check
// can only prove the door is there and refuses anyone without a token (no state is touched: the
// request is rejected before any work). Reads go through Confluence content properties (site door).
import type { RestProbe, ProbeCtx } from "../probe";
import { must } from "../probe";

const hookKvs = (ctx: ProbeCtx, key: string) =>
  ctx.http(`${ctx.v("SENTINEL_TESTHOOK_URL")}?what=kvs&key=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${ctx.secret("HARNESS_SECRET")}` } });

export const probes: RestProbe[] = [
  {
    name: "hook: kvs read answers",
    door: "hook",
    effect: "read-only",
    proves: "the dev test hook is deployed and its secret matches",
    async run(ctx) {
      const r = await hookKvs(ctx, "validation-config-global");
      must(r.status === 200, `hook what=kvs → ${r.status}: ${r.text.slice(0, 160)}`);
      ctx.fact("validationConfigPresent", r.json?.value != null);
    },
  },
  {
    name: "static: config API refuses an anonymous dry-run",
    door: "static",
    effect: "read-only",
    proves: "the static write-only config trigger is deployed in this env and fails closed without a token",
    async run(ctx) {
      const r = await ctx.http(`${ctx.v("SENTINEL_CONFIG_API_URL")}?op=dry-run`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `probe-${Date.now().toString(36)}` }, body: JSON.stringify({ version: 1 }),
      });
      must(r.status === 401, `anonymous dry-run → ${r.status} (expected 401): ${r.text.slice(0, 160)}`);
    },
  },
];

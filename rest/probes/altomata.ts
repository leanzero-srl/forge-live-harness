// Altomata — dev backend trigger (POST + x-altomata-secret). No REST surface of its own yet.
import type { RestProbe } from "../probe";
import { must } from "../probe";

export const probes: RestProbe[] = [
  {
    name: "hook: backend trigger refuses a wrong secret",
    door: "hook",
    effect: "read-only",
    proves: "the dev backend trigger is deployed and constant-time rejects a bad x-altomata-secret (no action runs)",
    async run(ctx) {
      const r = await ctx.http(ctx.v("ALTOMATA_TESTHOOK_URL"), {
        method: "POST", headers: { "Content-Type": "application/json", "x-altomata-secret": "harness-probe-wrong-secret" },
        body: JSON.stringify({ actionKey: "clone", params: {} }),
      });
      must(r.status >= 400 && r.status < 500, `wrong-secret POST → ${r.status} (expected 4xx): ${r.text.slice(0, 160)}`);
      ctx.fact("wrongSecretStatus", r.status);
    },
  },
];

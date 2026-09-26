// The `site` door — plain Jira/Confluence REST with the harness API token. Present in every env
// (it is the test SITE, not the app), so it runs even when an app has no door of its own. It proves
// the credentials every REST oracle depends on are alive, so an oracle failure later is about the app.
import type { RestProbe } from "../probe";
import { must } from "../probe";

export const siteProbes: RestProbe[] = [
  {
    name: "site: the harness API token answers as an active account",
    door: "site",
    effect: "read-only",
    proves: "JIRA_API_TOKEN is valid on the test site (every REST oracle depends on it)",
    async run(ctx) {
      const r = await ctx.site("/rest/api/3/myself");
      must(r.status === 200, `GET /rest/api/3/myself → ${r.status} (expected 200) — JIRA_API_TOKEN in .env is dead or wrong`);
      must(r.json?.accountId && r.json?.active === true, "myself has no accountId or the account is inactive");
      ctx.fact("account", { displayName: r.json.displayName, accountType: r.json.accountType });
    },
  },
];

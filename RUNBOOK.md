# RUNBOOK

Targets are your real apps on **wolfaenpak** (already installed — no deploy needed):

| target id | app | product | surface | env (baked default) |
|---|---|---|---|---|
| `lz-ppm-dashboard` | LeanZero Management (lz-ppm-forge) | Jira | global page | dev `d6096af9…` |
| `cognirunner-global` | CogniRunner | Jira | global page | dev `989ecaa0…` |
| `altomata-hub` | Altomata | Jira | global page | dev `244ac2e9…` |
| `sentinel-vault-realm` | Sentinel Vault | Confluence | space page (space `WFH`) | dev `17516615…` |
| `sentinel-steward-console` | Sentinel Vault (admin) | Confluence | global settings | dev `17516615…` |
| `license-leash-reactivation` | License Leash | Confluence | global page | dev `8910540b…` |
| `license-leash-admin` | License Leash (admin) | Confluence | global settings | dev `8910540b…` |

Env IDs are baked into `config/targets.ts` (the up-to-date development installs). Override per app in
`.env` (`LZ_PPM_ENV_ID` / `COGNI_ENV_ID` / `SENTINEL_ENV_ID` / `SENTINEL_SPACE_KEY` / `ALTOMATA_ENV_ID` /
`LICENSELEASH_ENV_ID`) to point at prod/staging or another space. `npm run discover` re-derives them.

The **deep REST/hook scenarios** (the bulk of the suite — see `scenarios/<app>/`) drive each app's
logic via Jira/Confluence REST + the app's dev `_testState` webtrigger, gated by secrets in the
gitignored `.env`. See **[`docs/AI-GUIDE.md`](docs/AI-GUIDE.md)** for the per-app hooks + recipes.

## Run it (from the repo root)

```bash
npm run auth          # ONE-TIME, OWNER: headed Chrome; log in (email→password→MFA) → .auth/profile
npm run auth:check    # is the saved login alive? (headless, on a throwaway clone; exit 3 = expired)

npm run app -- <app> [--env dev|staging|prod] [--grep <p>] [--spec <file>]… [--all]
                     [--rest-only | --no-rest] [--headed] [--workers N] [--keep-auth-clone]
                     [--force-env] [--bed-wait <sec>]
npm run apps:parallel -- <app> <app> … [same flags]      # concurrent, one batch id
npm run test:rest                                        # every app's probes on dev, no runner
```

Apps: `lz-ppm`, `cognirunner`, `sentinel-vault`, `altomata`, `license-leash`, `chatwise`, `kantega`
(aliases in `config/apps.mjs`). Default selection is the app's read-only **smoke** set; `--grep`/`--all`
widen to the whole `scenarios/<app>` dir (development only); `--spec` names files.

What a run does: REST lane first (`rest/probes.rest.ts`, one test per probe in `rest/probes/<app>.ts`;
a door absent in the env is SKIPPED with the reason), then the BROWSER lane headless on a per-run
clone of the saved login (`.auth/runs/<app>-<runId>/base`, one more clone per Playwright worker).
Off development: the app's env id is swapped in, the dev hook URLs are blanked, only the smoke set
runs unless you name specs. An env with no install on the site blocks the browser lane
(`--force-env` to try anyway). A mutating suite (`--grep`/`--all` on an app with `suiteWorkers: 1`)
takes an advisory per-app bed lock (`~/.local/state/forge-live-harness/bed-locks/<app>.lock`).

Exit codes: 0 green · 1 a test failed · 2 usage · 3 AUTH EXPIRED (owner: `npm run auth`) · 4 nothing
app-level was verified (not installed / REST-only with no door) · 5 bed busy.

Output: `evidence/<app>/<runId>/summary.json` (lanes, counts, per-test rows with skip reasons and
evidence paths, auth: acting-as / clone ms), `<scenario>/` bundles (steps/*.png, aria, trace.zip),
`rest/<app>--<probe>.json` (tokens, secrets and web-trigger paths redacted), `browser-results/`,
`report-browser/`, `report-rest/`. Batch: `evidence/_parallel/<batchId>/summary.json` + `<app>.log`.

Legacy: `npm test` (all specs, shared profile, one at a time), `npm run report`, `npm run assess`
(see AGENTS.md), `DEMO_FAILURE=1 npm test`, `npm run target -- "<title>"`.

## First-run check

The first real run writes `frames.json` (the step-1 iframe diagnostic) into each bundle. Eyeball one
to confirm `data-testid="hosted-resources-iframe"` + a `*.cdn.prod.atlassian-dev.net` src on this
instance, then trust the selectors. If an app uses a non-`#root` mount or needs a stable testid for a
deeper assertion, tell me and I'll add one to that app (you've granted permission).

## Verified mechanically (this session)

REST creds live-OK (Mihai Perdum on wolfaenpak); forge CLI 13 logged in (all 3 apps' installs + env IDs
read live); ffmpeg + system Chrome + Playwright chromium present; project typechecks; specs discovered.

## Notes

- Headless is the default everywhere. It never logs in: it reuses the owner's saved profile through a
  per-run clone. Only `npm run auth` is headed (the one flow that needs a human for 2FA).
- Installs on wolfaenpak (2026-09-26, `forge install list`): CogniRunner has development, staging AND
  production; every other LeanZero app is development only. `npm run app -- <app> --env prod` swaps
  the env id in for you (config/apps.mjs); a prod door (e.g. CogniRunner's Rules API) needs its
  `<VAR>_PRODUCTION` url/token in `.env`.

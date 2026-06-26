# RUNBOOK

Targets are your real apps on **wolfaenpak** (already installed — no deploy needed):

| target id | app | product | surface | env (baked default) |
|---|---|---|---|---|
| `lz-ppm-dashboard` | LeanZero Management (lz-ppm-forge) | Jira | global page | dev `d6096af9…` |
| `cognirunner-global` | CogniRunner | Jira | global page | dev `989ecaa0…` |
| `sentinel-vault-realm` | Sentinel Vault | Confluence | space page (space `WFH`) | dev `17516615…` |

Env IDs are baked into `config/targets.ts` (the up-to-date development installs). Override per app in
`.env` (`LZ_PPM_ENV_ID` / `COGNI_ENV_ID` / `SENTINEL_ENV_ID` / `SENTINEL_SPACE_KEY`) to point at prod/staging
or another space. `npm run discover` re-derives them.

## Run it (from the repo root)

```bash
npm run auth      # ONE-TIME: opens headed Chrome; log in (email→password→MFA) once → .auth/profile
npm test          # drives all three apps live (headed), captures footage → evidence/<runId>/<scenario>/
npm run report    # collate video/trace + ffmpeg keyframes
npm run show-report

# When a run fails:
npm run assess              # writes ASSESS-REQUEST.md next to each failing bundle (for Claude Code)
npm run assess -- --api     # OR autonomous (needs ANTHROPIC_API_KEY) → fix-report.json + fix-brief.md

# Prove the assess loop on purpose (intentional miss against lz-ppm):
DEMO_FAILURE=1 npm test
```

Single target: `npm run target -- "CogniRunner"` (matches the test title).

## First-run check

The first real run writes `frames.json` (the step-1 iframe diagnostic) into each bundle. Eyeball one
to confirm `data-testid="hosted-resources-iframe"` + a `*.cdn.prod.atlassian-dev.net` src on this
instance, then trust the selectors. If an app uses a non-`#root` mount or needs a stable testid for a
deeper assertion, tell me and I'll add one to that app (you've granted permission).

## Verified mechanically (this session)

REST creds live-OK (Mihai Perdum on wolfaenpak); forge CLI 13 logged in (all 3 apps' installs + env IDs
read live); ffmpeg + system Chrome + Playwright chromium present; project typechecks; specs discovered.

## Notes

- Headed default avoids Atlassian's headless "new device" 2FA trigger. Headless/CI may need
  `ATLASSIAN_TOTP_SECRET` (TOTP) or a 2SV-optional account.
- CogniRunner & Sentinel Vault also have older **production** installs on wolfaenpak; the defaults use
  the **development** installs (current). Set the `*_ENV_ID` override to test production instead.

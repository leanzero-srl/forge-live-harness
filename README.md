# forge-live-harness

Drives the **live UI** of Atlassian Forge apps (Jira + Confluence) in a real browser, captures
**video + screenshots + trace + console/network/ARIA**, and turns the footage into **specific,
evidence-cited fix prompts** that a coding agent (Claude Code, or an autonomous Anthropic-API
adapter) consumes to propose fixes.

This complements the existing offline/black-box harnesses (`CogniRunner/test-harness`,
`lz-ppm-forge/test`) by testing the app **as it actually runs inside Atlassian** — the Custom UI
iframe, the real bridge, the real deploy — catching the "iframe mounts but content blank",
"resolver 500 in-product", and host-chrome layout bugs that offline harnesses can't see.

## Quick start

Targets are your real apps already installed on wolfaenpak — **lz-ppm ("LeanZero Management")**,
**CogniRunner** and **Altomata** (Jira), and **Sentinel Vault** and **License Leash** (Confluence).
Env IDs are baked in; no deploy needed.

> 🤖 **Writing/running tests with an AI agent? Start at [`docs/AI-GUIDE.md`](docs/AI-GUIDE.md)** — the
> rules, repo map, safety rules, Forge gotchas, and a per-app cheat-sheet for all five apps. The live
> per-app coverage matrix is in [`findings/coverage-INDEX.md`](findings/coverage-INDEX.md).

```bash
npm install
npx playwright install chromium
cp .env.example .env        # fill JIRA_API_TOKEN (base URL + email are prefilled)

npm run auth                # ONE-TIME (owner): headed browser; log in + pass MFA once → .auth/profile
npm run app -- lz-ppm       # one app, headless, its own auth clone + evidence folder (see below)
npm test                    # the legacy all-specs run on the shared profile
npm run assess              # emit ASSESS-REQUEST.md for any failed run (+ --api for autonomous)
npm run report              # collate video/trace/keyframes; npm run show-report to view
```

See `RUNBOOK.md` for the target table + env overrides.

## How auth works (and why)

A REST API token **cannot** mint a browser session, and a headless login meets Atlassian's 2FA and
cannot pass it. So the owner logs in ONCE, headed (`npm run auth`), into a persistent Chrome profile
(`.auth/profile`, gitignored, main checkout only). Every run after that is **headless** and **never
logs in**: `npm run app` clones the saved profile into a directory that belongs to that run alone
(`.auth/runs/<app>-<runId>/`, an APFS copy-on-write clone, ~0.3 s), proves the session is alive
(`/rest/api/3/myself` with the clone's cookies), and deletes the clone afterwards. A dead session
fails fast with "AUTH EXPIRED: the owner must run `npm run auth`" instead of 30 specs timing out.
`npm run auth:check` answers "is the saved login alive?" the same way. The session idles out after
~30 days.

## Headless, per-app, parallel (the normal way to run it)

```bash
npm run app -- lz-ppm                         # smoke set + REST/hook probes, headless, dev
npm run app -- cognirunner --env prod         # production install; probes skip where prod has no door
npm run app -- lz-ppm --grep "Gantt"          # whole scenario dir filtered (dev only)
npm run app -- lz-ppm --spec scenarios/lz-ppm/rest-api.spec.ts
npm run app -- sentinel-vault --rest-only     # browserless probes only
npm run app -- chatwise --headed              # watch it
npm run apps:parallel -- lz-ppm cognirunner sentinel-vault   # several apps at once
npm run test:isolation                        # offline proof of the isolation contract
```

Each run writes `evidence/<app>/<runId>/` (browser evidence bundles, `rest/*.json` per probe,
Playwright output, html reports, `summary.json`); a parallel batch adds
`evidence/_parallel/<batchId>/summary.json`. Nothing is shared between concurrent runs but the site.
Apps, envs, installs, doors and worker counts live in `config/apps.mjs`; the browserless probes in
`rest/probes/<app>.ts`. A git **worktree** finds `.env` and `.auth/` in the main checkout
(`config/home.mjs`), so parallel sessions work from worktrees without their own login.

`npm test` / `npx playwright test` still work the old way (the shared `.auth/profile` under its
cross-process reservation, one run at a time).

## Layout

- `forge/` — deep-link URL builders, Forge iframe/UI-Kit surface entry, host-object navigation.
- `capture/` — per-step screenshot+ARIA+console/network recorder; evidence-bundle writer.
- `schemas/` — `evidence-manifest` + `fix-report` JSON Schemas (the contract).
- `assess/` — Claude-Code request emitter + autonomous Anthropic adapter.
- `scenarios/` — the live-UI tests (lz-ppm dashboard, CogniRunner global page, Sentinel Vault space page).
- `data/` — Jira/Confluence REST client for live test-data setup/teardown (reused from CogniRunner).
- `config/targets.ts` — registry of UI modules (deep-links, readySelector, contentReady).
- `config/apps.mjs` — registry of APPS for the runner: smoke set, env ids, installs, doors per env, workers.
- `rest/` — browserless REST/hook probe layer (`rest/probes/<app>.ts`, Playwright project `rest`).
- `scripts/run-app.mjs`, `scripts/run-apps-parallel.mjs`, `scripts/auth-check.mjs` — the runners.

See `AGENTS.md` for the assess loop contract.

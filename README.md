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

npm run auth                # ONE-TIME: headed browser; log in + pass MFA once → .auth/profile
npm test                    # drive all three apps live (headed — you watch the footage)
npm run assess              # emit ASSESS-REQUEST.md for any failed run (+ --api for autonomous)
npm run report              # collate video/trace/keyframes; npm run show-report to view
```

See `RUNBOOK.md` for the target table + env overrides.

## How auth works (and why)

A REST API token **cannot** mint a browser session. So you log in once interactively; the harness
keeps a **persistent Chrome profile** (`.auth/profile`) and reuses it. Runs default to **headed**
on your machine — this is best for footage *and* avoids Atlassian flagging a headless context as a
"new device" (which fires email-2FA). The session (`cloud.session.token`) idles out after ~30 days;
every run does a fast-fail check and tells you to `npm run auth` again if it expired.

Headless/CI is opt-in (`HEADLESS=1`) and may require TOTP 2FA automation (`ATLASSIAN_TOTP_SECRET`)
or a 2SV-optional test account.

## Layout

- `forge/` — deep-link URL builders, Forge iframe/UI-Kit surface entry, host-object navigation.
- `capture/` — per-step screenshot+ARIA+console/network recorder; evidence-bundle writer.
- `schemas/` — `evidence-manifest` + `fix-report` JSON Schemas (the contract).
- `assess/` — Claude-Code request emitter + autonomous Anthropic adapter.
- `scenarios/` — the live-UI tests (lz-ppm dashboard, CogniRunner global page, Sentinel Vault space page).
- `data/` — Jira/Confluence REST client for live test-data setup/teardown (reused from CogniRunner).
- `config/targets.ts` — registry of apps-under-test (your three real apps + baked env IDs).

See `AGENTS.md` for the assess loop contract.

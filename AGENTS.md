# AGENTS.md — the assess / aid loop

This repo drives the live UI of Forge apps, captures footage, and asks a coding agent to turn a
failed run into a **specific, evidence-cited fix**. If you are an agent pointed at a failing run,
this is your contract.

> **Writing or running tests (not fixing a failed run)?** Read **[`docs/AI-GUIDE.md`](docs/AI-GUIDE.md)**
> first — it has the testing rules, the repo map, the safety rules, and a per-app cheat-sheet for all
> five apps (lz-ppm, CogniRunner, Sentinel Vault, Altomata, License Leash). This file (AGENTS.md) is
> only the *failure → fix-report* contract below.

## What the harness produces

Per scenario run, an **evidence bundle** at `evidence/{runId}/{scenario}/`:

- `evidence-manifest.json` — the run + steps + per-step `expectation {assertion, narrative}` and status. (schema: `schemas/evidence-manifest.schema.json`)
- `steps/NN-<name>.png` — one screenshot per step (you can Read these directly).
- `video.webm`, `trace.zip` — full footage (humans: `npx playwright show-trace`).
- `console.json`, `network.json` — ordered logs; manifest "slices" point at exact indices.
- `aria.yaml` — ARIA snapshot taken INSIDE the Forge iframe.
- `frames.json` — the discovered iframe tree (step-1 diagnostic).
- On failure: `ASSESS-REQUEST.md` (your brief).

## Your job (when you see ASSESS-REQUEST.md)

1. Read `ASSESS-REQUEST.md` — it names the failed expectation(s), the PNGs to Read, and the
   already-extracted console/network slices to cite.
2. Read the focus screenshots and the cited slices. Look at `aria.yaml` for element-level facts.
3. Confirm hypotheses against the **app-under-test source** (the fix goes in *that* repo, e.g.
   `~/Projects/lz-ppm-forge`, NOT in this harness). Read the real file before hinting at it.
4. Write two files into the bundle folder:
   - `fix-report.json` — conform to `schemas/fix-report.schema.json`.
   - `fix-brief.md` — the human-readable render.

## Hard rules (anti-hallucination)

- **Every finding cites ≥1 evidence ref** (a screenshot path, `console.json#N`, `network.json#N`, or `aria.yaml#L..`). No cite → don't claim it.
- A root-cause hypothesis you can't confirm from evidence/source MUST set `rootCause.lowConfidence: true` (and `confidence < 0.5`).
- **Localize**: surface + selector + aria name (+ bbox if visible). Generic "the page is broken" is a failure.
- A `suggestedFix` must name a real file in the app repo (`repo` + `filePathHint`) and describe the concrete change. Read the file first; if you didn't, mark the fix's `confidence` low.
- Give `repro` steps.

## Reviewing footage

- `npx playwright show-trace evidence/{runId}/{scenario}/trace.zip`
- `npx playwright show-report`
- step PNGs in `evidence/{runId}/{scenario}/steps/`

## UI rules (if you ever build a report/viewer here)

Flat "paper", sharp corners. NO left accent rails / border-left stripes. NO faded low-alpha tints —
use solid saturated colors. NO native `alert`/`confirm`/`select`.

# Findings

Real issues surfaced by the deep suites. Each is reproducible and locked by a test
(the test asserts the CURRENT/actual behavior so the suite stays green + deterministic;
the annotation flags it for the owner to decide fix vs. accept).

## F-COGNI-1 — `field-required` allows whitespace-only values  ·  severity: minor  ·  confidence: high

**App:** CogniRunner (premade `field-required` validator).
**Symptom:** A text field containing only spaces (`"   "`) PASSES `field-required` (transition allowed). A user can satisfy a "field is required" gate by typing spaces.
**Root cause:** `isEmpty()` in `src/premade-rules.js` treats a plain string as empty only when it `=== ""`. It does not trim. (ADF values *are* flattened + trimmed, so empty rich-text is correctly caught — the gap is plain string/textarea fields.)
**Repro:** `premade-barrage.spec.ts › fr-whitespace` — set a text field to `"   "`, fire a `field-required` validator → 204 (allowed).
**Suggested fix:** trim plain-string values before the emptiness check in the `field-required` branch (or in `isEmpty` for strings): `if (typeof v === "string" && v.trim() === "") return true;`. Low blast radius if scoped to `field-required`.
**Status:** reported; test locked to actual behavior (`expectBlock:false`) pending owner decision.

## F-SENTINEL-1 — `warn`-severity validation rules appear inert  ·  severity: minor  ·  confidence: medium (code-review)

**App:** Sentinel Vault (page-content validation trigger).
**Observation:** In `src/server/triggers.js::runValidationPhase`, when `evaluateRules` returns `passed === true` (i.e. no **block**-severity violation), the function sets last-good + (gate) writes "passed" and **returns early (~line 443)** — BEFORE the advisory/gate/revert blocks. Since `passed` is false only for `block` severity (`rules-engine.js:111`), a rule with `severity:"warn"` that is violated produces a violation entry but **never posts an advisory comment or sets gate state on its own** — it's only surfaced when a `block` rule also fails on the same page.
**Impact:** A steward who configures advisory rules at `warn` severity expecting informational comments gets nothing. Likely a severity-model gap (warn should still drive advisory).
**Status:** code-review finding (the live suite verifies `block`-severity advisory + revert work). Worth a live negative-confirm + an owner decision on intended warn semantics.

## Non-findings (investigated, ruled out)

- **Date `gt` "rejects" a future date** — FALSE ALARM. The barrage flagged `cf_date gt` blocking a future date; investigation (`debugTrace`) showed **Jira stored `2099-01-01` as `1999-01-01`** (a Jira far-future-year quirk), so the rule correctly rejected 1999>2026. CogniRunner's date comparison is correct. The barrage now uses near-future dates. (A genuine Jira-platform quirk, not an app bug.)

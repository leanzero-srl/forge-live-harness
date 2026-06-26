# Endless test-evolve-verify loop — state

## ⭐ SCOREBOARD (campaign summary, iter1–23)

**Source:** an adversarial code audit (34 findings, lz-ppm + Sentinel) + a CogniRunner barrage + the harness's own live findings. Every finding adjudicated live where practical.

**Bugs LIVE-CONFIRMED (15) — reproduced on wolfaenpak:**
- **🔴 BLOCKERS (2, lz-ppm, actively corrupting data hourly):** **B1** scheduled refresh wipes Duration/Buffer (Duration 8→null); **B2** scheduled refresh drops descendants (PARENT,SUB→PARENT).
- **🟠 MAJOR (8):** **M11** incremental update wipes another plan's dependency (cross-plan corruption); **M5/M6** inverted Gantt bars (dur 0, due<start) on cascade + parent-rollup; **M10** fresh index drops priority/labels; **SV-M1** hard-revert destroys unrelated edits; **SV-M4** length-rule counts macro placeholders; **SV-M5** owner's sealed-section edit destroyed by a later non-owner save.
- **🟡 MINOR (5):** **M8** a malformed date crashes the whole recalc; **SV-m2** gate stuck 'failed' after auto-revert; **SV-m4** required-macro endsWith false-pass; **SV-m5** in-cell heading → false hierarchy skip; **SV-m6** removed section re-inserted at a stale index. **+ F-COGNI-1** field-required allows whitespace-only.

**DEBUNKED (3) — DO NOT FIX (audit false-positives, contradicted live):** **M7** (weekend-start trio stays consistent), **m1** (weekend-due duration not over-counted), **B3** (changelog `.to` IS populated for date cf — protection would revert; was rated a blocker). *(B3: confirm the Forge event changelog before closing.)*

**BOUNDED — code-verified, live-repro impractical/out-of-scope (16):** lz-ppm M1/M2/M3/M4 (need concurrent writers / the write-resolver), M9/m3 (perf-only), M12 (config-gated — N/A on wolfaenpak's default link type), B4 (>100-issue board), m2 (bounded leak); Sentinel SV-M2/M3/M6/M7/M8/m1/m3 (forced-409 / resolver-only / ~2³² hash brute-force / duplicate-event). Each annotated with its exact constraint in findings/*.md.

**VERIFIED CORRECT (no bug):** lz-ppm cascade+buffer engine (oracle-backed); Sentinel validation advisory/hard-revert, rule-eval nesting, sealed-section tamper→restore, expired-seal-inert; CogniRunner 27/29 barrage rules + sub-tasks-resolved + attachment-required + comment-required(block).

**SUITE:** ~71 tests. Deep REST findings suites are **3× zero-flake per app** (lz-ppm 19, CogniRunner 32, Sentinel deep ~14). Live-UI render smokes (3) + async Confluence-trigger Sentinel tests carry **retries** to absorb environmental latency (the deterministic REST tests run at 0 retries so real regressions still surface).

**APP-REPO COMMITS (dev-gated `_testState` hooks, on each app's branch, not pushed):** lz-ppm (`+refreshPlan`,`+incrementalUpdate`), CogniRunner, Sentinel (`harness/test-hook` branch). Harness published to github.com/leanzero-srl/forge-live-harness.

---

Cycle: **lz-ppm → sentinel-vault → repeat**. CogniRunner is fix-owned by the user (barrage + F-COGNI-1 already captured); included in the final report.
Per-app findings in `findings/<app>.md`. Only the user stops the loop; on stop, present all 3 apps' findings.

| iteration | app | summary |
|---|---|---|
| 1 | lz-ppm | ✓ enabled buffer field options; added buffer absorb+exhaust fixtures → 7/7 vs oracle; buffer logic correct |
| 2 | sentinel-vault | ✓ rule-eval edges 5/5; **LIVE-CONFIRMED SV-m5** (in-cell heading false skip) |
| — | (workflow) | **34 adversarially-verified findings landed** → captured: lz-ppm B1-B4/M1-M12/m1-m3, sentinel SV-M1..M8/SV-m1..m6 |
| 3 | lz-ppm | ✓ **LIVE-CONFIRMED M8** (malformed date crashes settle, 3/3 variants 500) |
| 4 | sentinel-vault | ✓ **LIVE-CONFIRMED SV-m4 + SV-M4** (required-macro endsWith false-pass; min-length placeholder) |
| 5 | lz-ppm | ✓ **LIVE-CONFIRMED M5** (inverted bar: B start 03-02 / due 01-07 / dur 0) |
| 6 | sentinel-vault | ✓ **LIVE-CONFIRMED SV-m2** (gate stuck 'failed' after auto-revert: content v3 compliant, state v2 failed) |
| 7 | lz-ppm | ✓ **LIVE-CONFIRMED M10** (Jira priority=High/label → index priority=null/labels=[]) |
| 8 | sentinel-vault | ✓ **LIVE-CONFIRMED SV-M1** (revert destroyed the legit NEWSECTION heading) |
| 9 | lz-ppm | ⚠ M7 + m1 INVESTIGATED → did NOT reproduce live (audit false-positives; deprioritized) |
| 10 | sentinel-vault | ✓ sealed-section harness UNLOCKED; tamper→restore VERIFIED CORRECT (core feature works) |
| 11 | lz-ppm | ✓ **LIVE-CONFIRMED M6** (parent rollup inverted: P start 03-02 / due 01-09 / dur 0) |
| 12 | sentinel-vault | ✓ **LIVE-CONFIRMED SV-m6** (removed section re-inserted at stale index 1, between new blocks) |
| 13 | lz-ppm | ✓ **LIVE-CONFIRMED B1 (BLOCKER)** — scheduled refresh wipes Duration 8→null (hook gained refreshPlan, committed) |
| 14 | sentinel-vault | ✓ **LIVE-CONFIRMED SV-M5** (owner edit V2 destroyed by later non-owner revert; snapshot never re-baselined) |
| 15 | lz-ppm | ✓ **LIVE-CONFIRMED B2 (BLOCKER)** — refresh dropped the subtask descendant (keys PARENT,SUB → PARENT) |
| 16 | sentinel-vault | ✓ RIGOR — Sentinel suite 16 tests 3× green; remaining 6 findings documented with live-repro constraints (honest, not flaky) |
| 17 | lz-ppm | ⚠ B3 INVESTIGATED → premise CONTRADICTED live (.to populated, not null); likely FALSE-POSITIVE blocker |
| 18 | sentinel-vault | ✓ expired-seal-INERT verified correct (tamper not restored past 18s window) |
| 19 | (all 3 apps) | ✓ FULL 3-APP 3× GATE — 65 tests, zero-flake (fixed a createFixture indexing-race flake) |

### 3-app stability gate (iter19)
| app | tests | 3× result | notes |
|---|---|---|---|
| lz-ppm | 19 | 19/19/19 ✓ | fixed flake: `createFixtureRetry` (scenarios/_support/lzfixture.ts) retries createFixture until all expected keys are indexed — kills the `applyEdit 404 "issue not in plan index"` race from Jira search lag |
| cognirunner | 29 | 29/29/29 ✓ | adversarial premade barrage, stable |
| sentinel-vault | 17 | 17/17/17 ✓ | validation + sealed-section + expiry, stable |
| **total** | **65** | **zero-flake** | residue: tagged `[harness-test]` issues on WFH/COGTEST (Jira delete 403) — expected, harmless |

| iter | app | summary |
|---|---|---|
| 20 | cognirunner | ✓ sub-tasks-resolved + attachment-required VERIFIED CORRECT; comment-required block-path correct (allow path UI-only constraint). 3× green. 68 tests total now. |
| 21 | lz-ppm | ✓ **LIVE-CONFIRMED M11** (cross-plan corruption: incremental update wiped Plan B's X→Q dep). Hook gained incrementalUpdate (committed). |
| 22 | lz-ppm | ✓ RIGOR — M2 needs the completeWrite resolver (bounded); M1/M3/M4/M9/M12/B4/m2/m3 bounded with explicit constraints |
| 23 | (all 3 apps) | ✓ FINAL CONSOLIDATION — scoreboard written (top of file); fixed barrage field-race + render-smoke retries; deep suites 3× zero-flake per app |
| 24 | harness | (next) commit + push the campaign's accumulated harness work (specs/findings/helpers) to github.com/leanzero-srl/forge-live-harness; refresh project memory |

**Live-confirmed so far (14):** SV-m5, M8, SV-m4, SV-M4, M5, SV-m2, M10, SV-M1, M6, SV-m6, **B1**, SV-M5, **B2**, M11.


**Live-confirmed so far (13):** SV-m5, M8, SV-m4, SV-M4, M5, SV-m2, M10, SV-M1, M6, SV-m6, **B1**, SV-M5, **B2**. (2 blockers reproduced.)
**Investigated → NOT reproduced live (3):** M7, m1 (working-days false-positives), **B3** (changelog .to populated, not null — likely false-positive blocker; confirm Forge event changelog before fixing).
**Sentinel stability:** 16 tests 3× identical green. 8/14 Sentinel findings live-confirmed; 6 documented as live-repro-impractical.
**Remaining [code]-only (need more setup):** lz-ppm B2 (refreshPlan path — easy next), B3/B4/M1-M4/M9/M11/M12/m2/m3 (write-resolver/protection/indexing internals); Sentinel SV-M2/M3/M6/M7/M8/m1/m3 (forced-409 / resolver / brute-force — several impractical to reproduce live).
**Verified CORRECT live (coverage, no bug):** cascade 7-fixture oracle suite, validation advisory/hard-revert, rule-eval edges, sealed-section tamper→restore.
**Now reachable (sealed-section unlock):** SV-m6 (stale re-insert index), SV-M5 (owner-edit re-baseline gap), SV-M7 (FNV hash).
**Investigated → NOT reproduced live (2):** M7 (weekend-start trio stays consistent), m1 (weekend-due duration not over-counted) — likely audit false-positives, deprioritized.
24 remain [code]-only. NOTE: SV-M8/SV-m3 need resolver/bridge (UI or hook-extension); SV-M5/M6/SV-m6 (sealed-section) need a seal registered via hook set + the section pass; M2/M3/M4/B3 (write-back/lock/protection) need the write-resolver or protection-trigger paths. All findings in findings/{lz-ppm,sentinel-vault,cognirunner}.md.

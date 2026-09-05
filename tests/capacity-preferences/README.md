# Owned Capacity preferences

One actual response tracker now governs all five active capacity-writing campaign journeys (ordinary numerical capacity, boundaries, numeric sponsor report, 5,000-row refusal, retained UAT). The two explicit operator recovery specs retain their narrower exact-residue guard.

Before any direct or UI save, the tracker reads and compares the full current settings against the last acknowledged owned state. It records intent before the mutation and accepts only a successful acknowledgement at exactly expectedVersion + 1. Transport errors, unsuccessful responses, and unrelated versions remain unresolved: none licenses restoration. UI save acknowledgement is recorded independently before waiting for the later report.

Restoration requires known current ownership, uses its actual version, and verifies two subsequent reads. Concurrent/unknown state fails and retains the exact owned primary/secondary plans, issues and version through the shared fixture's guarded recovery branch. This is explicitly failed cleanup with integrityPassed=false, never a green retained fixture. The original body error and every attempted independent cleanup error survive.

`node --test tests/capacity-preferences/*.test.mjs` runs ten local controls against the actual helper and actual transpiled outer fixture. These use isolated service/REST boundaries and do not claim live platform validation. `local-proof.txt` retains the result. The unchanged independent previous outer-cleanup failure probe still verifies original error preservation and both delete attempts (`previous-cleanup-probe.txt`). Live same-account save contention and the five ordinary/user journeys remain required after the new deployment.

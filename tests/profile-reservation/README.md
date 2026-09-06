# Profile reservation author gate

Source cut489747b; no live auth profile, browser launch, Jira operation or deployment was used to create this evidence. `author-proof.txt` retains24 passing local controls from:

```
node --import tsx --test tests/profile-reservation.test.ts tests/profile-launch-integration.test.ts
bash -n scripts/run-batches.sh
npx tsc --noEmit
```

Shell syntax passes. Typecheck retains exactly the two pre-existing Sentinel errors in `typecheck.txt`; no new profile/central-launcher error is reported. This is not a whole-repo green typecheck claim.

## Ownership contract

All shared fixture launches (worker, video and interactive auth) call `forge/browser.ts`, which uses `launchReservedProfile`. A Python subprocess holds actual `fcntl.flock` exclusively on a canonical profile-keyed stable file beneath `~/.local/state/forge-live-harness/profile-locks`. It is outside Chrome's profile, mode600, owned by the current OS user; the directory is mode700. The file is never unlinked/replaced by the implementation. Existing malformed/empty records fail closed. Symlink profile aliases canonicalize to the same reservation; different profiles have independent files. Node kills only its own unresponsive holder on startup timeout, never a browser or unrelated PID.

Before emitting acquired, the holder fsyncs an active intent to that same locked inode. Parent normal exit/SIGKILL, pipe EOF or holder death retain it. A later owner cannot treat a released OS lock or missing Chrome marker as proof of no browser: the active intent blocks it. Recorded PIDs are diagnostics, not authority for clearing. There is no TTL, age-based recovery or PID-reuse guess.

A prelaunch marker refusal can cancel its own unlaunched reservation. After a browser launch was attempted, only an explicit successfully awaited context.close, followed by the holder's independent absence-of-marker check, returns the record to idle. Unexpected context close, failed close, unresolved launch and holder loss retain unclean intent. On holder loss while Node lives, the wrapper closes only its owned context; if launch is pending it closes the eventual result and never returns it. It does not expose an automatic reset tool for unclean intent.

Marker handling is inspection only: missing owner with remaining markers, malformed PID, non-symlink/unreadable, foreign host, dead/unknown PID all refuse and leave bytes untouched. Live/EPERM reports PROFILE_BUSY. Stable reservation ownership does not authorize deleting native Chrome markers created by external noncooperating launchers. Such launchers do not honor this flock, so Chrome's intact native singleton remains the final exclusion boundary. No universal exclusion against arbitrary external tools is claimed.

## Launch and fallback

Installed Playwright's actual `_prepareToLaunch` resolves Chrome's executable and emits `Chromium distribution 'chrome' is not found` before `launchProcess`. Only that specific pre-spawn condition permits bundled fallback under the same reservation. If both fail, AggregateError retains the original Chrome and Chromium errors. Generic Chrome failures are surfaced directly with unclean intent retained; they no longer trigger broad retry or cleanup. This is deliberately stricter because Playwright's generic error paths may swallow process-close errors. The initial reported live crash cause remains unproven; this cut fixes independently reproduced ownership/deletion defects, not a claimed crash diagnosis.

The entire `run-batches.sh` browser precleanup block was removed, including both broad pkill commands and marker rm. The actual shell script is tested in an isolated copy with fake launch and forbidden-command sentinels: browser batch reaches the launcher with zero kill/delete calls. The campaign's outer wait remains advisory. Python holder source must participate in instrument hashing; live_baseline owns that campaign hash extension and independent mutation guard.

## Proof and limits

Real independent Node/Python processes prove one launch entrant, typed loser refusal, lock inode stability, canonical aliases, separate profiles, natural parent exit, SIGKILL and killed holder. Owned fake context/process controls prove holder death closes the owned context, deferred launch result closure, surviving owner markers, exact error preservation, failed/unexpected/awaited/idempotent close, prelaunch cancellation, missing Python and bounded unresponsive holder. Marker tests preserve malformed/missing/foreign/non-symlink/live/EPERM/dead and deterministically replaced-live markers. No auth environment is imported by the isolated lifecycle tests.

Actual `browser.ts` is transpiled in a VM with only environment and Chromium boundaries replaced, while the real reservation module and OS holder run against a temp profile/root. Worker/video/auth options and reservation across module instances are checked. Structural entry-point checks complement this behavior; they do not replace the independent-process gate.

The original app-repo independent red probes and kernel proof are retained at `docs/campaign-2026-09/profile-coordination-independent*` and `profile-kernel-lock-*`. Their stale-cleanup positive expectation must change to the new blocked-recovery contract because automatic deletion was removed. Their old VM dependency seam/concurrency scheduler needs adaptation by the independent reviewer, preserving the original red evidence.

**Pending:** independent BREAK, real temporary unauthenticated Chromium concurrency and clean-exit usability, then actual live campaign after parent approval of the cut. No temporary or live browser run was attempted in this author gate. Clean-close errors that leave markers intentionally block reuse pending explicit operator investigation; this trades automatic recovery for source preservation. Manual recovery is outside this cut and must establish no current/orphan owner before changing any intent or native marker. Do not delete the stable lock inode to recover.

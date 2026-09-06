#!/usr/bin/env python3
"""Resumable, version-bound LZ live-test campaign. Standard library only.

No deploys or arbitrary shell commands. Planned features never become passes.
Each ready unit runs identity -> tests -> identity, with durable attempt evidence.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / 'config/lz-campaign/manifest.json'
STOP_NOW = False

BROWSER_MODES = ('persistent-chrome', 'portable-chrome152')


def browser_mode(config):
    mode = config.get('browserMode', 'persistent-chrome')
    if mode not in BROWSER_MODES:
        raise ValueError('Unknown persisted browser mode')
    return mode


def browser_binding(requested, account, previous, verb):
    prior_mode = browser_mode(previous) if previous else None
    if verb == 'resume' and not previous:
        raise ValueError('Resume requires persisted config')
    mode = requested if requested is not None else prior_mode or 'persistent-chrome'
    if mode not in BROWSER_MODES:
        raise ValueError('Unknown browser mode')
    if prior_mode is not None and prior_mode != mode:
        raise ValueError('Browser mode changed; use a new run ID')
    previous_account = previous.get('expectedAccountId') if previous else None
    if previous_account is not None and account is not None and previous_account != account:
        raise ValueError('Expected principal changed; use a new run ID')
    expected = account if account is not None else previous_account
    if mode == 'portable-chrome152' and (not isinstance(expected, str) or not expected.strip()):
        raise ValueError('Portable mode requires the independently known expected account ID')
    return {'browserMode': mode, 'expectedAccountId': expected}


def browser_environment(config, inherited):
    mode = browser_mode(config)
    expected = config.get('expectedAccountId')
    if mode == 'portable-chrome152' and (not isinstance(expected, str) or not expected.strip()):
        raise ValueError('Portable config has no expected principal')
    env = dict(inherited)
    # Authoritative binding on entry/tests/after/resume, never inherited shell mode.
    env['LZ_HARNESS_BROWSER_MODE'] = mode
    env.pop('LZ_EXPECTED_ACCOUNT_ID', None)
    if expected is not None:
        env['LZ_EXPECTED_ACCOUNT_ID'] = expected
    return env



def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, indent=2) + '\n')
    tmp.replace(path)


def read(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def digest(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def instrument_hash():
    paths = [Path(__file__), ROOT / 'playwright.config.ts', ROOT / 'package-lock.json', ROOT / 'scripts/lz-campaign-assets-fixture.mjs', ROOT / 'scripts/lz-ppm-population-audit.mjs']
    for folder in ['scenarios/lz-ppm', 'fixtures', 'forge', 'config', 'testhook', 'capture', 'data']:
        paths.extend(p for p in (ROOT / folder).rglob('*') if p.suffix in ['.ts', '.js', '.mjs', '.json', '.py'])
    h = hashlib.sha256()
    for p in sorted(set(paths)):
        h.update(str(p.relative_to(ROOT)).encode()); h.update(p.read_bytes())
    return h.hexdigest()


def validate_manifest(manifest):
    features = manifest.get('features', [])
    if not features or len({f['id'] for f in features}) != len(features):
        raise ValueError('A nonempty unique feature inventory is required')
    for f in features:
        if f.get('retainedUat') is not None and (f.get('retainedUat') is not True or f['id'] != 'retained-uat-live' or f.get('specs') != ['scenarios/lz-ppm/journey-campaign-retained-uat.spec.ts']):
            raise ValueError('Fixture retention is restricted to the explicit connected UAT unit')
        if f['status'] not in ['ready', 'planned'] or not f.get('acceptance'):
            raise ValueError('Every feature needs explicit readiness and acceptance IDs')
        if f['status'] == 'ready':
            if not f.get('specs') or f.get('minTests', 0) < 1:
                raise ValueError('Ready feature has no non-vacuous test contract: ' + f['id'])
            for name in f['specs']:
                p = (ROOT / name).resolve()
                if not p.is_relative_to(ROOT / 'scenarios/lz-ppm') or not p.exists():
                    raise ValueError('Unknown/non-LZ spec: ' + name)
    return features


def classify_report(report, feature, exit_code):
    """Do not trust aggregate expected count: expected failures are not passes."""
    records = []
    def walk(suite):
        for spec in suite.get('specs', []):
            for test in spec.get('tests', []):
                results = test.get('results', [])
                records.append({'title': spec.get('title'), 'file': spec.get('file', suite.get('file', '')),
                                'expected': test.get('expectedStatus'), 'status': test.get('status'),
                                'last': results[-1].get('status') if results else None})
        for child in suite.get('suites', []):
            walk(child)
    for suite in report.get('suites', []):
        walk(suite)
    reasons, passes, witnesses, files = [], [], [], set()
    allowed = feature.get('allowedExpectedFailures', [])
    for row in records:
        if row['last'] not in [None, 'skipped']:
            files.add(row['file'])
        if row['expected'] == 'failed' and row['status'] == 'expected' and row['last'] == 'failed' and row['title'] in allowed:
            witnesses.append(row['title'])
        elif row['expected'] == 'passed' and row['status'] == 'expected' and row['last'] == 'passed':
            passes.append(row['title'])
        else:
            reasons.append('nonpassing test: ' + json.dumps(row, sort_keys=True))
    if exit_code != 0:
        reasons.append('Playwright exit ' + str(exit_code))
    if report.get('errors'):
        reasons.append('Playwright top-level errors')
    if len(passes) + len(witnesses) < feature['minTests']:
        reasons.append('insufficient passing tests or explicitly allowed defect witnesses')
    for name in feature.get('specs', []):
        if not any(str(f).replace('\\', '/').endswith(name) for f in files):
            reasons.append('configured spec did not execute: ' + name)
    return {'status': 'failed' if reasons else 'known_defect' if witnesses else 'passed',
            'ordinaryPasses': passes, 'expectedDefectWitnesses': witnesses, 'reasons': reasons, 'testCount': len(records)}


def process_start(pid):
    try:
        out = subprocess.check_output(['ps', '-p', str(pid), '-o', 'lstart='], text=True).strip()
        return out or None
    except subprocess.CalledProcessError:
        return None


def is_owner_alive(owner):
    return bool(owner and owner.get('pid') and owner.get('processStart') == process_start(owner['pid']))


def lock_acquire(path, wait_seconds=300):
    deadline = time.monotonic() + wait_seconds
    while True:
        if STOP_NOW:
            raise RuntimeError('Interrupted while waiting for campaign lane')
        try:
            path.mkdir()
            owner = {'pid': os.getpid(), 'processStart': process_start(os.getpid()), 'time': utc()}
            atomic(path / 'owner.json', owner)
            return owner
        except FileExistsError:
            owner = read(path / 'owner.json')
            if owner and not is_owner_alive(owner):
                (path / 'owner.json').unlink(missing_ok=True)
                try:
                    path.rmdir()
                except OSError:
                    pass
                continue
            if time.monotonic() >= deadline:
                raise RuntimeError('Browser campaign lane is occupied; owner=' + json.dumps(owner))
            time.sleep(2)


def wait_profile_free(timeout_seconds=300):
    marker = ROOT / '.auth/profile/SingletonLock'
    deadline = time.monotonic() + timeout_seconds
    while marker.is_symlink():
        try:
            pid = int(os.readlink(marker).rsplit('-', 1)[1])
        except (ValueError, IndexError):
            raise RuntimeError('Cannot establish browser profile lock ownership')
        if not process_start(pid):
            return  # existing browser fixture safely cleans its own stale lock
        if STOP_NOW or time.monotonic() >= deadline:
            raise RuntimeError('The shared browser profile is in use; no sibling process was killed')
        time.sleep(2)


def kill_group(child):
    # A group can outlive its leader. Always signal the owned group even when
    # Playwright has exited, otherwise a background browser can leak the lane.
    try:
        os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        child.wait(timeout=10)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    child.wait()


def run_child(command, env, log_path, timeout_seconds, heartbeat=None):
    started = time.monotonic()
    next_heartbeat = started
    with log_path.open('w') as log:
        child = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            while child.poll() is None:
                if STOP_NOW:
                    kill_group(child)
                    return {'exit': child.returncode, 'interrupted': True}
                if time.monotonic() - started >= timeout_seconds:
                    kill_group(child)
                    return {'exit': child.returncode, 'timedOut': True}
                if heartbeat and time.monotonic() >= next_heartbeat:
                    heartbeat(child.pid); next_heartbeat = time.monotonic() + 15
                time.sleep(0.25)
            return {'exit': child.returncode}
        finally:
            kill_group(child)


def run_phase(config, feature, phase, attempt, heartbeat):
    report_path = attempt / (phase + '-playwright.json')
    env = {**browser_environment(config, os.environ), 'PLAYWRIGHT_JSON_OUTPUT_NAME': str(report_path), 'LZ_EXPECTED_UI_VERSION': config['uiVersion'],
           'LZ_CAMPAIGN_SOURCE_EXTENSION': json.dumps(config.get('sourceExtension')), 'LZ_CAMPAIGN_PHASE': phase, 'LZ_CAMPAIGN_UNIT_DIR': str(attempt), 'LZ_CAMPAIGN_RUN_ID': config['runId']}
    env.pop('LZ_RETAINED_UAT_LEDGER', None)
    if feature.get('retainedUat') is True and phase in ['tests', 'after']:
        env['LZ_RETAINED_UAT_LEDGER'] = str(attempt / 'retained-uat-ledger.json')
    gate = {'specs': [config['identitySpec']], 'minTests': 1} if phase != 'tests' else feature
    command = [str(ROOT / 'node_modules/.bin/playwright'), 'test', *gate['specs'], '--project=chromium', '--workers=1', '--reporter=line,json', '--output=' + str(attempt / (phase + '-artifacts'))]
    if phase == 'tests':
        if feature.get('grep'):
            command += ['--grep', feature['grep']]
        if feature.get('grepInvert'):
            command += ['--grep-invert', feature['grepInvert']]
    atomic(attempt / (phase + '-command.json'), {'argv': command, 'cwd': str(ROOT), 'phase': phase, 'uiVersion': config['uiVersion'], 'browserMode': browser_mode(config)})
    if browser_mode(config) == 'persistent-chrome':
        wait_profile_free()
    process = run_child(command, env, attempt / (phase + '.log'), feature.get('timeoutSeconds', 900) if phase == 'tests' else 240, heartbeat)
    if process.get('timedOut') or process.get('interrupted'):
        return {'status': 'timed_out' if process.get('timedOut') else 'interrupted', 'process': process}
    try:
        report = read(report_path)
        if report is None:
            raise ValueError('missing JSON report')
        return {**classify_report(report, gate, process['exit']), 'process': process}
    except (ValueError, TypeError) as exc:
        return {'status': 'failed', 'reasons': [str(exc)], 'process': process}


def require_entry_source(result, identity, expected_fingerprint):
    if result.get('status') == 'passed' and identity.get('sourceFingerprint') != expected_fingerprint:
        return {**result, 'status': 'failed', 'reasons': ['Source fingerprint changed since the campaign entry guard']}
    return result


def result_stamp(config, feature, instrument):
    return digest({'instrument': instrument, 'feature': feature, 'ui': config['uiVersion'], 'forge': config['forgeVersion'], 'appCommit': config['appCommit'], 'source': config.get('sourceFingerprint'), 'sourceExtension': config.get('sourceExtension'), 'browserMode': browser_mode(config), 'expectedAccountId': config.get('expectedAccountId')})


def reusable(result, stamp):
    return bool(result and result.get('stamp') == stamp and result.get('status') == 'passed')


def archive_interrupted(unit):
    previous = read(unit / 'result.json')
    if previous and previous.get('status') == 'running':
        attempt = Path(previous['attempt']).resolve()
        if attempt.parent != unit.resolve():
            raise ValueError('Invalid previous attempt ownership')
        previous = {**previous, 'status': 'interrupted', 'finishedAt': utc(), 'reason': 'Previous runner ended before persisting a terminal result'}
        atomic(attempt / 'result.json', previous)
        atomic(unit / 'result.json', previous)


def selected_feature_ids(config, features):
    """Use the same exact selection for execution and selected-run completion."""
    known = [feature['id'] for feature in features]
    requested = config.get('features')
    if requested is None:
        return known
    if (not isinstance(requested, list) or not requested
            or any(not isinstance(value, str) or not value for value in requested)
            or len(set(requested)) != len(requested)):
        raise ValueError('Requested features must be a nonempty list of unique exact feature IDs')
    if set(requested) - set(known):
        raise ValueError('Unknown requested feature')
    return [value for value in known if value in requested]


def summarize(config, features, directory, instrument, blocker=None):
    selected = selected_feature_ids(config, features)
    rows = []
    for feature in features:
        result = read(directory / feature['id'] / 'result.json')
        stamp = result_stamp(config, feature, instrument)
        status = 'not_implemented' if feature['status'] == 'planned' else 'not_run' if not result else result['status'] if result.get('stamp') == stamp else 'stale'
        rows.append({'id': feature['id'], 'status': status, 'acceptance': feature['acceptance'], 'result': str(directory / feature['id'] / 'result.json') if result else None})
    summary = {'time': utc(), 'runId': config['runId'], 'uiVersion': config['uiVersion'], 'forgeVersion': config['forgeVersion'],
               'instrumentHash': instrument, 'browserMode': browser_mode(config), 'complete': not blocker and bool(rows) and all(r['status'] == 'passed' for r in rows), 'blocker': blocker, 'features': rows,
               'selectedRun': {'featureIds': selected, 'complete': not blocker and bool(selected) and all(r['status'] == 'passed' for r in rows if r['id'] in selected)}}
    atomic(directory / 'summary.json', summary)
    (directory / 'summary.md').write_text('# LZ campaign ' + config['runId'] + '\n\n' + 'Selected run: ' + ('COMPLETE' if summary['selectedRun']['complete'] else 'INCOMPLETE') + '\n\nWhole manifest: ' + ('COMPLETE' if summary['complete'] else 'INCOMPLETE') + '\n\n' + '\n'.join('- ' + r['id'] + ': ' + r['status'] for r in rows) + '\n')
    return summary


def run(config, directory):
    global STOP_NOW
    browser_environment(config, {})  # Validate before any subprocess or lane acquisition.
    signal.signal(signal.SIGTERM, lambda *_: globals().__setitem__('STOP_NOW', True))
    signal.signal(signal.SIGINT, lambda *_: globals().__setitem__('STOP_NOW', True))
    manifest = read(Path(config['manifest']))
    features = validate_manifest(manifest)
    selected = set(selected_feature_ids(config, features))
    instrument = instrument_hash()
    lock = ROOT / '.lz-campaign-browser.lock'
    state_path = directory / 'state.json'
    try:
        owner = lock_acquire(lock)
    except Exception as exc:
        atomic(state_path, {'status': 'blocked_resource', 'error': str(exc), 'time': utc()})
        return 2
    start = time.monotonic()
    measured = []
    stop_reason = None
    try:
        # Even an all-reused resume must prove today's UI/source identity.
        entry = directory / ('entry-' + str(time.time_ns()))
        entry.mkdir(parents=True)
        entry_result = run_phase(config, {'timeoutSeconds': 240}, 'before', entry, lambda pid: atomic(state_path, {**owner, 'status': 'entry_guard', 'childPid': pid, 'time': utc()}))
        atomic(entry / 'result.json', entry_result)
        if entry_result['status'] != 'passed':
            atomic(state_path, {**owner, 'status': 'identity_failed', 'time': utc(), 'entry': str(entry)})
            summarize(config, features, directory, instrument, blocker='entry_identity_failed')
            return 2
        config['sourceFingerprint'] = read(entry / 'before-identity.json')['sourceFingerprint']
        atomic(directory / 'config.json', config)
        for index, feature in enumerate(features):
            if feature['id'] not in selected:
                continue
            if STOP_NOW or (directory / 'STOP').exists() or time.monotonic() - start > config['maxMinutes'] * 60:
                stop_reason = 'stopped' if STOP_NOW or (directory / 'STOP').exists() else 'budget_exhausted'
                break
            if instrument_hash() != instrument:
                stop_reason = 'instrument_changed'; break
            unit = directory / feature['id']
            stamp = result_stamp(config, feature, instrument)
            if reusable(read(unit / 'result.json'), stamp):
                print(utc(), 'REUSE', feature['id'], flush=True); continue
            if feature['status'] == 'planned':
                atomic(unit / 'result.json', {'status': 'not_implemented', 'stamp': stamp, 'time': utc(), 'acceptance': feature['acceptance']})
                summarize(config, features, directory, instrument); continue
            archive_interrupted(unit)
            attempt = unit / ('attempt-' + str(len(list(unit.glob('attempt-*'))) + 1).zfill(3))
            attempt.mkdir(parents=True)
            started = utc()
            elapsed_start = time.monotonic()
            estimate = sum(measured) / len(measured) if measured else None
            next_time = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=estimate)).isoformat() if estimate else 'unknown until first measured feature'
            remaining = sum(1 for f in features[index:] if f['id'] in selected and f['status'] == 'ready')
            sweep_time = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=estimate * remaining)).isoformat() if estimate else 'unknown until first measured feature'
            print(utc(), 'NOW', feature['id'], 'NEXT estimated', next_time, 'SWEEP estimated', sweep_time, flush=True)
            result = {'status': 'running', 'stamp': stamp, 'startedAt': started, 'attempt': str(attempt), 'uiVersion': config['uiVersion'],
                      'forgeVersion': config['forgeVersion'], 'appCommit': config['appCommit'], 'instrumentHash': instrument, 'browserMode': browser_mode(config), 'phases': {}}
            atomic(unit / 'result.json', result)
            try:
                def heartbeat(child_pid):
                    atomic(state_path, {**owner, 'status': 'running', 'feature': feature['id'], 'childPid': child_pid, 'time': utc()})
                    print(utc(), 'ACTIVE', feature['id'], 'child', child_pid, flush=True)
                before = run_phase(config, feature, 'before', attempt, heartbeat)
                if before['status'] == 'passed':
                    before = require_entry_source(before, read(attempt / 'before-identity.json') or {}, config['sourceFingerprint'])
                result['phases']['before'] = before
                if before['status'] != 'passed':
                    result['status'] = 'identity_failed'
                else:
                    result['phases']['tests'] = run_phase(config, feature, 'tests', attempt, heartbeat)
                    # Even failed/interrupted feature tests get a cleanup audit while
                    # the process can still run. An immediate stop leaves no fake pass.
                    if not STOP_NOW:
                        result['phases']['after'] = run_phase(config, feature, 'after', attempt, heartbeat)
                    result['status'] = result['phases']['tests']['status']
                    if result['phases'].get('after', {}).get('status') != 'passed':
                        result['status'] = 'integrity_failed' if not STOP_NOW else 'interrupted'
            except (Exception, SystemExit) as exc:
                result['status'] = 'failed'; result['error'] = str(exc)
            result['finishedAt'] = utc(); result['elapsedSeconds'] = time.monotonic() - elapsed_start
            measured.append(result['elapsedSeconds'])
            atomic(attempt / 'result.json', result); atomic(unit / 'result.json', result)
            summarize(config, features, directory, instrument)
            print(utc(), 'RESULT', feature['id'], result['status'], flush=True)
            if result['status'] in ['identity_failed', 'integrity_failed']:
                # A source/version mismatch can invalidate or contaminate everything
                # after it. Stop the lane; retain all evidence and resume explicitly.
                stop_reason = result['status']
                break
        summary = summarize(config, features, directory, instrument_hash(), blocker=stop_reason)
        atomic(state_path, {**owner, 'status': stop_reason or ('complete' if summary['selectedRun']['complete'] else 'incomplete'), 'time': utc()})
        return 0 if summary['selectedRun']['complete'] else 2
    except (Exception, SystemExit) as exc:
        atomic(state_path, {**owner, 'status': 'runner_failed', 'error': str(exc), 'time': utc()})
        summarize(config, features, directory, instrument_hash(), blocker='runner_failed')
        return 2
    finally:
        current = read(lock / 'owner.json')
        if current and current.get('pid') == os.getpid():
            (lock / 'owner.json').unlink(missing_ok=True); lock.rmdir()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('verb', choices=['plan', 'start', 'resume', 'run', 'status', 'results', 'stop'])
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--manifest', default=str(DEFAULT_MANIFEST))
    parser.add_argument('--ui-version'); parser.add_argument('--forge-version'); parser.add_argument('--app-commit')
    parser.add_argument('--source-extension', help='JSON evidence of an explicitly coordinated foreign issue set; persisted with the run')
    parser.add_argument('--browser-mode', choices=BROWSER_MODES)
    parser.add_argument('--expected-account-id', help='Portable mode: independently known principal, persisted for resume')
    parser.add_argument('--features', help='comma-separated exact feature IDs')
    parser.add_argument('--max-minutes', type=int, default=240)
    parser.add_argument('--now', action='store_true', help='stop: interrupt current subprocess group; cleanup may require follow-up')
    args = parser.parse_args()
    if args.max_minutes < 1:
        parser.error('--max-minutes must be positive')
    if not args.run_id or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in args.run_id):
        parser.error('run-id must be a simple directory identifier')
    directory = ROOT / 'evidence/lz-campaign' / args.run_id
    config_path = directory / 'config.json'
    if args.verb in ['status', 'results', 'stop']:
        state = read(directory / 'state.json', {})
        if args.verb == 'stop':
            directory.mkdir(parents=True, exist_ok=True); (directory / 'STOP').write_text(utc())
            if args.now and is_owner_alive(state):
                os.kill(state['pid'], signal.SIGTERM)
            print('Stop requested; ' + ('current unit interrupted' if args.now else 'current unit finishes first'))
        else:
            summary = read(directory / 'summary.json')
            stale = bool(summary and summary.get('instrumentHash') != instrument_hash())
            if stale:
                summary = {**summary, 'complete': False, 'blocker': 'instrument_changed_since_summary',
                           **({'selectedRun': {**summary['selectedRun'], 'complete': False}} if 'selectedRun' in summary else {})}
            print(json.dumps({'running': is_owner_alive(state), 'instrumentChanged': stale, 'state': state, 'summary': summary}, indent=2))
        return 0
    manifest = read(Path(args.manifest).resolve())
    features = validate_manifest(manifest)
    if args.verb == 'plan':
        print(json.dumps({'features': features, 'instrumentHash': instrument_hash(), 'liveTestsExecuted': False}, indent=2)); return 0
    config = read(config_path, {})
    try:
        binding = browser_binding(args.browser_mode, args.expected_account_id, config, args.verb)
    except ValueError as exc:
        parser.error(str(exc))
    if args.verb != 'run':
        for name in ['ui_version', 'forge_version', 'app_commit']:
            if not getattr(args, name):
                parser.error('--' + name.replace('_', '-') + ' is required; do not infer a deployment from local source')
        config = {**binding, 'runId': args.run_id, 'manifest': str(Path(args.manifest).resolve()), 'identitySpec': manifest['identitySpec'],
                  'uiVersion': args.ui_version, 'forgeVersion': args.forge_version, 'appCommit': args.app_commit,
                  'sourceExtension': read(Path(args.source_extension).resolve()) if args.source_extension else None,
                  'features': args.features.split(',') if args.features is not None else None, 'maxMinutes': args.max_minutes}
        try:
            selected_feature_ids(config, features)
        except ValueError as exc:
            parser.error(str(exc))
        directory.mkdir(parents=True, exist_ok=True)
        state = read(directory / 'state.json')
        if is_owner_alive(state):
            parser.error('This campaign already has a live runner')
        atomic(config_path, config); (directory / 'STOP').unlink(missing_ok=True)
        log = (directory / 'runner.log').open('a')
        child = subprocess.Popen([sys.executable, '-u', str(Path(__file__)), 'run', '--run-id', args.run_id, '--manifest', config['manifest']],
                                 cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        time.sleep(0.15)
        current_state = read(directory / 'state.json', {})
        if current_state.get('pid') != child.pid:
            atomic(directory / 'state.json', {'pid': child.pid, 'processStart': process_start(child.pid), 'status': 'starting', 'time': utc()})
        print(json.dumps({'pid': child.pid, 'log': str(directory / 'runner.log'), 'statusCommand': f'python3 scripts/lz-campaign.py status --run-id {args.run_id}'}))
        return 0
    if not config:
        parser.error('No persisted config for run')
    return run(config, directory)

if __name__ == '__main__':
    sys.exit(main())

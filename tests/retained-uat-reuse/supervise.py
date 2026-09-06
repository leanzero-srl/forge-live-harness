#!/usr/bin/env python3
"""Exactly one reviewed full UAT on the exact retained fixture, using the existing campaign process controls.

Preparation is inert. An authorized, byte-bound command receipt is required.
No process retry, source update, cleanup fallback or additional scenario exists here.
"""
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys

HARNESS = Path('/Users/mihaiperdum/Projects/forge-live-harness')
APP = Path('/Users/mihaiperdum/Projects/lz-ppm-forge')
RUN_ID = 'retained-uat-reuse-20260906'
DIRECTORY = HARNESS / 'evidence/lz-campaign' / RUN_ID
NODE = '/Users/mihaiperdum/.nvm/versions/node/v22.22.0/bin/node'
SPEC = 'scenarios/lz-ppm/journey-campaign-retained-uat.spec.ts'
ACCOUNT = '712020:937bc860-eec2-4294-a65d-8e0fe7c45086'
APP_SOURCE = 'f4d87d058ed78946bc89817dbf5f2d24b97d1536'
SETTINGS = {'success': True, 'version': 68, 'settings': {'selectedPlanIds': [], 'profiles': {}, 'issueChoices': {}}}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def load_campaign():
    spec = importlib.util.spec_from_file_location('retained_campaign', HARNESS / 'scripts/lz-campaign.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def expected_command():
    return [NODE, 'node_modules/@playwright/test/cli.js', 'test', SPEC, '--project=chromium', '--workers=1', '--retries=0', '--reporter=line,json', '--output=' + str(DIRECTORY / 'artifacts')]

def environment(receipt):
    result = dict(os.environ)
    for key in list(result):
        if key.startswith(('LZ_CAMPAIGN_', 'LZ_RETAINED_UAT_')) or key in ['LZ_RETAINED_UAT_LEDGER', 'LZ_PRIVATE_RETAINED_PHASE', 'LZ_PRIVATE_DELETED_PHASE', 'LZ_PRIVATE_RETAINED_JOURNAL', 'LZ_PRIVATE_RETAINED_TERMINAL', 'LZ_PRIVATE_DELETED_JOURNAL', 'LZ_PRIVATE_DELETED_TERMINAL']:
            result.pop(key)
    result.update(receipt['environment'])
    result['PATH'] = str(Path(NODE).parent) + os.pathsep + os.environ.get('PATH', '')
    return result

def admit(receipt, campaign):
    assert receipt['status'] == 'authorized', 'Dispatch is not authorized'
    assert receipt['runId'] == RUN_ID
    assert receipt['command'] == expected_command()
    assert receipt['timeoutSeconds'] == 2400
    assert receipt['appSourceCommit'] == APP_SOURCE
    assert receipt['forgeVersion'] == '6.26.0' and receipt['uiVersion'] == '4.58.588'
    assert receipt['expectedAccountId'] == ACCOUNT
    assert re.fullmatch(r'[0-9a-f]{40}', receipt['rootDispatchCommit'])
    assert re.fullmatch(r'[0-9a-f]{40}', receipt['harnessSourceCommit'])
    assert receipt['instrumentHash'] == campaign.instrument_hash()
    assert receipt['supervisorSha256'] == sha(Path(__file__).read_bytes())
    assert Path(NODE).is_file()
    expected_env = {
        'HEADLESS': '1', 'HARNESS_VIDEO': '0',
        'LZ_HARNESS_BROWSER_MODE': 'portable-chrome152',
        'LZ_EXPECTED_ACCOUNT_ID': ACCOUNT, 'LZ_EXPECTED_UI_VERSION': '4.58.588',
        'LZ_RETAINED_UAT_REUSE_PHASE': 'reuse-owned',
        'LZ_RETAINED_UAT_PRIOR_JOURNAL': str(HARNESS / 'scratch/lz-retained-uat-20260906/ownership.json'),
        'LZ_RETAINED_UAT_PRIOR_TERMINAL': str(HARNESS / 'evidence/lz-campaign/retained-uat-acceptance-20260906/terminal-receipt.json'),
        'PLAYWRIGHT_JSON_OUTPUT_NAME': str(DIRECTORY / 'report.json'),
    }
    assert receipt['environment'] == expected_env
    assert set(receipt['sourceHashes']) == {SPEC, 'scenarios/lz-ppm/retained-uat-fixture.ts', 'scenarios/lz-ppm/retained-uat-reuse.mjs', 'scenarios/lz-ppm/report-departure.ts', 'scenarios/lz-ppm/campaign-ui.ts', 'scenarios/lz-ppm/settled-screenshot.mjs', 'scripts/lz-campaign.py'}
    assert receipt['inputHashes'] == {'LZ_RETAINED_UAT_PRIOR_JOURNAL': '088895c999101331b39830bacc147470035faa02d52176f21f08a6fa247e6896', 'LZ_RETAINED_UAT_PRIOR_TERMINAL': '83d48866f87c7fd88be29ac9ae86966f9a72f97d26533b34e8561c82c4b03a6a'}
    for name, digest in receipt['inputHashes'].items():
        assert sha(Path(expected_env[name]).read_bytes()) == digest
    assert not (HARNESS / 'scratch/lz-retained-uat-reuse-20260906/ownership.json').exists()
    for name, digest in receipt['sourceHashes'].items():
        assert sha((HARNESS / name).read_bytes()) == digest, name
    subprocess.run(['git', 'merge-base', '--is-ancestor', receipt['harnessSourceCommit'], 'HEAD'], cwd=HARNESS, check=True, capture_output=True)
    subprocess.run(['git', 'cat-file', '-e', receipt['rootDispatchCommit'] + '^{commit}'], cwd=APP, check=True, capture_output=True)
    subprocess.run(['git', 'diff', '--quiet', APP_SOURCE, '--', 'src', 'static/ppm-ui/src', 'manifest.yml', 'package.json', 'package-lock.json', 'static/ppm-ui/package.json'], cwd=APP, check=True, capture_output=True)

def execute(receipt, campaign, directory, lock_path, command_sha, actual_head):
    """The only lifecycle: acquire shared lock, consume marker, bounded child, release own lock."""
    once = directory / 'ONCE.json'
    if once.exists():
        raise RuntimeError('This invocation was already consumed; no retry')
    owner = campaign.lock_acquire(lock_path, wait_seconds=0)
    consumed = False
    latest = {'status': 'starting', 'supervisorPid': os.getpid(), 'supervisorStart': campaign.process_start(os.getpid()), 'startedAt': campaign.utc(), 'actualHarnessCommit': actual_head, 'instrumentHash': receipt['instrumentHash'], 'rootDispatchCommit': receipt['rootDispatchCommit'], 'commandSha256': command_sha, 'childPid': None}
    try:
        # Exclusive creation is deliberately permanent, including timeout/unknown result.
        with once.open('x') as output:
            json.dump({'supervisorPid': os.getpid(), 'startedAt': latest['startedAt'], 'commandSha256': command_sha}, output)
        consumed = True
        campaign.atomic(directory / 'process.json', latest)
        def heartbeat(pid):
            latest.update({'status': 'running', 'childPid': pid, 'childStart': campaign.process_start(pid), 'heartbeatAt': campaign.utc()})
            campaign.atomic(directory / 'process.json', latest)
        process = campaign.run_child(receipt['command'], environment(receipt), directory / 'run.log', 2400, heartbeat)
        latest.update({'status': 'terminal', 'finishedAt': campaign.utc(), 'processResult': process})
        report = campaign.read(directory / 'report.json')
        if process.get('timedOut') or process.get('interrupted'):
            result = {'status': 'timed_out' if process.get('timedOut') else 'interrupted', 'process': process}
        elif report is None:
            result = {'status': 'failed', 'reason': 'No test report', 'process': process}
        else:
            result = {**campaign.classify_report(report, {'specs': [SPEC], 'minTests': 1}, process['exit']), 'process': process}
        latest['testResult'] = result
        campaign.atomic(directory / 'process.json', latest)
        return 0 if result['status'] == 'passed' else 1
    except BaseException as error:
        if consumed:
            detail = str(error)
            latest.update({'status': 'terminal', 'finishedAt': campaign.utc(), 'supervisorFailure': {'detailSha256': sha(detail.encode()), 'detailBytes': len(detail.encode())}, 'testResult': {'status': 'failed'}})
            campaign.atomic(directory / 'process.json', latest)
        raise
    finally:
        if campaign.read(lock_path / 'owner.json') == owner:
            (lock_path / 'owner.json').unlink(missing_ok=True)
            lock_path.rmdir()

def main():
    campaign = load_campaign()
    def stop(_signum, _frame):
        campaign.STOP_NOW = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    if (DIRECTORY / 'ONCE.json').exists():
        raise RuntimeError('This invocation was already consumed; no retry')
    command_bytes = (DIRECTORY / 'command.json').read_bytes()
    receipt = json.loads(command_bytes)
    admit(receipt, campaign)
    actual_head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=HARNESS, text=True).strip()
    return execute(receipt, campaign, DIRECTORY, HARNESS / '.lz-campaign-browser.lock', sha(command_bytes), actual_head)

if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        # Credentials and arbitrary exception text never enter the launch log.
        detail = str(error)
        print(json.dumps({'supervisorRefused': True, 'detailSha256': sha(detail.encode()), 'detailBytes': len(detail.encode())}), file=sys.stderr)
        sys.exit(1)

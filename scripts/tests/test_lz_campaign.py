import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / 'lz-campaign.py'
spec = importlib.util.spec_from_file_location('lz_campaign', MODULE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
FILE = 'scenarios/lz-ppm/example.spec.ts'
FEATURE = {'id': 'x', 'specs': [FILE], 'minTests': 1, 'acceptance': ['X-1']}


def report(expected='passed', actual='passed', status='expected', title='real assertion'):
    return {'suites': [{'specs': [{'file': FILE, 'title': title, 'tests': [{'expectedStatus': expected, 'status': status, 'results': [{'status': actual}]}]}]}]}


class CampaignControls(unittest.TestCase):
    def test_retention_requires_the_exact_uat_unit(self):
        exact = {'id': 'retained-uat-live', 'status': 'ready', 'acceptance': ['UAT-1'], 'specs': ['scenarios/lz-ppm/journey-campaign-retained-uat.spec.ts'], 'minTests': 1, 'retainedUat': True}
        self.assertEqual(m.validate_manifest({'features': [exact]}), [exact])
        for changed in [{'id': 'other'}, {'retainedUat': False}, {'retainedUat': 'true'}, {'specs': ['scenarios/lz-ppm/campaign-identity.spec.ts']}]:
            with self.assertRaises(ValueError):
                m.validate_manifest({'features': [{**exact, **changed}]})

    def test_retention_env_is_attempt_bound_and_scrubbed_for_other_phases(self):
        config = {'uiVersion': '4.58.578', 'runId': 'isolated-control', 'identitySpec': 'scenarios/lz-ppm/campaign-identity.spec.ts'}
        with tempfile.TemporaryDirectory() as d:
            attempt = Path(d)
            for retained in [False, True]:
                for phase in ['before', 'tests', 'after']:
                    seen = []
                    def child(command, env, *args):
                        seen.append(dict(env)); return {'exit': 0}
                    feature = {**FEATURE, **({'retainedUat': True} if retained else {})}
                    with patch.dict(os.environ, {'LZ_RETAINED_UAT_LEDGER': '/tmp/foreign-ledger.json'}), patch.object(m, 'wait_profile_free'), patch.object(m, 'run_child', side_effect=child):
                        m.run_phase(config, feature, phase, attempt, lambda _: None)
                    expected = str(attempt / 'retained-uat-ledger.json') if retained and phase in ['tests', 'after'] else None
                    self.assertEqual(seen[0].get('LZ_RETAINED_UAT_LEDGER'), expected)

    def test_population_reader_change_invalidates_instrument(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            files = ['scripts/lz-campaign.py', 'playwright.config.ts', 'package-lock.json', 'scripts/lz-campaign-assets-fixture.mjs', 'scripts/lz-ppm-population-audit.mjs']
            for name in files:
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('original')
            with patch.object(m, 'ROOT', root), patch.object(m, '__file__', str(root / 'scripts/lz-campaign.py')):
                before = m.instrument_hash()
                (root / 'scripts/lz-ppm-population-audit.mjs').write_text('changed pagination logic')
                self.assertNotEqual(before, m.instrument_hash())

    def test_profile_holder_change_invalidates_instrument(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            files = ['scripts/lz-campaign.py', 'playwright.config.ts', 'package-lock.json', 'scripts/lz-campaign-assets-fixture.mjs', 'scripts/lz-ppm-population-audit.mjs', 'forge/profile-holder.py']
            for name in files:
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('original')
            with patch.object(m, 'ROOT', root), patch.object(m, '__file__', str(root / 'scripts/lz-campaign.py')):
                before = m.instrument_hash()
                (root / 'forge/profile-holder.py').write_text('changed reservation behavior')
                self.assertNotEqual(before, m.instrument_hash())

    def test_source_cannot_change_between_feature_units(self):
        passed = {'status': 'passed', 'ordinaryPasses': ['identity']}
        self.assertEqual(m.require_entry_source(passed, {'sourceFingerprint':'A'}, 'A')['status'], 'passed')
        self.assertEqual(m.require_entry_source(passed, {'sourceFingerprint':'B'}, 'A')['status'], 'failed')
        self.assertEqual(m.require_entry_source(passed, {}, 'A')['status'], 'failed')
        self.assertEqual(m.require_entry_source({'status':'failed'}, {'sourceFingerprint':'A'}, 'A')['status'], 'failed')

    def test_positive_control(self):
        self.assertEqual(m.classify_report(report(), FEATURE, 0)['status'], 'passed')

    def test_empty_cannot_pass_even_with_green_stats(self):
        self.assertEqual(m.classify_report({'stats': {'expected': 99}, 'suites': []}, FEATURE, 0)['status'], 'failed')

    def test_all_skipped_cannot_pass(self):
        self.assertEqual(m.classify_report(report(actual='skipped', status='skipped'), FEATURE, 0)['status'], 'failed')

    def test_no_results_cannot_pass(self):
        r = report(); r['suites'][0]['specs'][0]['tests'][0]['results'] = []
        self.assertEqual(m.classify_report(r, FEATURE, 0)['status'], 'failed')

    def test_expected_failure_requires_exact_allowlist(self):
        r = report(expected='failed', actual='failed')
        self.assertEqual(m.classify_report(r, FEATURE, 0)['status'], 'failed')
        f = {**FEATURE, 'allowedExpectedFailures': ['real assertion']}
        result = m.classify_report(r, f, 0)
        self.assertEqual(result['status'], 'known_defect')
        self.assertEqual(result['ordinaryPasses'], [])

    def test_setup_failure_is_not_a_witness(self):
        r = report(actual='failed', status='unexpected')
        f = {**FEATURE, 'allowedExpectedFailures': ['real assertion']}
        self.assertEqual(m.classify_report(r, f, 1)['status'], 'failed')

    def test_unexpected_pass_requires_witness_review(self):
        f = {**FEATURE, 'allowedExpectedFailures': ['real assertion']}
        self.assertEqual(m.classify_report(report(expected='failed', status='unexpected'), f, 1)['status'], 'failed')

    def test_flaky_is_not_a_clean_pass(self):
        self.assertEqual(m.classify_report(report(status='flaky'), FEATURE, 0)['status'], 'failed')

    def test_each_spec_must_execute(self):
        f = {**FEATURE, 'specs': [FILE, 'scenarios/lz-ppm/missing.spec.ts']}
        self.assertIn('configured spec did not execute', ' '.join(m.classify_report(report(), f, 0)['reasons']))

    def test_minimum_and_exit_are_enforced(self):
        self.assertEqual(m.classify_report(report(), {**FEATURE, 'minTests': 2}, 0)['status'], 'failed')
        self.assertEqual(m.classify_report(report(), FEATURE, 1)['status'], 'failed')

    def test_resume_rejects_version_instrument_and_source_changes(self):
        c = {'uiVersion': '1.2.3', 'forgeVersion': '4.5.0', 'appCommit': 'abc', 'sourceFingerprint': 'source1'}
        stamp = m.result_stamp(c, FEATURE, 'instrument1')
        old = {'status': 'passed', 'stamp': stamp}
        self.assertTrue(m.reusable(old, stamp))
        for changed, instrument in [({**c, 'uiVersion': '1.2.4'}, 'instrument1'), ({**c, 'sourceFingerprint': 'source2'}, 'instrument1'), (c, 'instrument2')]:
            self.assertFalse(m.reusable(old, m.result_stamp(changed, FEATURE, instrument)))
        self.assertFalse(m.reusable({'status': 'known_defect', 'stamp': stamp}, stamp))

    def test_planned_feature_keeps_campaign_incomplete(self):
        with tempfile.TemporaryDirectory() as d:
            c = {'runId': 'test', 'uiVersion': '1', 'forgeVersion': '1', 'appCommit': 'a'}
            summary = m.summarize(c, [{**FEATURE, 'status': 'planned'}], Path(d), 'i')
            self.assertFalse(summary['complete']); self.assertEqual(summary['features'][0]['status'], 'not_implemented')

    def test_entry_failure_cannot_reuse_old_complete_summary(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); c = {'runId': 'test', 'uiVersion': '1', 'forgeVersion': '1', 'appCommit': 'a'}
            f = {**FEATURE, 'status': 'ready'}
            m.atomic(root / 'x/result.json', {'status': 'passed', 'stamp': m.result_stamp(c, f, 'i')})
            self.assertFalse(m.summarize(c, [f], root, 'i', blocker='entry_identity_failed')['complete'])

    def test_interrupted_attempt_survives_resume(self):
        with tempfile.TemporaryDirectory() as d:
            unit = Path(d); attempt = unit / 'attempt-001'; attempt.mkdir()
            m.atomic(unit / 'result.json', {'status': 'running', 'attempt': str(attempt)})
            m.archive_interrupted(unit)
            self.assertEqual(m.read(attempt / 'result.json')['status'], 'interrupted')

    def test_child_output_and_failure_persist(self):
        with tempfile.TemporaryDirectory() as d:
            log = Path(d) / 'child.log'
            result = m.run_child([sys.executable, '-u', '-c', 'print("controlled failure"); raise SystemExit(3)'], os.environ.copy(), log, 5)
            self.assertEqual(result['exit'], 3); self.assertIn('controlled failure', log.read_text())

    def test_timeout_kills_child_process_group(self):
        with tempfile.TemporaryDirectory() as d:
            log = Path(d) / 'child.log'
            code = 'import subprocess,sys,time; p=subprocess.Popen([sys.executable,"-c","import time; time.sleep(60)"]); print(p.pid,flush=True); time.sleep(60)'
            result = m.run_child([sys.executable, '-u', '-c', code], os.environ.copy(), log, 0.5)
            self.assertTrue(result['timedOut'])
            pid = int(log.read_text().strip())
            proc = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='], text=True, capture_output=True)
            self.assertTrue(not proc.stdout.strip() or proc.stdout.strip().startswith('Z'), proc.stdout)

    def test_exited_leader_cannot_leave_background_child(self):
        with tempfile.TemporaryDirectory() as d:
            log = Path(d) / 'child.log'
            code = 'import subprocess,sys; p=subprocess.Popen([sys.executable,"-c","import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(60)"]); print(p.pid,flush=True)'
            result = m.run_child([sys.executable, '-u', '-c', code], os.environ.copy(), log, 5)
            self.assertEqual(result['exit'], 0)
            pid = int(log.read_text().strip())
            import time
            time.sleep(0.1)
            proc = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='], text=True, capture_output=True)
            self.assertTrue(not proc.stdout.strip() or proc.stdout.strip().startswith('Z'), proc.stdout)

    def test_ready_without_tests_is_rejected(self):
        with self.assertRaises(ValueError):
            m.validate_manifest({'features': [{'id': 'x', 'status': 'ready', 'acceptance': ['X'], 'specs': [], 'minTests': 0}]})


if __name__ == '__main__':
    unittest.main()

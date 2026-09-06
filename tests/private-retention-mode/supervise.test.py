import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('supervisor', HERE / 'supervise.py')
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)

class FakeCampaign:
    def __init__(self, result=None, fail=False):
        self.result = result or {'exit': 0}
        self.fail = fail
        self.calls = []
    def utc(self): return '2026-09-06T00:00:00Z'
    def process_start(self, pid): return 'exact process start'
    def atomic(self, path, value): path.write_text(json.dumps(value))
    def read(self, path): return json.loads(path.read_text()) if path.exists() else None
    def lock_acquire(self, path, wait_seconds):
        self.calls.append(('lock', wait_seconds)); path.mkdir(); owner = {'pid': 42, 'processStart': 'test'}; self.atomic(path / 'owner.json', owner); return owner
    def run_child(self, command, env, log_path, seconds, heartbeat):
        self.calls.append(('child', seconds, command)); heartbeat(123)
        if self.fail: raise RuntimeError('unprintable opaque credential failure')
        self.atomic(log_path.parent / 'report.json', {'fixture': True}); return self.result
    def classify_report(self, report, gate, exit_code):
        self.calls.append(('grade', gate, exit_code)); return {'status': 'passed' if exit_code == 0 else 'failed'}

class SupervisorTests(unittest.TestCase):
    def receipt(self):
        return {'command': supervisor.expected_command(), 'environment': {}, 'instrumentHash': 'i', 'rootDispatchCommit': 'r'}
    def test_prepared_missing_dispatch_is_inert(self):
        with self.assertRaises(AssertionError): supervisor.admit({'status': 'prepared'}, object())
    def test_changed_command_cannot_reach_process_admission(self):
        with self.assertRaises(AssertionError): supervisor.admit({'status':'authorized','runId':supervisor.RUN_ID,'command':['unexpected']}, object())
    def test_success_bound_child_marker_and_no_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);campaign=FakeCampaign();self.assertEqual(supervisor.execute(self.receipt(),campaign,root,root/'lock','hash','head'),0)
            state=json.loads((root/'process.json').read_text());self.assertEqual(state['status'],'terminal');self.assertEqual(state['childPid'],123);self.assertEqual(state['testResult']['status'],'passed');self.assertEqual(campaign.calls[0],('lock',0));self.assertEqual(campaign.calls[1][0:2],('child',900));self.assertFalse((root/'lock').exists());before=(root/'process.json').read_bytes();n=len(campaign.calls)
            with self.assertRaises(RuntimeError): supervisor.execute(self.receipt(),campaign,root,root/'lock','hash','head')
            self.assertEqual(len(campaign.calls),n);self.assertEqual((root/'process.json').read_bytes(),before)
    def test_timeout_and_interruption_never_grade_success_or_replay(self):
        for flags in [{'timedOut':True},{'interrupted':True}]:
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);campaign=FakeCampaign({'exit':-15,**flags});self.assertEqual(supervisor.execute(self.receipt(),campaign,root,root/'lock','hash','head'),1);self.assertTrue((root/'ONCE.json').exists());self.assertFalse(any(x[0]=='grade' for x in campaign.calls));self.assertFalse((root/'lock').exists())
    def test_unknown_process_failure_preserves_marker_and_redacts_detail(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);campaign=FakeCampaign(fail=True)
            with self.assertRaises(RuntimeError): supervisor.execute(self.receipt(),campaign,root,root/'lock','hash','head')
            raw=(root/'process.json').read_text();self.assertNotIn('opaque credential',raw);self.assertEqual(json.loads(raw)['testResult']['status'],'failed');self.assertTrue((root/'ONCE.json').exists());self.assertFalse((root/'lock').exists())
    def test_lock_replacement_is_not_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);campaign=FakeCampaign();original=campaign.run_child
            def replaced(*args):
                result=original(*args);campaign.atomic(root/'lock/owner.json',{'pid':900,'processStart':'new owner'});return result
            campaign.run_child=replaced;supervisor.execute(self.receipt(),campaign,root,root/'lock','hash','head');self.assertEqual(campaign.read(root/'lock/owner.json')['pid'],900)
    def test_actual_existing_runner_enforces_900s_and_cleans_its_own_group(self):
        campaign=supervisor.load_campaign();clock=[0.0];killed=[]
        child=types.SimpleNamespace(pid=7,returncode=-15,poll=lambda:None)
        with tempfile.TemporaryDirectory() as tmp,patch.object(campaign.subprocess,'Popen',return_value=child),patch.object(campaign.time,'monotonic',side_effect=lambda:clock[0]),patch.object(campaign.time,'sleep',side_effect=lambda n:clock.__setitem__(0,clock[0]+n)),patch.object(campaign,'kill_group',side_effect=lambda c:killed.append(c.pid)):
            result=campaign.run_child(['never spawned'],{},Path(tmp)/'run.log',900)
        self.assertEqual(result,{'exit':-15,'timedOut':True});self.assertEqual(clock[0],900);self.assertEqual(killed,[7,7])
    def test_actual_existing_runner_stop_now_refuses_success_and_cleans(self):
        campaign=supervisor.load_campaign();campaign.STOP_NOW=True;killed=[];child=types.SimpleNamespace(pid=8,returncode=-15,poll=lambda:None)
        with tempfile.TemporaryDirectory() as tmp,patch.object(campaign.subprocess,'Popen',return_value=child),patch.object(campaign,'kill_group',side_effect=lambda c:killed.append(c.pid)):
            result=campaign.run_child(['never spawned'],{},Path(tmp)/'run.log',900)
        self.assertEqual(result,{'exit':-15,'interrupted':True});self.assertEqual(killed,[8,8])

if __name__=='__main__': unittest.main(verbosity=2)

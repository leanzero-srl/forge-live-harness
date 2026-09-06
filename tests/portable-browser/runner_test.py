import importlib.util
from pathlib import Path
import tempfile
import unittest
spec = importlib.util.spec_from_file_location('proposal', Path(__file__).resolve().parents[2] / 'scripts/lz-campaign.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class Binding(unittest.TestCase):
    def test_default_missing_unknown_modes(self):
        self.assertEqual(m.browser_binding(None,None,{},'start')['browserMode'],'persistent-chrome')
        for config in [{'browserMode':'portable-cft151'},{'browserMode':None},{'browserMode':'unknown'},{'browserMode':''}]:
            with self.assertRaises(ValueError): m.browser_environment(config,{})
    def test_portable_requires_known_identity(self):
        for account in [None,'',' ']:
            with self.assertRaises(ValueError): m.browser_binding('portable-chrome152',account,{},'start')
    def test_resume_preserves_and_rejects_mismatch(self):
        prior={'browserMode':'portable-chrome152','expectedAccountId':'known'}
        self.assertEqual(m.browser_binding(None,None,prior,'resume'),prior)
        with self.assertRaises(ValueError): m.browser_binding('persistent-chrome',None,prior,'resume')
        with self.assertRaises(ValueError): m.browser_binding(None,'foreign',prior,'resume')
        with self.assertRaises(ValueError): m.browser_binding(None,None,{},'resume')
    def test_inherited_mode_and_identity_never_win(self):
        inherited={'LZ_HARNESS_BROWSER_MODE':'portable-chrome152','LZ_EXPECTED_ACCOUNT_ID':'foreign','OTHER':'keep'}
        self.assertEqual(m.browser_environment({},inherited),{'LZ_HARNESS_BROWSER_MODE':'persistent-chrome','OTHER':'keep'})
        self.assertEqual(m.browser_environment({'browserMode':'portable-chrome152','expectedAccountId':'known'},inherited)['LZ_EXPECTED_ACCOUNT_ID'],'known')
    def test_mode_and_identity_change_result_reuse_stamp(self):
        config={'uiVersion':'579','forgeVersion':'6.5','appCommit':'source'}
        original=m.result_stamp(config,{},'instrument')
        self.assertNotEqual(original,m.result_stamp({**config,'browserMode':'portable-chrome152','expectedAccountId':'known'},{},'instrument'))
    def test_actual_run_phase_all_three_phases_bind_mode_and_skip_only_shared_profile_wait(self):
        old=(m.run_child,m.wait_profile_free,m.classify_report)
        try:
            calls=[]
            def child(command,env,log,timeout,heartbeat):
                calls.append(('child',env.copy()))
                Path(env['PLAYWRIGHT_JSON_OUTPUT_NAME']).write_text('{}')
                return {'exit':0}
            m.run_child=child
            m.wait_profile_free=lambda:calls.append(('wait',))
            m.classify_report=lambda *args:{'status':'passed'}
            for mode in ['persistent-chrome','portable-chrome152']:
                config={'runId':'own','uiVersion':'579','identitySpec':'identity.spec.ts','browserMode':mode,'expectedAccountId':'known'}
                for phase in ['before','tests','after']:
                    with tempfile.TemporaryDirectory() as directory:
                        m.run_phase(config,{'specs':['feature.spec.ts'],'minTests':1},phase,Path(directory),None)
                        receipt=m.read(Path(directory)/(phase+'-command.json'))
                        self.assertEqual(receipt['browserMode'],mode)
                        self.assertEqual(calls[-1][1]['LZ_HARNESS_BROWSER_MODE'],mode)
                        self.assertEqual(calls[-1][1]['LZ_EXPECTED_ACCOUNT_ID'],'known')
            self.assertEqual(sum(c[0]=='wait' for c in calls),3)
        finally: m.run_child,m.wait_profile_free,m.classify_report=old

if __name__=='__main__': unittest.main(verbosity=2)

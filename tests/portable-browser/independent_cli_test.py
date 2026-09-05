# Pure local CLI/config review. Child creation is stubbed; no browser or real state.
import contextlib,importlib.util,io,json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('candidate',Path(__file__).resolve().parents[2] / 'scripts/lz-campaign.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Review(unittest.TestCase):
 def test_actual_start_resume_cli_persist_mode_and_refuse_same_id_switch(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);manifest=root/'manifest.json';manifest.write_text(json.dumps({'identitySpec':'fake.spec.ts','features':[]}));started=[]
   def child(argv,**kwargs):started.append(argv);return type('Child',(),{'pid':12345})()
   def cli(verb,extra=()):
    args=['candidate',verb,'--run-id','local','--manifest',str(manifest),'--ui-version','1.2.3','--forge-version','4','--app-commit','local-source',*extra]
    with patch.object(sys,'argv',args),contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):return m.main()
   with patch.object(m,'ROOT',root),patch.object(m,'validate_manifest',lambda _:[]),patch.object(m,'is_owner_alive',lambda _:False),patch.object(m,'process_start',lambda _:'local-start'),patch.object(m.subprocess,'Popen',child),patch.object(m.time,'sleep',lambda _:None):
    cli('start',['--browser-mode','portable-chrome152','--expected-account-id','local-placeholder'])
    config=root/'evidence/lz-campaign/local/config.json';before=json.loads(config.read_text());self.assertEqual(before['browserMode'],'portable-chrome152')
    cli('resume');after=json.loads(config.read_text());self.assertEqual(after,before)
    for extra in [['--browser-mode','persistent-chrome'],['--expected-account-id','different-placeholder']]:
     with self.assertRaises(SystemExit) as e:cli('resume',extra)
     self.assertEqual(e.exception.code,2);self.assertEqual(json.loads(config.read_text()),before)
    self.assertEqual(len(started),2)
 def test_default_run_phase_overrides_inherited_mode_and_binds_ui(self):
  with tempfile.TemporaryDirectory() as temp:
   seen=[];attempt=Path(temp)
   def child(argv,env,*args):seen.append(env);Path(env['PLAYWRIGHT_JSON_OUTPUT_NAME']).write_text('{}');return{'exit':0}
   with patch.dict(os.environ,{'LZ_HARNESS_BROWSER_MODE':'portable-chrome152','LZ_EXPECTED_ACCOUNT_ID':'foreign-placeholder','LZ_EXPECTED_UI_VERSION':'wrong'}),patch.object(m,'run_child',child),patch.object(m,'wait_profile_free',lambda:seen.append('wait')),patch.object(m,'classify_report',lambda *args:{'status':'passed'}):
    m.run_phase({'runId':'local','uiVersion':'1.2.3','identitySpec':'fake.spec.ts'},{'specs':['fake.spec.ts'],'minTests':1},'tests',attempt,None)
   self.assertEqual(seen[0],'wait');self.assertEqual(seen[1]['LZ_HARNESS_BROWSER_MODE'],'persistent-chrome');self.assertNotIn('LZ_EXPECTED_ACCOUNT_ID',seen[1]);self.assertEqual(seen[1]['LZ_EXPECTED_UI_VERSION'],'1.2.3')
 def test_invalid_persisted_mode_refuses_before_any_lane_or_child(self):
  for mode in ['wrong','',None]:
   with patch.object(m,'lock_acquire',side_effect=AssertionError('lane must not execute')),patch.object(m,'run_child',side_effect=AssertionError('child must not execute')):
    with self.assertRaises(ValueError):m.run({'browserMode':mode},Path('/unused'))
 def test_result_reuse_separates_modes_and_expected_configuration(self):
  c={'uiVersion':'1.2.3','forgeVersion':'4','appCommit':'local'};a=m.result_stamp(c,{},'fixed')
  for change in [{'browserMode':'portable-chrome152','expectedAccountId':'local-placeholder'},{'expectedAccountId':'different-placeholder'}]:self.assertFalse(m.reusable({'status':'passed','stamp':a},m.result_stamp({**c,**change},{},'fixed')))
if __name__=='__main__':unittest.main(verbosity=2)

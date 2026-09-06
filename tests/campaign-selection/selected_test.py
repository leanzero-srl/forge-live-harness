import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
module=Path(os.environ.get('LZ_CAMPAIGN_MODULE',ROOT/'scripts/lz-campaign.py'))
spec=importlib.util.spec_from_file_location('selected_campaign',module)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
DATA=Path(__file__).parent/'actual-six'
config=json.loads((DATA/'config.json').read_text())
features=json.loads((DATA/'manifest.json').read_text())['features']
instrument=json.loads((DATA/'summary.json').read_text())['instrumentHash']

class Selection(unittest.TestCase):
 def fixture(self,root):
  for name,pin in json.loads((DATA/'pins.json').read_text()).items():
   raw=(DATA/name).read_bytes();self.assertEqual(hashlib.sha256(raw).hexdigest(),pin['sha256']);self.assertEqual(len(raw),pin['bytes'])
   target=root/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
  c=copy.deepcopy(config);c['manifest']=str(root/'manifest.json');return c
 def summarize(self,root,c=None,blocker=None,observed=instrument):
  return m.summarize(c or copy.deepcopy(config),features,root,observed,blocker)
 def test_actual_six_selected_completion_preserves_entire_manifest_progress_and_original_results(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);c=self.fixture(root);old=m.read(root/'summary.json');before={u:(root/u/'result.json').read_bytes() for u in c['features']}
   result=self.summarize(root,c);self.assertFalse(old['complete']);self.assertFalse(result['complete']);self.assertEqual(m.read(DATA/'state.json')['status'],'incomplete')
   self.assertEqual(result['selectedRun'],{'featureIds':c['features'],'complete':True})
   self.assertEqual([(r['id'],r['status'],r['acceptance'])for r in result['features']],[(r['id'],r['status'],r['acceptance'])for r in old['features']])
   self.assertEqual(before,{u:(root/u/'result.json').read_bytes() for u in c['features']})
   self.assertEqual(sum(m.read(root/u/'result.json')['phases']['tests']['testCount'] for u in c['features']),6)
 def test_actual_run_terminal_uses_selected_completion_after_fresh_entry_and_exact_reuse(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);c=self.fixture(root);seen=[]
   def phase(config,feature,name,attempt,heartbeat):
    self.assertEqual(name,'before');seen.append(name);m.atomic(attempt/'before-identity.json',{'sourceFingerprint':c['sourceFingerprint']});return {'status':'passed'}
   with patch.object(m,'ROOT',root),patch.object(m,'validate_manifest',return_value=features),patch.object(m,'instrument_hash',return_value=instrument),patch.object(m,'lock_acquire',return_value={}),patch.object(m,'run_phase',side_effect=phase),patch.object(m,'STOP_NOW',False),contextlib.redirect_stdout(io.StringIO()):
    self.assertEqual(m.run(c,root),0)
   self.assertEqual(seen,['before']);self.assertEqual(m.read(root/'state.json')['status'],'complete');self.assertTrue(m.read(root/'summary.json')['selectedRun']['complete']);self.assertFalse(m.read(root/'summary.json')['complete'])
 def test_selected_missing_failed_stale_and_blocker_never_complete(self):
  for fault in ['missing','failed','known_defect','timed_out','running','stale','blocker']:
   with self.subTest(fault=fault),tempfile.TemporaryDirectory() as d:
    root=Path(d);self.fixture(root);path=root/config['features'][0]/'result.json';r=m.read(path)
    if fault=='missing':path.unlink()
    elif fault=='stale':r['stamp']='0'*64;m.atomic(path,r)
    elif fault!='blocker':r['status']=fault;m.atomic(path,r)
    result=self.summarize(root,blocker='identity_failed' if fault=='blocker' else None);self.assertFalse(result['selectedRun']['complete'])
 def test_actual_result_identity_stamps_still_bind_all_existing_axes(self):
  changes=[{'uiVersion':'different'},{'forgeVersion':'different'},{'appCommit':'different'},{'sourceFingerprint':'different'},{'sourceExtension':{'foreign':True}},{'browserMode':'persistent-chrome'},{'expectedAccountId':'foreign'}]
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);self.fixture(root)
   for change in changes:self.assertFalse(self.summarize(root,{**config,**change})['selectedRun']['complete'])
   self.assertFalse(self.summarize(root,observed='changed')['selectedRun']['complete'])
 def test_unknown_malformed_empty_or_duplicate_selection_refuses_without_lane_or_summary(self):
  for selected in [['unknown'],['normalization','unknown'],[],['normalization','normalization'],'normalization',[None],['']]:
   with self.subTest(selected=selected),tempfile.TemporaryDirectory() as d:
    root=Path(d);c=self.fixture(root);c['features']=selected;old=(root/'summary.json').read_bytes()
    with self.assertRaises(ValueError):self.summarize(root,c)
    self.assertEqual((root/'summary.json').read_bytes(),old)
    with patch.object(m,'ROOT',root),patch.object(m,'validate_manifest',return_value=features),patch.object(m,'lock_acquire',side_effect=AssertionError('Unknown selection reached lane')),self.assertRaises(ValueError):m.run(c,root)
 def test_default_whole_selection_matches_legacy_complete_and_planned_never_passes(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);self.fixture(root)
   for c in [{k:v for k,v in config.items() if k!='features'},{**config,'features':None}]:
    result=self.summarize(root,c);self.assertEqual(result['selectedRun']['featureIds'],[f['id'] for f in features]);self.assertEqual(result['selectedRun']['complete'],result['complete']);self.assertFalse(result['complete'])
   self.assertFalse(self.summarize(root,{**config,'features':['named-scenarios']})['selectedRun']['complete'])
 def test_stale_status_display_clears_both_flags_without_rewriting_history(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);run=root/'evidence/lz-campaign'/config['runId'];run.mkdir(parents=True);c=self.fixture(run);self.summarize(run,c);before=(run/'summary.json').read_bytes();out=io.StringIO()
   with patch.object(m,'ROOT',root),patch.object(m,'instrument_hash',return_value='changed'),patch.object(m,'is_owner_alive',return_value=False),patch.object(sys,'argv',['runner','status','--run-id',config['runId']]),contextlib.redirect_stdout(out):self.assertEqual(m.main(),0)
   actual=json.loads(out.getvalue());self.assertTrue(actual['instrumentChanged']);self.assertFalse(actual['summary']['complete']);self.assertFalse(actual['summary']['selectedRun']['complete']);self.assertEqual((run/'summary.json').read_bytes(),before)

if __name__=='__main__':unittest.main(verbosity=2)

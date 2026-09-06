#!/usr/bin/env python3
"""Two separate installed-adapter read-only launches; no retry or download."""
import json,os,pathlib,subprocess,sys,time
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'evidence/lz-campaign/portable-chrome152-readonly-admission-20260906'
if OUT.exists():raise SystemExit('Refuse overwriting any prior admission evidence')
OUT.mkdir(parents=True)
env=dict(os.environ,HEADLESS='1',HARNESS_VIDEO='0',LZ_HARNESS_BROWSER_MODE='portable-chrome152',LZ_EXPECTED_ACCOUNT_ID='712020:937bc860-eec2-4294-a65d-8e0fe7c45086',LZ_EXPECTED_UI_VERSION='4.58.579',LZ_CAMPAIGN_SOURCE_EXTENSION='null',LZ_CAMPAIGN_UNIT_DIR=str(OUT))
for key in ['LZ_RETAINED_UAT_LEDGER','LZ_SIXTH_NUMERIC_JOURNAL']:env.pop(key,None)
state={'mode':'portable-chrome152','sourceFreeze':'dce1d154f89a4684b3332508cf9de26fa3a1c746','forgeVersion':'6.5.0','uiVersion':'4.58.579','attempts':[],'complete':False}
def save():(OUT/'admission.json').write_text(json.dumps(state,indent=2)+'\n')
def tests(suite):
 for spec in suite.get('specs',[]):
  yield from spec.get('tests',[])
 for child in suite.get('suites',[]):yield from tests(child)
save()
for phase in ['before','after']:
 report=OUT/f'{phase}-result.json';env.update(LZ_CAMPAIGN_PHASE=phase,PLAYWRIGHT_JSON_OUTPUT_NAME=str(report))
 argv=[str(ROOT/'node_modules/.bin/playwright'),'test','scenarios/lz-ppm/campaign-portable-diagnostic-identity.spec.ts','--project=chromium','--workers=1','--reporter=line,json',f'--output={OUT/phase}']
 entry={'phase':phase,'argv':argv,'startedAt':time.time()};state['attempts'].append(entry);save()
 with open(OUT/f'{phase}.log','w') as log:
  try:r=subprocess.run(argv,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=300)
  except BaseException as error:entry['error']=repr(error);save();raise
 entry['exitCode']=r.returncode;entry['finishedAt']=time.time();save()
 if r.returncode or not report.exists():raise SystemExit('Actual admission failed; no later launch permitted')
 data=json.loads(report.read_text());actual=[t for suite in data.get('suites',[]) for t in tests(suite)]
 entry['tests']=[{'expectedStatus':t.get('expectedStatus'),'results':[r.get('status') for r in t.get('results',[])]} for t in actual];save()
 if len(actual)!=3 or data.get('errors') or any(t.get('expectedStatus')!='passed' or len(t.get('results',[]))!=1 or t['results'][0].get('status')!='passed' for t in actual):raise SystemExit('Three ordinary passed tests required after actual worker teardown')
 entry['passed']=True;save()
state['complete']=True;save();print(json.dumps({'complete':True,'launches':2,'testsPassed':6,'evidence':str(OUT)}))

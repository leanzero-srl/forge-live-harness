import os,pathlib,subprocess,json,datetime,time
r=pathlib.Path(__file__).resolve().parents[2];source=r/'evidence/lz-campaign/sixth-feature-live-20260906/sponsor-report-numeric-live/attempt-001/tests-artifacts';nums=list(source.rglob('numeric-report-journal.json'));assert len(nums)==1
out=r/'evidence/lz-campaign/sixth-numeric-settings-recovery-wait-20260906';out.mkdir(parents=True,exist_ok=True)
lock=pathlib.Path('/Users/mihaiperdum/.local/state/forge-live-harness/profile-locks/f99fe7ebe7f557192a9e48b1a342745b507990983d86b89e555fbac85dc4c369.lock')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def write(state):
 tmp=out/'state.tmp';tmp.write_text(json.dumps(state,indent=2));tmp.replace(out/'state.json')
started=now();deadline=time.monotonic()+600;attempt=0
while time.monotonic()<deadline:
 record=json.loads(lock.read_text());owner={k:record[k] for k in ['phase','parentPid','holderPid'] if k in record}
 if record.get('phase')!='idle':
  write({'status':'waiting_for_profile','startedAt':started,'observedAt':now(),'lastObservedOwner':owner,'attempts':attempt,'pid':os.getpid()});time.sleep(5);continue
 attempt+=1;unit=out/f'attempt-{attempt:03}';unit.mkdir()
 env=os.environ.copy();env.update({'HEADLESS':'1','LZ_SIXTH_NUMERIC_JOURNAL':str(nums[0]),'HEADED':'0','PLAYWRIGHT_JSON_OUTPUT_NAME':str(unit/'results.json')})
 cmd=['npx','playwright','test','scenarios/lz-ppm/campaign-recover-sixth-numeric.spec.ts','--project=chromium','--workers=1','--retries=0','--reporter=list,json','--output='+str(unit/'artifacts')]
 (unit/'intent.json').write_text(json.dumps({'time':now(),'command':cmd,'harnessCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip(),'sourceJournal':str(nums[0]),'purpose':'Exact operator recovery only; not feature acceptance'},indent=2))
 write({'status':'recovery_attempt','startedAt':started,'observedAt':now(),'attempt':attempt,'pid':os.getpid()})
 with (unit/'run.log').open('w') as log:result=subprocess.run(cmd,cwd=r,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=240)
 (unit/'terminal.json').write_text(json.dumps({'exitCode':result.returncode,'finishedAt':now()},indent=2))
 if result.returncode==0:
  write({'status':'restored','startedAt':started,'finishedAt':now(),'attempt':attempt,'pid':os.getpid()});print('RECOVERY_RESTORED',unit);break
 text=(unit/'run.log').read_text();data=json.loads((unit/'results.json').read_text());tests=[]
 def walk(suite):
  for spec in suite.get('specs',[]):tests.extend(spec.get('tests',[]))
  for child in suite.get('suites',[]):walk(child)
 for suite in data.get('suites',[]):walk(suite)
 safe_busy='PROFILE_BUSY:' in text and 'PROFILE_UNAVAILABLE:' not in text and len(tests)==1 and all(result.get('duration')==0 for test in tests for result in test.get('results',[])) and not list(unit.rglob('sixth-numeric-settings-recovery.json'))
 if not safe_busy:
  write({'status':'recovery_failed_no_retry','startedAt':started,'finishedAt':now(),'attempt':attempt,'pid':os.getpid()});print('RECOVERY_FAILED',unit);break
 write({'status':'admission_busy_before_body','startedAt':started,'observedAt':now(),'attempt':attempt,'pid':os.getpid()});time.sleep(5)
else:write({'status':'resource_wait_timed_out','startedAt':started,'finishedAt':now(),'attempts':attempt,'pid':os.getpid()});print('RESOURCE_WAIT_TIMEOUT')

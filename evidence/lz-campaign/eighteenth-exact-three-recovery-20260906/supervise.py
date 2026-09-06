"""Prepared durable single invocation. No browser before external root dispatch."""
import os,sys,json,subprocess,pathlib,datetime,hashlib,importlib.util,re
out=pathlib.Path(__file__).resolve().parent
root=pathlib.Path('/Users/mihaiperdum/Projects/forge-live-harness')
binding=json.loads((out/'command.json').read_text())
assert binding['status']=='authorized', 'Dispatch is not authorized'
assert re.fullmatch('[a-f0-9]{40}',binding['harnessCommit'] or ''), 'Transferred source fence missing'
assert re.fullmatch('[a-f0-9]{40}',binding['rootDispatchCommit'] or ''), 'Root dispatch missing'
assert binding['authorizedAt'], 'Authorization time missing'
assert re.fullmatch('[a-f0-9]{64}',binding['instrumentHash'] or ''), 'Frozen instrument missing'
assert subprocess.check_output(['git','merge-base','--is-ancestor',binding['harnessCommit'],'HEAD'],cwd=root)==b''
for name,digest in binding['sourceSha256'].items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest, 'Scoped source changed: '+name
spec=importlib.util.spec_from_file_location('campaign_guard',root/'scripts/lz-campaign.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
assert module.instrument_hash()==binding['instrumentHash'], 'Harness instrument changed'
for key in ['LZ_EIGHTEENTH_RECOVERY_EVIDENCE','LZ_EIGHTEENTH_RECOVERY_APPROVAL','LZ_EIGHTEENTH_RECOVERY_APPROVAL_SHA256']:
    assert binding['environment'].get(key), key+' missing'
assert hashlib.sha256(pathlib.Path(binding['environment']['LZ_EIGHTEENTH_RECOVERY_APPROVAL']).read_bytes()).hexdigest()==binding['environment']['LZ_EIGHTEENTH_RECOVERY_APPROVAL_SHA256']
assert binding['command']==['npx','playwright','test','scenarios/lz-ppm/campaign-eighteenth-recovery.spec.ts','--project=chromium','--workers=1','--retries=0','--reporter=line,json','--output='+str(out/'artifacts')]
env=os.environ.copy()
for key in list(env):
    if key.startswith(('LZ_SEVENTEENTH_','LZ_CLEANUP_','LZ_RETAINED_UAT')) or key in ['LZ_CAMPAIGN_RETAINED_UAT']:
        env.pop(key,None)
env.update({'HEADLESS':'1','HARNESS_VIDEO':'0','LZ_HARNESS_BROWSER_MODE':'portable-chrome152','LZ_EXPECTED_ACCOUNT_ID':binding['expectedAccountId'],'LZ_EXPECTED_UI_VERSION':binding['uiVersion'],'LZ_CAMPAIGN_SOURCE_EXTENSION':'null','LZ_EIGHTEENTH_RECOVERY_PHASE':'approved-three-fixtures','PLAYWRIGHT_JSON_OUTPUT_NAME':str(out/'result.json')})
env.update(binding['environment'])
# Durable exclusive marker survives a shell loss. A failed/unknown run is never auto-restarted.
fd=os.open(out/'started-once.json',os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
with os.fdopen(fd,'w') as f:json.dump({'supervisorPid':os.getpid(),'startedAt':started,'rootDispatchCommit':binding['rootDispatchCommit']},f)
p=subprocess.Popen(binding['command'],cwd=root,env=env,stdin=subprocess.DEVNULL)
(out/'process.json').write_text(json.dumps({'pid':p.pid,'supervisorPid':os.getpid(),'status':'running','startedAt':started,'time':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2))
rc=p.wait()
(out/'process.json').write_text(json.dumps({'pid':p.pid,'supervisorPid':os.getpid(),'status':'terminal','exitCode':rc,'time':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2))
sys.exit(rc)

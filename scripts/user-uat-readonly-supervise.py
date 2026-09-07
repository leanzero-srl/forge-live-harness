"""One bounded baseline, using the existing exclusive campaign lifecycle."""
import hashlib, importlib.util, json, os, signal, subprocess, sys
from pathlib import Path
ROOT=Path('/Users/mihaiperdum/Projects/forge-live-harness')
OUT=ROOT/'evidence/lz-campaign/user-uat-readonly-baseline-20260907'
spec=importlib.util.spec_from_file_location('campaign',ROOT/'scripts/lz-campaign.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
def stop(*_): c.STOP_NOW=True
signal.signal(signal.SIGINT,stop);signal.signal(signal.SIGTERM,stop)
receipt=json.loads((OUT/'command.json').read_text())
assert receipt['status']=='authorized' and receipt['timeoutSeconds']==600
assert receipt['runId']==OUT.name
assert receipt['command']==['/Users/mihaiperdum/.nvm/versions/node/v22.22.0/bin/node','--import','tsx','scripts/user-uat-readonly-baseline.ts']
for file,digest in receipt['sourceHashes'].items():
 assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest()==digest,file
assert not (OUT/'ONCE.json').exists()
owner=c.lock_acquire(ROOT/'.lz-campaign-browser.lock',wait_seconds=0)
state={'status':'starting','supervisorPid':os.getpid(),'startedAt':c.utc(),'actualHarnessCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'commandSha256':hashlib.sha256((OUT/'command.json').read_bytes()).hexdigest()}
try:
 with (OUT/'ONCE.json').open('x') as output:json.dump(state,output)
 c.atomic(OUT/'process.json',state)
 def heartbeat(pid):
  state.update(status='running',childPid=pid,childStart=c.process_start(pid),heartbeatAt=c.utc());c.atomic(OUT/'process.json',state)
 env=dict(os.environ);env.update(receipt['environment']);env['PATH']=str(Path(receipt['command'][0]).parent)+os.pathsep+env.get('PATH','')
 result=c.run_child(receipt['command'],env,OUT/'run.log',600,heartbeat)
 state.update(status='terminal',finishedAt=c.utc(),processResult=result);c.atomic(OUT/'process.json',state)
 sys.exit(0 if result.get('exit')==0 and not result.get('timedOut') and not result.get('interrupted') else 1)
finally:
 if c.read(ROOT/'.lz-campaign-browser.lock/owner.json')==owner:
  (ROOT/'.lz-campaign-browser.lock/owner.json').unlink();(ROOT/'.lz-campaign-browser.lock').rmdir()

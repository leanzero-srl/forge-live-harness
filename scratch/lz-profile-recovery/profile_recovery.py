"""Explicit one-time operator recovery. Never called by normal browser admission.
Historical close is UNKNOWN. Does not open or modify profile contents or markers.
"""
import fcntl, hashlib, json, os, pathlib, re, stat, subprocess, sys, datetime
PROFILE=pathlib.Path('/Users/mihaiperdum/Projects/forge-live-harness/.auth/profile')
LOCK=pathlib.Path('/Users/mihaiperdum/.local/state/forge-live-harness/profile-locks/f99fe7ebe7f557192a9e48b1a342745b507990983d86b89e555fbac85dc4c369.lock')
SHA='4505e1e01f45a5789ea7b27d010c635822ca563d37840e8a75b4ae9c454df93c'
INODE=260145998
MARKERS=('SingletonLock','SingletonSocket','SingletonCookie','RunningChromeVersion')
def require(value, message):
 if not value: raise RuntimeError(message)
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def inspect(profile,record):
 for field in ('parentPid','holderPid'):
  try:os.kill(record[field],0)
  except ProcessLookupError:pass
  else:raise RuntimeError('Recorded identity still exists: '+field)
 markers=[n for n in MARKERS if os.path.lexists(profile/n)];require(not markers,'Chrome markers present')
 ps=subprocess.run(['ps','-ww','-axo','pid=,ppid=,command='],capture_output=True,text=True,check=True)
 matches=[]
 for line in ps.stdout.splitlines():
  parts=line.strip().split(None,2)
  if len(parts)!=3:continue
  pid,ppid,command=parts
  found=re.search(r'--user-data-dir(?:=|\s+)([^\s]+)',command)
  if found and os.path.realpath(found.group(1))==str(profile):matches.append({'pid':int(pid),'ppid':int(ppid),'kind':'profile-browser'})
  if 'profile-holder.py' in command and str(profile) in command:matches.append({'pid':int(pid),'ppid':int(ppid),'kind':'profile-holder'})
 require(not matches,'Same-profile process exists')
 # Positive control uses the SAME profile's existing file, read-only, no contents read.
 control=profile/'Local State';require(control.is_file(),'Missing same-profile lsof control')
 with control.open('rb'):
  seen=subprocess.run(['/usr/sbin/lsof','-nP','-a','-p',str(os.getpid()),str(control)],capture_output=True,text=True)
  require(seen.returncode==0 and str(control) in seen.stdout,'Same-profile open-file positive control failed')
 current=subprocess.run(['/usr/sbin/lsof','-nP','+D',str(profile)],capture_output=True,text=True)
 require(current.returncode==1 and not current.stdout and not current.stderr,'Profile has handles or ownership scan is uncertain')
 return {'observedAt':utc(),'recordedPidsAbsent':True,'sameProfileProcesses':matches,'allFourMarkersAbsent':True,'sameProfileOpenDescriptorControl':True,'profileHandles':[]}
def durable(path,data,mode=0o600):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as h:h.write(data);h.flush();os.fsync(h.fileno())
 defsync=os.open(path.parent,os.O_RDONLY);os.fsync(defsync);os.close(defsync)
def recover(profile,lock,sha,inode,archive_root,audit_path,pids,apply=False,inspector=inspect):
 profile=profile.resolve();fd=os.open(lock,os.O_RDWR|os.O_NOFOLLOW)
 with os.fdopen(fd,'r+b') as handle:
  st=os.fstat(handle.fileno());require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and st.st_nlink==1 and not(st.st_mode&0o077),'Uncertain/private lock ownership')
  require(st.st_ino==inode,'Unexpected inode');fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
  raw=handle.read();require(hashlib.sha256(raw).hexdigest()==sha,'Unexpected exact reservation bytes');record=json.loads(raw)
  require(set(record)=={'version','profile','phase','token','parentPid','holderPid'} and record['version']==1 and record['phase']=='active' and record['profile']==str(profile) and (record['parentPid'],record['holderPid'])==pids and isinstance(record['token'],str),'Unexpected reservation identity')
  audit={'time':utc(),'reason':'Explicit operator recovery; historical operation and close remain unknown','profile':str(profile),'lock':str(lock),'inode':inode,'beforeSha256':sha,'beforeRecord':{k:v for k,v in record.items() if k!='token'},'checks':[],'applied':False}
  audit['checks'].append(inspector(profile,record))
  if not apply:return audit
  archive_root.mkdir(parents=True,exist_ok=True,mode=0o700);ast=archive_root.stat();require(ast.st_uid==os.getuid() and not(ast.st_mode&0o077),'Archive directory is not private')
  archive=archive_root/(sha+'.reservation');durable(archive,raw);audit['privateOriginalArchive']=str(archive)
  # Durable intent is written before any reservation mutation, without its token.
  durable(audit_path, json.dumps(audit,indent=2).encode())
  audit['checks'].append(inspector(profile,record));now=os.stat(lock,follow_symlinks=False);require((now.st_dev,now.st_ino)==(st.st_dev,st.st_ino),'Lock inode changed')
  handle.seek(0);require(handle.read()==raw,'Reservation changed during recovery')
  idle=json.dumps({'version':1,'profile':str(profile),'phase':'idle'}).encode();handle.seek(0);handle.write(idle);handle.truncate();handle.flush();os.fsync(handle.fileno());handle.seek(0);require(handle.read()==idle,'Idle readback mismatch')
  now=os.stat(lock,follow_symlinks=False);require((now.st_dev,now.st_ino)==(st.st_dev,st.st_ino),'Inode replaced')
  audit.update(applied=True,completedAt=utc(),afterSha256=hashlib.sha256(idle).hexdigest(),sameInode=True)
  durable(audit_path.with_suffix('.completed.json'),json.dumps(audit,indent=2).encode());return audit
if __name__=='__main__':
 require(sys.argv[1:] in [[],['--apply']],'Only explicit --apply supported')
 base=pathlib.Path(__file__).resolve().parent
 audit=recover(PROFILE,LOCK,SHA,INODE,pathlib.Path('/Users/mihaiperdum/.local/state/forge-live-harness/operator-recovery-20260906'),base/'operator-intent.json',(31453,31468),apply=sys.argv[1:]==['--apply'])
 print(json.dumps(audit,indent=2))

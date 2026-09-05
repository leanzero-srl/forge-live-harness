import unittest,tempfile,pathlib,json,os,hashlib,fcntl,subprocess,sys
from profile_recovery import recover,inspect
class Recovery(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name).resolve();self.profile=self.root/'profile';self.profile.mkdir();(self.profile/'Local State').write_text('{}');self.lock=self.root/'existing.lock';self.raw=json.dumps({'version':1,'profile':str(self.profile),'phase':'active','token':'local-control','parentPid':99999991,'holderPid':99999992}).encode();self.lock.write_bytes(self.raw);self.lock.chmod(0o600);self.inode=self.lock.stat().st_ino;self.sha=hashlib.sha256(self.raw).hexdigest()
 def tearDown(self):self.temp.cleanup()
 def run_recovery(self,**kw):return recover(self.profile,self.lock,kw.pop('sha',self.sha),kw.pop('inode',self.inode),self.root/'archive',self.root/'audit.json',(99999991,99999992),**kw)
 def unchanged(self):self.assertEqual(self.lock.read_bytes(),self.raw)
 def test_wrong_bytes(self):
  with self.assertRaisesRegex(RuntimeError,'bytes'):self.run_recovery(sha='0'*64,apply=True)
  self.unchanged()
 def test_changed_inode(self):
  with self.assertRaisesRegex(RuntimeError,'inode'):self.run_recovery(inode=self.inode+1,apply=True)
  self.unchanged()
 def test_symlink(self):
  original=self.root/'original';self.lock.rename(original);self.lock.symlink_to(original)
  with self.assertRaises(OSError):self.run_recovery(apply=True)
  self.assertEqual(original.read_bytes(),self.raw)
 def test_live_identity(self):
  with self.assertRaisesRegex(RuntimeError,'identity'):inspect(self.profile,{'parentPid':os.getpid(),'holderPid':99999992})
  self.unchanged()
 def test_all_marker_siblings(self):
  for name in ('SingletonLock','SingletonSocket','SingletonCookie','RunningChromeVersion'):
   marker=self.profile/name;marker.symlink_to('/missing-positive-control')
   with self.assertRaisesRegex(RuntimeError,'markers'):self.run_recovery(apply=True)
   self.unchanged();marker.unlink()
 def test_other_lock_holder(self):
  p=subprocess.Popen([sys.executable,'-c','import fcntl,sys;h=open(sys.argv[1],"r+");fcntl.flock(h,fcntl.LOCK_EX);print("held",flush=True);sys.stdin.read()',str(self.lock)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
  try:
   self.assertEqual(p.stdout.readline().strip(),'held')
   with self.assertRaises(BlockingIOError):self.run_recovery(apply=True)
   self.unchanged()
  finally:p.communicate('');self.assertEqual(p.returncode,0)
 def test_failure_second_check_preserves_active_intent(self):
  calls=[]
  def control(*args):
   calls.append(1)
   if len(calls)==2:raise RuntimeError('new owner uncertainty')
   return {'localControl':True}
  with self.assertRaisesRegex(RuntimeError,'uncertainty'):self.run_recovery(apply=True,inspector=control)
  self.unchanged();self.assertTrue((self.root/'audit.json').exists());self.assertEqual((self.root/'archive'/(self.sha+'.reservation')).read_bytes(),self.raw)
 def test_positive_same_inode_actual_no_owner(self):
  result=self.run_recovery(apply=True);self.assertTrue(result['applied']);self.assertEqual(self.lock.stat().st_ino,self.inode);self.assertEqual(json.loads(self.lock.read_bytes()),{'version':1,'profile':str(self.profile),'phase':'idle'});self.assertEqual((self.root/'archive'/(self.sha+'.reservation')).read_bytes(),self.raw);self.assertEqual(len(result['checks']),2)
if __name__=='__main__':unittest.main()

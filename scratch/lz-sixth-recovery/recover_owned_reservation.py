"""Explicit recovery of the exact own sixth download crash, not a blind retry."""
import sys,pathlib,json
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent.parent/'lz-profile-recovery'))
from profile_recovery import recover,PROFILE,LOCK,INODE
base=pathlib.Path(__file__).resolve().parent
if __name__=='__main__':
 assert sys.argv[1:] in [[],['--apply']]
 print(json.dumps(recover(PROFILE,LOCK,'4667c676be56f8c5706ef321f53d92cec348786b8e96707036eefc0ce8d1b24d',INODE,pathlib.Path('/Users/mihaiperdum/.local/state/forge-live-harness/operator-recovery-20260906'),base/'owned-crash-intent.json',(45550,45551),apply=sys.argv[1:]==['--apply']),indent=2))

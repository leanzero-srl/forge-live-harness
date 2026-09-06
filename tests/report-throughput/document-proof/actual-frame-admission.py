"""Read closed local traces. Emit structural booleans and hashes only."""
from pathlib import Path
import zipfile,json,urllib.parse,hashlib
r=Path('/Users/mihaiperdum/Projects/forge-live-harness/evidence/lz-campaign/eighteenth-report-acceptance-20260906/report-capture-jobs-live/attempt-001/tests-artifacts');rows=[]
app='087a8e18-d45a-4cb7-9d87-3e84101ac4f3';env='d6096af9-3082-4ee1-a05e-f8b61d766b77'
for slug in ['26aea','2ca7a','fd1f8','0f0ba']:
 p=next(r.glob('*'+slug+'*/trace.zip'))
 with zipfile.ZipFile(p)as z:
  snapshots=[e['snapshot']for line in z.read('trace.trace').splitlines()if (e:=json.loads(line))['type']=='frame-snapshot'];apps=[];tags=[]
  for s in snapshots:
   if not s.get('isMainFrame'):
    u=urllib.parse.urlsplit(s['frameUrl']);parts=u.path.split('/');checks={'https':u.scheme=='https','cdnSuffix':u.hostname.endswith('.cdn.prod.atlassian-dev.net'),'appPart1':len(parts)>4 and parts[1]==app,'envPart2':len(parts)>4 and parts[2]==env,'resourcePart4':len(parts)>4 and parts[4]=='ppm-ui'}
    if all(checks.values()):apps.append({'frameId':s['frameId'],'checks':checks})
   else:
    stack=[s['html']]
    while stack:
     n=stack.pop()
     if not isinstance(n,list):continue
     if len(n)>1 and isinstance(n[0],str)and n[0].lower()=='iframe'and isinstance(n[1],dict)and n[1].get('data-testid')=='hosted-resources-iframe':tags.append(n[1].get('src'))
     stack.extend(x for x in n if isinstance(x,list))
  ids=set(x['frameId']for x in apps);linked=any(isinstance(src,str)and i in src for src in tags for i in ids);assert apps and linked
  rows.append({'traceSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'directory':p.parent.name,'matchingAppSnapshotCount':len(apps),'uniqueMatchingAppFrameCount':len(ids),'allUrlStructuralPredicates':all(all(x['checks'].values())for x in apps),'exactHostedIframeTagObserved':True,'tagSnapshotSrcLinksAppFrameId':linked})
out={'schema':1,'source':'closed eighteenth trace frame snapshots','queriesAndPathsIncluded':False,'rows':rows}
Path(__file__).with_suffix('.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'traces':len(rows),'allExact':all(x['allUrlStructuralPredicates']and x['tagSnapshotSrcLinksAppFrameId']for x in rows)}))

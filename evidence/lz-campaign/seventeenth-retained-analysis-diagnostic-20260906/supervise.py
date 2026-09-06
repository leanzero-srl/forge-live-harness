import os,sys,json,subprocess,pathlib,datetime
out=pathlib.Path(__file__).resolve().parent
binding=json.loads((out/'command.json').read_text())
env=os.environ.copy();env.update({'HEADLESS':'1','HARNESS_VIDEO':'0','LZ_HARNESS_BROWSER_MODE':'portable-chrome152','LZ_EXPECTED_ACCOUNT_ID':binding['expectedAccountId'],'LZ_EXPECTED_UI_VERSION':binding['uiVersion'],'LZ_CAMPAIGN_SOURCE_EXTENSION':'null','LZ_SEVENTEENTH_RECOVERY_PHASE':'advance','PLAYWRIGHT_JSON_OUTPUT_NAME':str(out/'result.json')})
for k in ['LZ_CAMPAIGN_RETAINED_UAT','LZ_RETAINED_UAT_LEDGER','LZ_SEVENTEENTH_ADVANCE_JOURNAL','LZ_SEVENTEENTH_ADVANCE_SHA']:env.pop(k,None)
p=subprocess.Popen(binding['command'],cwd='/Users/mihaiperdum/Projects/forge-live-harness',env=env,stdin=subprocess.DEVNULL)
(out/'process.json').write_text(json.dumps({'pid':p.pid,'status':'running','time':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2))
rc=p.wait();(out/'process.json').write_text(json.dumps({'pid':p.pid,'status':'terminal','exitCode':rc,'time':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2));sys.exit(rc)

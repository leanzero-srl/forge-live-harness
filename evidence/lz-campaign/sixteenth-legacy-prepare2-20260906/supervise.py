import os,sys,json,subprocess,pathlib,datetime
out=pathlib.Path(__file__).resolve().parent
b=json.loads((out/'command.json').read_text())
env=os.environ.copy();env.update({'HEADLESS':'1','HARNESS_VIDEO':'0','LZ_HARNESS_BROWSER_MODE':b['mode'],'LZ_EXPECTED_ACCOUNT_ID':b['expectedAccountId'],'LZ_EXPECTED_UI_VERSION':b['uiVersion'],'LZ_CAMPAIGN_SOURCE_EXTENSION':'null','LZ_LEGACY_UPGRADE_PHASE':b['phase'],'LZ_LEGACY_REUSE_RECEIPT':b['reuseReceipt'],'LZ_LEGACY_REUSE_SHA':b['reuseSha'],'LZ_DEPLOYED_FORGE':b['forgeVersion'],'LZ_DEPLOYED_APP':b['appSource'],'PLAYWRIGHT_JSON_OUTPUT_NAME':str(out/'result.json')})
for k in ['LZ_CAMPAIGN_RETAINED_UAT','LZ_RETAINED_UAT_LEDGER']:env.pop(k,None)
p=subprocess.Popen(b['command'],cwd='/Users/mihaiperdum/Projects/forge-live-harness',env=env,stdin=subprocess.DEVNULL)
(out/'process.json').write_text(json.dumps({'pid':p.pid,'status':'running','time':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2))
rc=p.wait();(out/'process.json').write_text(json.dumps({'pid':p.pid,'status':'terminal','exitCode':rc,'time':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2));sys.exit(rc)

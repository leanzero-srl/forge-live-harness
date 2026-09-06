# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/campaign-cleanup-sixth-diagnostic.spec.ts >> cleanup: accepted sixth report removes only exact owned report, plan, issue and release; original45 and private preferences remain untouched
- Location: scenarios/lz-ppm/campaign-cleanup-sixth-diagnostic.spec.ts:12:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('body')
Expected pattern: /V4\.58\.579/
Received string:  "LeanZero ManagementLeanZero ManagementPlansCapacityPortfolio control  ·  rev v4.58.579PortfolioPlansManage your project portfolio timelinesImport a Jira plan+ New PlanNew planIndex issues from JQL, a board, or a projectImport a Jira planBring a Jira Premium plan in: its sources, exclusion rules and date fieldsLZPT ScenariosReady45Issues1Sources0DraftsJQL?Updated 3h agoIndexed 3h agoOpen plan →testReady54Issues1Sources0DraftsJQL?Updated 6h agoIndexed 6h agoOpen plan →LZPP PerfReady5,300Issues1Sources0DraftsJQL?Updated 6h agoIndexed 6h agoOpen plan →"
Timeout: 15000ms

Call log:
  - Expect "toContainText" with timeout 15000ms
  - waiting for locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('body')
    33 × locator resolved to <body>…</body>
       - unexpected value "LeanZero ManagementLeanZero ManagementPlansCapacityPortfolio control  ·  rev v4.58.579PortfolioPlansManage your project portfolio timelinesImport a Jira plan+ New PlanNew planIndex issues from JQL, a board, or a projectImport a Jira planBring a Jira Premium plan in: its sources, exclusion rules and date fieldsLZPT ScenariosReady45Issues1Sources0DraftsJQL?Updated 3h agoIndexed 3h agoOpen plan →testReady54Issues1Sources0DraftsJQL?Updated 6h agoIndexed 6h agoOpen plan →LZPP PerfReady5,300Issues1Sources0DraftsJQL?Updated 6h agoIndexed 6h agoOpen plan →"

```

```yaml
- banner:
  - button "LeanZero Management home": LeanZero Management
  - navigation:
    - button "Plans"
    - button "Capacity"
  - text: Portfolio control · rev
  - strong: v4.58.579
- main:
  - text: Portfolio
  - heading "Plans" [level=1]
  - paragraph: Manage your project portfolio timelines
  - button "Import a Jira plan"
  - button "+ New Plan"
  - button "New plan Index issues from JQL, a board, or a project":
    - img
    - text: New plan Index issues from JQL, a board, or a project
  - 'button "Import a Jira plan Bring a Jira Premium plan in: its sources, exclusion rules and date fields"':
    - img
    - text: "Import a Jira plan Bring a Jira Premium plan in: its sources, exclusion rules and date fields"
  - heading "LZPT Scenarios" [level=3]
  - text: Ready
  - button "More":
    - img
  - text: 45 Issues 1 Sources 0 Drafts JQL ? Updated 3h ago Indexed 3h ago
  - button "Open plan →"
  - heading "test" [level=3]
  - text: Ready
  - button "More":
    - img
  - text: 54 Issues 1 Sources 0 Drafts JQL ? Updated 6h ago Indexed 6h ago
  - button "Open plan →"
  - heading "LZPP Perf" [level=3]
  - text: Ready
  - button "More":
    - img
  - text: 5,300 Issues 1 Sources 0 Drafts JQL ? Updated 6h ago Indexed 6h ago
  - button "Open plan →"
```

# Test source

```ts
  1  | // Intentional exact4→3 cleanup after accepted actual report/PDF. Not a generic guard exception.
  2  | import './campaign-portable-diagnostic-identity.spec';
  3  | import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
  4  | import {test,expect} from '../../fixtures/forge';import {getTestState} from '../../testhook/client';
  5  | import {openPlans,scheduleFields,LZPT_PLAN} from './forecast-fixture';
  6  | import {actualResponse,currentUserResolver} from './campaign-ui';
  7  | import {getHarnessLaunchReceipt} from '../../forge/browser';import {assertDiagnosticReceipt} from './portable-diagnostic-receipt.mjs';
  8  | import {settledScreenshot} from './settled-screenshot.mjs';
  9  | const planId='plan-test-mtozislw-v816ze',issueKey='WFH-2847',versionId='10289',reportId='4fbb1943-7064-4dc1-8faa-e06816c188f6';
  10 | const originals=[LZPT_PLAN,'plan-mta3aw3t-6dyijd','plan-mtbrlh8n-7ghw8u'].sort();
  11 | const sha=(value:any)=>createHash('sha256').update(value).digest('hex');
  12 | test('cleanup: accepted sixth report removes only exact owned report, plan, issue and release; original45 and private preferences remain untouched',async({page},info)=>{
  13 |  const dir=process.env.LZ_CAMPAIGN_UNIT_DIR!;expect(process.env.LZ_CAMPAIGN_PHASE).toBe('before');const receipt=assertDiagnosticReceipt(getHarnessLaunchReceipt(page.context()));const admission=JSON.parse(fs.readFileSync(path.join(dir,'before-diagnostic-provenance.json'),'utf8'));expect(admission.planIds).toEqual([...originals,planId].sort());expect(admission.summary.id).toBe(reportId);
  14 |  const successful=path.resolve('evidence/lz-campaign/portable-retained-report-diagnostic-20260906-attempt002');const result=JSON.parse(fs.readFileSync(path.join(successful,'result.json'),'utf8'));expect(result.stats.expected).toBe(1);expect(result.stats.unexpected).toBe(0);expect(result.errors).toEqual([]);
  15 |  const artifact=path.join(successful,'artifacts/scenarios-lz-ppm-campaign--39219-g-or-changing-captured-data-chromium');const accepted=JSON.parse(fs.readFileSync(path.join(artifact,'portable-retained-download.json'),'utf8'));expect(accepted).toMatchObject({allVisibleFieldsVerified:true,retainedDataUnchanged:true});expect(sha(fs.readFileSync(path.join(artifact,'portable-retained-report.html')))).toBe('7778946c9b1c118284bee37e0493db744b7b8931e4df64a16e5a5e36d62f69a1');
  16 |  expect(sha(fs.readFileSync(path.join(artifact,'portable-retained-report.pdf')))).toBe('aca2c305c346ea794f1d87d4faa4a9ef374b6b947a51f7edc14a8e6c5f711755');
  17 |  const journal:any={receipt,phase:'admission',complete:false,owned:{planId,issueKey,issueId:admission.issue.id,versionId,reportId},parentAcceptance:'root personally inspected both PDF pages; final line yMax553.049977 of594.959960pt page (41.91pt bottom margin)',acceptedHtmlSha:accepted.saved.sha256,acceptedPdfSha:sha(fs.readFileSync(path.join(artifact,'portable-retained-report.pdf'))),intents:[],acks:[],reads:[]};const save=()=>fs.writeFileSync(info.outputPath('exact-cleanup.json'),JSON.stringify(journal,null,2)+'\n');const record=(stage:string,value:any)=>{journal.reads.push({stage,time:new Date().toISOString(),value});save();};const intent=(operation:string)=>{journal.intents.push({operation,time:new Date().toISOString()});save();};const ack=(operation:string,value:any)=>{journal.acks.push({operation,time:new Date().toISOString(),value});save();};save();
  18 |  const rpc=currentUserResolver(page,c=>c?.functionKey==='getCapacitySettings');let settings:any,bodyError:any;
  19 |  const rest=async(method:'GET'|'DELETE',url:string)=>{const response=await page.context().request.fetch('https://wolfaenpak.atlassian.net'+url,{method,maxRetries:0,maxRedirects:0});const text=await response.text();let data:any=null;if(text){try{data=JSON.parse(text);}catch{throw new Error(`Non-JSON ${method} ${url} ${response.status()}`);}}return{status:response.status(),data};};
  20 |  const issueUrl=`/rest/api/3/issue/${issueKey}?fields=project,summary,labels,customfield_10015,duedate,customfield_10180,fixVersions,timeestimate,assignee`;
  21 |  const expectCounts=(value:any,fixed:number)=>{expect(value.issuesFixedCount).toBe(fixed);expect(value.issuesAffectedCount).toBe(0);expect(value.issueCountWithCustomFieldsShowingVersion).toBe(0);expect(value.customFieldUsage||[]).toEqual([]);};
  22 |  const sourceAudit=async()=>{const source=await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN});expect(source.issues).toHaveLength(45);expect(source.meta.protectionEnabled).toBe(false);const basis={issues:scheduleFields(source.issues),sources:source.meta.sources,calendarKey:source.meta.calendarKey,holidayYears:source.meta.holidayYears,milestones:source.meta.milestones,protectionEnabled:source.meta.protectionEnabled};expect(sha(JSON.stringify(basis))).toBe('2d5c1ea0d3e742ff61ae47701ab6a391d0cbe6f0238e9415fb73b38e8f21f104');return{fingerprint:sha(JSON.stringify(basis)),issueCount:45,protectionEnabled:false};};
  23 |  try{
  24 |   const frame=await openPlans(page),pending=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();settings=await pending;expect(settings.success).toBe(true);expect(settings.settings).toEqual({selectedPlanIds:[],profiles:{},issueChoices:{}});expect(Number.isSafeInteger(settings.version)).toBe(true);expect(settings.version).toBeGreaterThanOrEqual(36);journal.settings=settings;save();
  25 |   const draft=await rpc.invoke('getDraft',{planId}),active=await rpc.invoke('getActiveDrafts',{planId}),lock=await rpc.invoke('getLockStatus',{planId});expect(draft).toEqual({success:true,draft:null});expect(active).toEqual({success:true,drafts:{}});expect(lock.success).toBe(true);expect(lock.locked).toBe(false);expect(lock.holder).toBeUndefined();record('draft-and-lock',{draft,active,lock});
  26 |   const freshIssue=await rest('GET',issueUrl);expect(freshIssue.status).toBe(200);expect(freshIssue.data).toEqual(admission.issue);const freshVersion=await rest('GET',`/rest/api/3/version/${versionId}`);expect(freshVersion.status).toBe(200);expect(freshVersion.data).toEqual(admission.version);const counts=await rest('GET',`/rest/api/3/version/${versionId}/relatedIssueCounts`);expect(counts.status).toBe(200);expectCounts(counts.data,1);record('same-object-positive-usage',counts);
  27 |   expect((await rpc.invoke('getSponsorReport',{planId,reportId})).report).toEqual(admission.summary);expect(await rpc.invoke('getCapacitySettings',{})).toEqual(settings);
  28 |   intent('delete-report');const deletedReport=await rpc.invoke('deleteSponsorReport',{planId,reportId});expect(deletedReport.success).toBe(true);expect(deletedReport.deleted).toBe(true);ack('delete-report',deletedReport);
  29 |   for(let n=0;n<2;n++){const absent=await rpc.invoke('getSponsorReport',{planId,reportId});expect(absent.success).toBe(false);expect(absent.error).toBe('This sponsor report was deleted or is unavailable');record('report-absent',absent);}
  30 |   const entries:any[]=[];let cursor:any;const seen=new Set();do{const list=await rpc.invoke('listSponsorReports',{planId,...(cursor?{cursor}:{})});expect(list.success).toBe(true);entries.push(...list.entries);cursor=list.nextCursor;if(cursor){expect(seen.has(cursor)).toBe(false);seen.add(cursor);}expect(seen.size).toBeLessThan(100);}while(cursor);expect(entries).toEqual([]);record('complete-report-list',entries);
  31 |   await page.goto('about:blank');expect(page.url()).toBe('about:blank');intent('delete-plan');const deletedPlan=await getTestState('lz-ppm',{what:'deleteFixture',planId});expect(deletedPlan).toMatchObject({deleted:planId,registryRemoved:true});ack('delete-plan',deletedPlan);
  32 |   for(let n=0;n<2;n++){const absent=await getTestState('lz-ppm',{what:'plan',planId});expect(absent.meta==null).toBe(true);expect(absent.issues).toEqual([]);expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual(originals);record('plan-absent',absent);}
  33 |   const ownedIssue=await rest('GET',issueUrl);expect(ownedIssue.status).toBe(200);expect(ownedIssue.data).toEqual(admission.issue);intent('delete-issue');const deletedIssue=await rest('DELETE',`/rest/api/3/issue/${issueKey}`);expect(deletedIssue.status).toBe(204);ack('delete-issue',deletedIssue);for(let n=0;n<2;n++){const absent=await rest('GET',issueUrl);expect(absent.status).toBe(404);record('issue-absent',absent);}
  34 |   const ownedVersion=await rest('GET',`/rest/api/3/version/${versionId}`);expect(ownedVersion.status).toBe(200);expect(ownedVersion.data).toEqual(admission.version);const zeroCounts=await rest('GET',`/rest/api/3/version/${versionId}/relatedIssueCounts`);expect(zeroCounts.status).toBe(200);expectCounts(zeroCounts.data,0);record('same-object-zero-usage',zeroCounts);intent('delete-release');const deletedVersion=await rest('DELETE',`/rest/api/3/version/${versionId}`);expect(deletedVersion.status).toBe(204);ack('delete-release',deletedVersion);for(let n=0;n<2;n++){const absent=await rest('GET',`/rest/api/3/version/${versionId}`);expect(absent.status).toBe(404);record('release-absent',absent);}
> 35 |   const finalFrame=await openPlans(page);await expect(finalFrame.locator('body')).toContainText(/V4\.58\.579/);await expect(finalFrame.locator('.lz-card',{hasText:'LZPT Scenarios'})).toContainText(/45\s*ISSUES/i);await expect(finalFrame.locator('.lz-card',{hasText:'LZPT Scenarios'})).toContainText(/0\s*DRAFTS/i);await expect(finalFrame.getByRole('button',{name:/Open plan/})).toHaveCount(3);await settledScreenshot(page,{subject:finalFrame.locator('.lz-card',{hasText:'LZPT Scenarios'}),path:info.outputPath('original-three-plans-restored.png'),fullPage:true});
     |                                                                                   ^ Error: expect(locator).toContainText(expected) failed
  36 |   const finalReading=actualResponse(page,'getCapacitySettings');await finalFrame.getByRole('button',{name:'Capacity',exact:true}).click();expect(await finalReading).toEqual(settings);await expect(finalFrame.locator('[data-testid="capacity-view"]').getByRole('status')).toHaveCount(0,{timeout:120000});await expect(finalFrame.locator('[data-testid="capacity-cell"]')).toHaveCount(0);await expect(finalFrame.locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(0);await settledScreenshot(page,{subject:finalFrame.getByRole('heading',{name:'Portfolio capacity',exact:true}),path:info.outputPath('private-settings-still-empty.png'),fullPage:true});journal.complete=true;
  37 |  }catch(error){bodyError=error;journal.error=String(error);throw error;}
  38 |  finally{
  39 |   const auditErrors:any[]=[];
  40 |   try{record('final-original-source',await sourceAudit());}catch(error){auditErrors.push(error);}
  41 |   try{const plans=(await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort();record('final-registry',plans);if(journal.complete)expect(plans).toEqual(originals);}catch(error){auditErrors.push(error);}
  42 |   try{if(settings){const current=await rpc.invoke('getCapacitySettings',{});record('final-private-settings',current);expect(current).toEqual(settings);}}catch(error){auditErrors.push(error);}
  43 |   if(auditErrors.length){journal.complete=false;journal.auditErrors=auditErrors.map(String);}rpc.stop();save();if(auditErrors.length)throw new AggregateError([...(bodyError?[bodyError]:[]),...auditErrors],'Cleanup and independent final audit errors');
  44 |  }
  45 | });
  46 | 
```
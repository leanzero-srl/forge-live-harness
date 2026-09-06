import {assetsConfigured} from './assets-readiness';
import fs from 'node:fs';
import {test,expect} from '../../fixtures/forge';
import {get,put,BASE} from '../../data/jira.mjs';
import {requireEnv} from '../../data/env.mjs';
import {getTestState} from '../../testhook/client';
import {LZPT_PLAN,scheduleFields} from './forecast-fixture';
import {withOwnedSchedule,table,row,editDuration,review} from './normalization-owned-fixture';
import {settledScreenshot} from './settled-screenshot.mjs';
test.describe.configure({retries:0,timeout:900000});
const workspace='be9cca2f-5f41-446f-8f5c-76cda0be8417',multiple='customfield_11148',gate='customfield_11149';
const prefix='[harness-test] LZ Assets owned 20260905';
const fieldNames:Record<string,string>={[multiple]:`${prefix} multiple`,[gate]:`${prefix} gate`};
const identity=(id:string)=>`${workspace}:${id}`;
const refs=(ids:string[])=>ids.map(objectId=>({workspaceId:workspace,objectId,id:identity(objectId)}));
async function asset(method:string,id:string,label?:string){
 expect(BASE).toBe('https://wolfaenpak.atlassian.net');expect(['411','412','413']).toContain(id);
 const response=await fetch(`https://api.atlassian.com/jsm/assets/workspace/${workspace}/v1/object/${id}`,{method,headers:{Authorization:'Basic '+Buffer.from(`${requireEnv('JIRA_ADMIN_EMAIL')}:${requireEnv('JIRA_API_TOKEN')}`).toString('base64'),'Content-Type':'application/json'},...(label?{body:JSON.stringify({objectTypeId:'43',attributes:[{objectTypeAttributeId:'156',objectAttributeValues:[{value:label}]}]})}:{})});
 expect(response.status).toBe(200);const body=await response.json();return{id:String(body.id),key:body.objectKey,label:body.label,type:String(body.objectType.id)};
}
async function configure(frame:any){
 const bar=frame.locator('[data-testid="assets-filter-bar"]');await bar.getByRole('button',{name:'Configure fields',exact:true}).click();
 for(const field of [multiple,gate])await bar.getByTitle(`Configure ${fieldNames[field]}`,{exact:true}).click();
 await bar.getByRole('button',{name:'Save fields',exact:true}).click();await assetsConfigured(frame,bar,2);return bar;
}
const field=(bar:any,id:string)=>bar.locator('.lz-assets-field').filter({hasText:fieldNames[id]});
async function mode(frame:any,bar:any,id:string,name:string){await field(bar,id).getByRole('combobox').click();await frame.getByRole('option',{name,exact:true}).click();}
async function object(bar:any,id:string,objectId:string){await field(bar,id).getByTitle(new RegExp(`^Filter .*${identity(objectId)}$`)).click();}
async function exactRows(frame:any,keys:string[]){await expect.poll(()=>frame.locator('[data-testid="table-row"]').evaluateAll((rows:any[])=>rows.map(r=>r.getAttribute('data-row-key')).sort())).toEqual([...keys].sort());}
async function readMatrix(){const result=[];for(const key of ['JT-74','JT-75','JT-76']){const issue=await get(`/rest/api/3/issue/${key}?fields=project,summary,${multiple},${gate}`);expect(issue.fields.project.key).toBe('JT');expect(issue.fields.summary).toContain(prefix);result.push({key,summary:issue.fields.summary,multiple:issue.fields[multiple],gate:issue.fields[gate]});}return result;}
async function protectedRows(){const rows=[];for(const key of ['JT-56','JT-16']){const i=await get(`/rest/api/3/issue/${key}?fields=customfield_11081,customfield_10015,customfield_10180,duedate`);rows.push({key,fields:i.fields});}return rows;}

test('native Assets: actual multi-object ANY, second-field AND, empty and no-match, complete combination grouping, saved filters and object rename preserve source',async({page},info)=>{
 const source=await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN}),registry=(await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort();
 const before=await readMatrix(),shared=await protectedRows();
 expect(before.map(r=>({key:r.key,multiple:r.multiple.map((v:any)=>String(v.objectId)).sort(),gate:r.gate.map((v:any)=>String(v.objectId)).sort()}))).toEqual([{key:'JT-74',multiple:['411','412'],gate:['411']},{key:'JT-75',multiple:['412'],gate:['413']},{key:'JT-76',multiple:[],gate:['411']}]);
 const original=await asset('GET','411');expect(original).toEqual({id:'411',key:'CRT-411',label:`${prefix} A`,type:'43'});
 const renamed=`${prefix} A live rename ${Date.now().toString(36)}`,name=`[harness-test] Native Assets ${Date.now().toString(36)}`;let planId:string|undefined;
 const journal:any={name,fixtureKeys:before.map(r=>r.key),original,renameRequested:false};const retain=()=>fs.writeFileSync(info.outputPath('native-assets-journal.json'),JSON.stringify(journal,null,2));fs.mkdirSync(info.outputDir,{recursive:true});retain();
 try{
  const created=await getTestState('lz-ppm',{what:'createFixture',name,jql:'key IN (JT-74,JT-75,JT-76) ORDER BY key'});planId=created.planId;journal.planId=planId;retain();expect(created.issues.map((i:any)=>i.key).sort()).toEqual(before.map(r=>r.key).sort());
  let frame=await table(page,name),bar=await configure(frame);await exactRows(frame,['JT-74','JT-75','JT-76']);
  for(const item of before){const m=row(frame,item.key).locator(`[data-testid="table-asset-value"][data-field-id="${multiple}"]`),g=row(frame,item.key).locator(`[data-testid="table-asset-value"][data-field-id="${gate}"]`);for(const value of item.multiple)await expect(m).toContainText(`CRT-${value.objectId}`,{timeout:120000});for(const value of item.gate)await expect(g).toContainText(`CRT-${value.objectId}`);if(!item.multiple.length)await expect(m).toHaveText('No object');}
  await mode(frame,bar,multiple,'Any selected object');await object(bar,multiple,'411');await object(bar,multiple,'412');await exactRows(frame,['JT-74','JT-75']);
  await mode(frame,bar,gate,'Any selected object');await object(bar,gate,'411');await exactRows(frame,['JT-74']);await expect(bar.locator('[data-testid="assets-match-count"]')).toHaveText('1 matching tasks of 3');
  await settledScreenshot(page,{subject:row(frame,'JT-74'),path:info.outputPath('assets-multiple-any-second-field-and.png'),fullPage:true});
  frame=await table(page,name);bar=frame.locator('[data-testid="assets-filter-bar"]');await exactRows(frame,['JT-74']);await bar.getByRole('button',{name:/^Assets/}).first().click();
  await mode(frame,bar,multiple,'Empty field');await exactRows(frame,['JT-76']);await object(bar,gate,'411');await object(bar,gate,'413');await exactRows(frame,[]);await expect(bar.locator('[data-testid="assets-match-count"]')).toHaveText('0 matching tasks of 3');
  await bar.getByRole('button',{name:'Clear Assets filters',exact:true}).click();await exactRows(frame,['JT-74','JT-75','JT-76']);
  await frame.getByRole('combobox').filter({hasText:'No grouping'}).click();await frame.getByRole('option',{name:`Assets: ${fieldNames[multiple]}`,exact:true}).click();const groups=frame.locator('[data-testid="table-group-header"]');await expect(groups).toHaveCount(3);
  for(const group of await groups.all())await expect(group).toHaveAttribute('data-group-count','1');await exactRows(frame,['JT-74','JT-75','JT-76']);await expect(groups.filter({hasText:'CRT-411'})).toContainText('CRT-412');
  await settledScreenshot(page,{subject:row(frame,'JT-74'),path:info.outputPath('assets-combination-groups-each-issue-once.png'),fullPage:true});
  await frame.getByPlaceholder('Filter tasks…').fill('JT-75');await exactRows(frame,['JT-75']);await expect(groups).toHaveCount(1);await frame.getByPlaceholder('Filter tasks…').fill('');
  await mode(frame,bar,multiple,'Any selected object');await object(bar,multiple,'411');await exactRows(frame,['JT-74']);
  journal.renameRequested=true;retain();expect((await asset('PUT','411',renamed)).label).toBe(renamed);expect((await asset('GET','411')).label).toBe(renamed);
  await bar.getByRole('button',{name:'Refresh Assets',exact:true}).click();await expect(row(frame,'JT-74').locator(`[data-field-id="${multiple}"]`)).toContainText(renamed,{timeout:120000});await exactRows(frame,['JT-74']);await expect(groups).toContainText(renamed);await expect(field(bar,multiple).getByTitle(new RegExp(`${identity('411')}$`))).toHaveAttribute('aria-checked','true');
  await settledScreenshot(page,{subject:row(frame,'JT-74'),path:info.outputPath('assets-renamed-object-stable-selection.png'),fullPage:true});journal.renameRefreshVerified=true;retain();
  expect(await readMatrix()).toEqual(before);expect(await protectedRows()).toEqual(shared);
 }finally{
  if(journal.renameRequested){const current=await asset('GET','411');expect([original.label,renamed]).toContain(current.label);if(current.label===renamed)await asset('PUT','411',original.label);expect(await asset('GET','411')).toEqual(original);journal.originalLabelRestored=true;retain();}
  if(!page.isClosed())await page.goto('about:blank');if(!planId)planId=(await getTestState('lz-ppm',{what:'plans'})).plans.find((p:any)=>p.name===name)?.id;if(planId){await getTestState('lz-ppm',{what:'clearDrafts',planId});await getTestState('lz-ppm',{what:'deleteFixture',planId});}
  expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual(registry);expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(scheduleFields(source.issues));expect(await readMatrix()).toEqual(before);expect(await protectedRows()).toEqual(shared);journal.cleanup=true;retain();
 }
});

test('native Assets: filtered-out successor still cascades and explicit Apply writes both actual Jira schedules without altering either native field',async({page},info)=>{
 await withOwnedSchedule(page,info,[{label:'Assets visible predecessor',duration:5,start:'2026-03-02',due:'2026-03-06'},{label:'Assets hidden successor',duration:5,start:'2026-03-09',due:'2026-03-13'}],async(f)=>{
  const[pred,succ]=f.keys;const expectedAssets:Record<string,Record<string,ReturnType<typeof refs>>>={[pred]:{[multiple]:refs(['411','412']),[gate]:refs(['411'])},[succ]:{[multiple]:refs(['412']),[gate]:refs(['413'])}};
  for(const key of f.keys){await f.read(key);await put(`/rest/api/3/issue/${key}`,{fields:expectedAssets[key]});}
  const readAssets=async()=>Promise.all(f.keys.map(async(key:string)=>{const actual=await get(`/rest/api/3/issue/${key}?fields=${multiple},${gate}`);expect(actual.fields).toEqual(expectedAssets[key]);return{key,fields:actual.fields};}));const before=await readAssets();
  await getTestState('lz-ppm',{what:'refreshPlan',planId:f.planId});const frame=await table(page,f.name),bar=await configure(frame);await expect(row(frame,pred).locator(`[data-field-id="${multiple}"]`)).toContainText('CRT-411',{timeout:120000});
  await mode(frame,bar,multiple,'Any selected object');await object(bar,multiple,'411');await exactRows(frame,[pred]);await frame.getByRole('button',{name:/^Gantt/i}).first().click();await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);await expect(frame.locator('[data-testid="gantt-row"]')).toHaveCount(1);await expect(frame.locator('[data-testid="gantt-row"]')).toHaveAttribute('data-row-key',pred);await settledScreenshot(page,{subject:frame.locator(`[data-testid="gantt-row"][data-row-key="${pred}"]`),path:info.outputPath('assets-filter-gantt-keeps-visible-predecessor.png'),fullPage:true});await frame.getByRole('button',{name:/^Table/i}).first().click();await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);await editDuration(frame,pred,'6');await expect(row(frame,pred)).toHaveAttribute('data-row-due','2026-03-09');await expect(row(frame,succ)).toHaveCount(0);
  const dialog=await review(frame);await expect(dialog.locator('[data-testid="apply-change-row"]')).toHaveCount(2);await expect(dialog).toContainText(succ);await settledScreenshot(dialog,{path:info.outputPath('assets-hidden-successor-full-apply-review.png')});await dialog.getByRole('button',{name:/^Apply 2 Changes/i}).click();await expect(frame.getByText('Successfully wrote 2 issues',{exact:true})).toBeVisible({timeout:120000});
  const expected=[{key:pred,start:'2026-03-02',due:'2026-03-09',duration:6},{key:succ,start:'2026-03-10',due:'2026-03-16',duration:5}];await expect.poll(()=>Promise.all(f.keys.map((key:string)=>f.read(key))),{timeout:60000}).toEqual(expected);expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(expected);expect(await readAssets()).toEqual(before);
  await bar.getByRole('button',{name:'Clear Assets filters',exact:true}).click();await exactRows(frame,f.keys);for(const item of expected){await expect(row(frame,item.key)).toHaveAttribute('data-row-start',item.start);await expect(row(frame,item.key)).toHaveAttribute('data-row-due',item.due);await expect(row(frame,item.key)).toHaveAttribute('data-row-duration',String(item.duration));}await settledScreenshot(page,{subject:row(frame,pred),path:info.outputPath('assets-full-schedule-after-apply.png'),fullPage:true});await info.attach('actual-hidden-successor-second-reads',{body:JSON.stringify({expected,actual:await Promise.all(f.keys.map((key:string)=>f.read(key))),assets:await readAssets()}),contentType:'application/json'});
 },true);
});

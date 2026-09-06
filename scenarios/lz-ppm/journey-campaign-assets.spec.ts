import {assetsConfigured} from './assets-readiness';
import {settledScreenshot} from './settled-screenshot.mjs';
import fs from 'node:fs';
import {test,expect} from '../../fixtures/forge';
import {getTestState} from '../../testhook/client';
import {openPlan,scheduleFields,LZPT_PLAN} from './forecast-fixture';
// @ts-ignore real Jira positive control, read only in this journey
import {get,BASE} from '../../data/jira.mjs';
test.describe.configure({retries:0,timeout:600_000});
const FIELD='customfield_11081',KEY='JT-56',EMPTY='JT-16',IDENTITY='be9cca2f-5f41-446f-8f5c-76cda0be8417:71';
test('assets: native object label, exact matching and empty filters persist across reopen and refresh',async({page},info)=>{
 expect(BASE).toBe('https://wolfaenpak.atlassian.net');
 const source=(await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues;
 const registry=(await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort();
 const populated=await get(`/rest/api/3/issue/${KEY}?fields=project,labels,${FIELD}`);expect(populated.fields.project.key).toBe('JT');expect(populated.fields[FIELD].map((v:any)=>`${v.workspaceId}:${v.objectId}`)).toEqual([IDENTITY]);
 const empty=await get(`/rest/api/3/issue/${EMPTY}?fields=${FIELD}`);expect(Object.hasOwn(empty.fields,FIELD)).toBe(true);expect(empty.fields[FIELD]).toEqual([]);
 const name=`[harness-test] Assets campaign ${Date.now().toString(36)}`;let planId:string|undefined;
 const persist=(data:any)=>{fs.mkdirSync(info.outputDir,{recursive:true});fs.writeFileSync(info.outputPath('assets-fixture-journal.json'),JSON.stringify({name,planId,sourceKeys:[KEY,EMPTY],...data},null,2));};persist({phase:'start'});
 try{
  const created=await getTestState('lz-ppm',{what:'createFixture',name,jql:`key IN (${KEY},${EMPTY}) ORDER BY key`});planId=created.planId;persist({phase:'created'});expect(created.issues.map((i:any)=>i.key).sort()).toEqual([EMPTY,KEY].sort());
  let frame=await openPlan(page,name);await frame.getByRole('button',{name:/^Table/i}).first().click();let bar=frame.locator('[data-testid="assets-filter-bar"]');
  await bar.getByRole('button',{name:'Configure fields',exact:true}).click();await bar.getByTitle('Configure COGTEST Asset',{exact:true}).click();await bar.getByRole('button',{name:'Save fields',exact:true}).click();
  await assetsConfigured(frame,bar,1);
  const value=frame.locator(`[data-testid="table-row"][data-row-key="${KEY}"] [data-testid="table-asset-value"]`);
  await expect(value).toContainText('CRT-71',{timeout:90_000});await expect(value).toContainText('MacBook Pro');
  const chooseMode=async(label:string)=>{await bar.getByRole('combobox').click();await frame.getByRole('option',{name:label,exact:true}).click();};
  await chooseMode('Any selected object');await bar.getByTitle(new RegExp(`^Filter .*${IDENTITY}$`)).click();
  await expect(bar.locator('[data-testid="assets-match-count"]')).toHaveText('1 matching tasks of 2');
  await expect(frame.locator('[data-testid="table-row"]')).toHaveCount(1);await expect(frame.locator('[data-testid="table-row"]')).toHaveAttribute('data-row-key',KEY);
  await settledScreenshot(page,{subject:value,path:info.outputPath('assets-native-match.png'),fullPage:true,animations:'disabled'});
  frame=await openPlan(page,name);await frame.getByRole('button',{name:/^Table/i}).first().click();bar=frame.locator('[data-testid="assets-filter-bar"]');
  await expect(bar.locator('[data-testid="assets-match-count"]')).toHaveText('1 matching tasks of 2',{timeout:90_000});await expect(frame.locator('[data-testid="table-row"]')).toHaveAttribute('data-row-key',KEY);
  const refreshed=page.waitForResponse((r:any)=>r.status()===200&&(r.request().postData()||'').includes('getPlanAssets'),{timeout:90_000});
  await bar.getByRole('button',{name:'Refresh Assets',exact:true}).click();await (await refreshed).finished();await expect(bar.locator('[data-testid="assets-match-count"]')).toHaveText('1 matching tasks of 2',{timeout:90_000});await expect(frame.locator('[data-testid="table-row"]')).toHaveAttribute('data-row-key',KEY);
  await bar.getByRole('button',{name:/^Assets/}).first().click();await chooseMode('Empty field');await expect(bar.locator('[data-testid="assets-match-count"]')).toHaveText('1 matching tasks of 2');await expect(frame.locator('[data-testid="table-row"]')).toHaveAttribute('data-row-key',EMPTY);
  await bar.getByRole('button',{name:'Clear Assets filters',exact:true}).click();await expect(frame.locator('[data-testid="table-row"]')).toHaveCount(2);await expect(frame.locator(`[data-row-key="${KEY}"] [data-testid="table-asset-value"]`)).toContainText('CRT-71');
  expect((await getTestState('lz-ppm',{what:'plan',planId:planId!})).issues.map((i:any)=>i.key).sort()).toEqual([EMPTY,KEY].sort());
  expect((await get(`/rest/api/3/issue/${KEY}?fields=${FIELD}`)).fields[FIELD]).toEqual(populated.fields[FIELD]);expect((await get(`/rest/api/3/issue/${EMPTY}?fields=${FIELD}`)).fields[FIELD]).toEqual([]);
  await settledScreenshot(page,{subject:value,path:info.outputPath('assets-clear-all-values.png'),fullPage:true,animations:'disabled'});persist({phase:'verified'});
 }finally{
  await page.goto('about:blank');if(!planId)planId=(await getTestState('lz-ppm',{what:'plans'})).plans.find((p:any)=>p.name===name)?.id;
  if(planId){await getTestState('lz-ppm',{what:'clearDrafts',planId});await getTestState('lz-ppm',{what:'deleteFixture',planId});}
  expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual(registry);expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(scheduleFields(source));persist({phase:'deleted',registryUnchanged:true,sourceUnchanged:true});
 }
});

import {setReportDepartureOwner,stopReportUi,reportDepartureFailure} from './report-departure';
import {waitForAppReady} from './settled-screenshot.mjs';
import fs from 'node:fs';
import { expect } from '../../fixtures/forge';
import { getTestState } from '../../testhook/client';
import { openPlan, scheduleFields, LZPT_PLAN, waitForIssueReload } from './forecast-fixture';
// @ts-ignore REST helpers operate on real, owned wolfaenpak issues.
import { get, post, put, request, BASE } from '../../data/jira.mjs';

export type Seed = { label: string; start: string; due: string; duration: number | null; release?: boolean };
export async function withOwnedSchedule(page: any, info: any, seeds: Seed[], work: (f: any) => Promise<void>, linked: boolean | Array<[number, number]> = false, primaryIndexes?: number[]) {
  expect(BASE).toBe('https://wolfaenpak.atlassian.net');
  const before = await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN });
  const registry = (await getTestState('lz-ppm', { what: 'plans' })).plans.map((p: any) => p.id).sort();
  const fields = (await getTestState('lz-ppm', { what: 'fieldConfig' })).fields;
  expect(fields).toMatchObject({ startDate: 'customfield_10015', dueDate: 'duedate', duration: 'customfield_10180' });
  const marker = `lz-norm-${Date.now().toString(36)}`;
  const name = `[harness-test] ${marker}`;
  const journal: any = { marker, name, time: new Date().toISOString(), issues: [], planId: null, cleanup: [] };
  const persist = () => fs.writeFileSync(info.outputPath('fixture-journal.json'), JSON.stringify(journal, null, 2));
  fs.mkdirSync(info.outputDir, { recursive: true }); persist();
  const read = async (key: string) => {
    expect(journal.issues.some((i: any) => i.key === key), 'REST target belongs to this test').toBe(true);
    const issue = await get(`/rest/api/3/issue/${key}?fields=project,labels,summary,${fields.startDate},${fields.dueDate},${fields.duration}`);
    expect(issue.fields.project.key).toBe('WFH'); expect(issue.fields.labels).toContain(marker);
    return { key, start: issue.fields[fields.startDate], due: issue.fields[fields.dueDate], duration: issue.fields[fields.duration] };
  };
  let bodyError:any,recoveryRetention:any;
  try {
    // Same-project, same-type positive control. Field absence is not null.
    const control = await get('/rest/api/3/issue/WFH-1990?fields=project,issuetype,customfield_10180,customfield_10015,duedate');
    expect(control.fields.project.key).toBe('WFH'); expect(control.fields.issuetype.id).toBe('10004');
    for (const id of [fields.startDate, fields.dueDate, fields.duration]) expect(Object.hasOwn(control.fields, id), id).toBe(true);
    const meta = await get('/rest/api/3/issue/createmeta/WFH/issuetypes');
    expect(meta.issueTypes.some((t: any) => t.id === '10004')).toBe(true);
    if (seeds.some((seed) => seed.release)) {
      journal.version = await post('/rest/api/3/version', {name, projectId:Number(control.fields.project.id)}); persist();
      expect(journal.version.name).toBe(name);
    }
    for (const seed of seeds) {
      const created = await post('/rest/api/3/issue', { fields: { project: { key: 'WFH' }, issuetype: { id: '10004' }, summary: `${name} ${seed.label}`, labels: [marker] } });
      journal.issues.push({ key: created.key, seed }); persist();
      await put(`/rest/api/3/issue/${created.key}`, { fields: { [fields.startDate]: seed.start, [fields.dueDate]: seed.due, [fields.duration]: seed.duration, ...(seed.release ? {fixVersions:[{id:journal.version.id}]} : {}) } });
      expect(await read(created.key)).toEqual({ key: created.key, start: seed.start, due: seed.due, duration: seed.duration });
    }
    const linkPairs: Array<[number, number]> = linked === true ? [[0, 1]] : linked || [];
    if (linked === true) expect(journal.issues).toHaveLength(2);
    if (linkPairs.length) {
      const types = await get('/rest/api/3/issueLinkType');
      const type = types.issueLinkTypes.find((t: any) => t.outward.toLowerCase() === 'blocks'); expect(type).toBeTruthy();
      for (const [from, to] of linkPairs) {
        expect(Number.isInteger(from) && Number.isInteger(to) && from !== to).toBe(true);
        expect(journal.issues[from]).toBeTruthy(); expect(journal.issues[to]).toBeTruthy();
        await post('/rest/api/3/issueLink', { type: { id: type.id }, inwardIssue: { key: journal.issues[from].key }, outwardIssue: { key: journal.issues[to].key } });
      }
      journal.linkPairs = linkPairs.map(([from, to]) => ({from:journal.issues[from].key,to:journal.issues[to].key})); persist();
    }
    const primaryIssues=primaryIndexes ? primaryIndexes.map(index=>journal.issues[index]) : journal.issues;
    expect(primaryIssues.length).toBeGreaterThan(0);for(const issue of primaryIssues)expect(issue).toBeTruthy();expect(new Set(primaryIssues.map((i:any)=>i.key)).size).toBe(primaryIssues.length);
    const fixtureJql = `key in (${primaryIssues.map((i: any) => i.key).join(',')}) ORDER BY Rank ASC`;
    // Direct GET is strongly visible before Jira's search index necessarily is.
    // Wait for the exact owned rows and all seeded schedule fields in real JQL.
    const indexedExpected = primaryIssues.map((i:any)=>({key:i.key,start:i.seed.start,due:i.seed.due,duration:i.seed.duration})).sort((a:any,b:any)=>a.key.localeCompare(b.key));
    await expect.poll(async()=>{
      const indexed = await post('/rest/api/3/search/jql',{jql:fixtureJql,maxResults:100,fields:[fields.startDate,fields.dueDate,fields.duration]});
      return indexed.issues.map((i:any)=>({key:i.key,start:i.fields[fields.startDate],due:i.fields[fields.dueDate],duration:i.fields[fields.duration]})).sort((a:any,b:any)=>a.key.localeCompare(b.key));
    },{timeout:60000,intervals:[500,1000,2000],message:'new fixture is searchable with complete seeded schedule'}).toEqual(indexedExpected);
    journal.searchIndexVerified = indexedExpected; persist();
    let created = await getTestState('lz-ppm', { what: 'createFixture', name, jql: fixtureJql });
    journal.planId = created.planId; persist();setReportDepartureOwner(page,journal.planId,name);
    const indexedShape=(rows:any[])=>rows.map((i:any)=>({key:i.key,start:i.startDate,due:i.dueDate,duration:i.duration})).sort((a:any,b:any)=>a.key.localeCompare(b.key));
    journal.forgeIndexObservations=[indexedShape(created.issues)]; persist();
    if (JSON.stringify(indexedShape(created.issues)) !== JSON.stringify(indexedExpected)) {
      // Jira asApp search can lag the external REST reader independently. This
      // is fixture setup only: refresh the SAME owned plan until complete.
      await expect.poll(async()=>{
        await getTestState('lz-ppm',{what:'refreshPlan',planId:journal.planId});
        const refreshed=await getTestState('lz-ppm',{what:'plan',planId:journal.planId});created={...created,...refreshed};
        const observation=indexedShape(created.issues);journal.forgeIndexObservations.push(observation);persist();return observation;
      },{timeout:90000,intervals:[1000,3000,5000],message:'Forge reader sees the complete owned fixture schedule'}).toEqual(indexedExpected);
    }
    expect(created.issues.map((i: any) => i.key).sort()).toEqual(primaryIssues.map((i: any) => i.key).sort());
    for (const i of primaryIssues) expect(created.issues.find((r: any) => r.key === i.key)).toMatchObject({ duration: i.seed.duration, startDate: i.seed.start, dueDate: i.seed.due });
    for (const [from, to] of linkPairs) expect(created.issues.find((i: any) => i.key === journal.issues[to].key).predecessors).toContain(journal.issues[from].key);
    await work({ planId: journal.planId, name, retainForRecovery:(error:any,additionalPlans:any[]=[])=>{
      expect(['LZ_CAPACITY_SETTINGS_RECOVERY_REQUIRED','LZ_REPORT_CAPTURE_RECOVERY_REQUIRED']).toContain(error?.code);
      for(const item of additionalPlans){expect(typeof item.id).toBe('string');expect(item.name.startsWith(name+' ')).toBe(true);expect(registry).not.toContain(item.id);}
      recoveryRetention={reason:error.message,code:error.code,settingsState:error.settingsState||recoveryRetention?.settingsState,reportState:error.reportState||recoveryRetention?.reportState,additionalPlans:[...new Map([...(recoveryRetention?.additionalPlans||[]),...additionalPlans].map((p:any)=>[p.id,p])).values()],causes:[...(recoveryRetention?.causes||[]),{code:error.code,reason:error.message}],time:new Date().toISOString()};journal.recoveryRetention=recoveryRetention;persist();
    }, keys: journal.issues.map((i: any) => i.key), read, fields, version: journal.version });
  } catch(error) {
    bodyError=error;journal.bodyError={name:(error as any)?.name,message:String((error as any)?.message||error)};persist();
  } finally {
    const cleanupErrors:any[]=[];
    const attempt=async(stage:string,action:()=>Promise<void>)=>{
      try{await action();}catch(error){cleanupErrors.push(error);journal.cleanupErrors??=[];journal.cleanupErrors.push({stage,name:(error as any)?.name,message:String((error as any)?.message||error)});persist();}
    };
    // Independent owned resources must still be cleaned if a sibling fails.
    // Every issue retains its own positive ownership check before deletion.
    await attempt('stop-owned-ui',async()=>stopReportUi(page,async()=>{if(!page.isClosed())await page.goto('about:blank').catch(async(error:any)=>{await page.close().catch(()=>{});if(!page.isClosed())throw error;journal.browserAlreadyClosedDuringCleanup=String(error.message);persist();});}));
    const departureFailure=reportDepartureFailure(page);if(departureFailure){recoveryRetention={...recoveryRetention,reason:departureFailure.message,code:departureFailure.code,reportState:departureFailure.reportState,additionalPlans:recoveryRetention?.additionalPlans||[],causes:[...(recoveryRetention?.causes||[]),{code:departureFailure.code,reason:departureFailure.message}],time:new Date().toISOString()};journal.recoveryRetention=recoveryRetention;persist();}
    if(recoveryRetention){
      const retainedPlans=[{id:journal.planId,name},...recoveryRetention.additionalPlans];
      for(const item of retainedPlans)await attempt(`verify-retained-plan:${item.id}`,async()=>{const current=await getTestState('lz-ppm',{what:'plan',planId:item.id});expect(current.meta.name).toBe(item.name);});
      await attempt('retained-registry-integrity',async()=>{expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual([...registry,...retainedPlans.map(p=>p.id)].sort());});
      await attempt('standing-source-integrity',async()=>{expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(scheduleFields(before.issues));});
      journal.retainedForRecovery={plans:retainedPlans,issues:journal.issues,version:journal.version||null,reason:recoveryRetention.reason};journal.integrityPassed=false;persist();
      // Retention is a failed recovery boundary, never successful fixture cleanup.
      throw new AggregateError([...(bodyError?[bodyError]:[]),...cleanupErrors], recoveryRetention.reportState?'Report capture recovery required; exact owned fixtures retained, cleanup not passed':'Capacity settings recovery required; exact owned fixtures retained, cleanup not passed');
    }
    await attempt('resolve-owned-plan',async()=>{if(!journal.planId)journal.planId=(await getTestState('lz-ppm',{what:'plans'})).plans.find((p:any)=>p.name===name)?.id;});
    if(journal.planId)await attempt('delete-owned-plan',async()=>{
      await getTestState('lz-ppm',{what:'clearDrafts',planId:journal.planId});
      await getTestState('lz-ppm',{what:'deleteFixture',planId:journal.planId});
      journal.cleanup.push({plan:journal.planId,deleted:true});persist();
    });
    for(const issue of [...journal.issues].reverse())await attempt(`delete-owned-issue:${issue.key}`,async()=>{
      await read(issue.key);
      await request('DELETE',`/rest/api/3/issue/${issue.key}`);
      const absent=await request('GET',`/rest/api/3/issue/${issue.key}`,{raw:true});
      expect(absent.status).toBe(404);journal.cleanup.push({issue:issue.key,deleted:true});persist();
    });
    if(journal.version)await attempt('delete-owned-version',async()=>{
      const version=await get(`/rest/api/3/version/${journal.version.id}`);expect(version.name).toBe(name);expect(version.projectId).toBe(journal.version.projectId);
      await request('DELETE',`/rest/api/3/version/${journal.version.id}`);
      expect((await request('GET',`/rest/api/3/version/${journal.version.id}`,{raw:true})).status).toBe(404);
      journal.cleanup.push({version:journal.version.id,deleted:true});persist();
    });
    await attempt('registry-integrity',async()=>{expect((await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort()).toEqual(registry);});
    await attempt('standing-source-integrity',async()=>{expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN})).issues)).toEqual(scheduleFields(before.issues));});
    journal.integrityPassed=cleanupErrors.length===0;persist();console.log('OWNED_SCHEDULE_CLEANUP',JSON.stringify(journal));
    if(cleanupErrors.length)throw new AggregateError([...(bodyError?[bodyError]:[]),...cleanupErrors],'Owned schedule body/cleanup failures; every independent cleanup attempted');
    if(bodyError)throw bodyError;
  }
}

export const row = (frame: any, key: string) => frame.locator(`[data-testid="table-row"][data-row-key="${key}"]`);
export async function table(page: any, name: string) {
  const frame = await openPlan(page, name);
  await frame.getByRole('button', { name: /^Table/i }).first().click();
  await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  await waitForAppReady(frame.locator('[data-testid="table-row"]').first().or(frame.getByText(/^No tasks match /)).first());
  return frame;
}
export async function editDuration(frame: any, key: string, value: string) {
  await waitForAppReady(row(frame,key));
  // Fixed primary columns from TableView: selection,key,summary,start,due,duration.
  await row(frame, key).locator(':scope > div').nth(5).click();
  const input = row(frame, key).locator('input[inputmode="numeric"]');
  await expect(input).toBeVisible(); await input.fill(value); await input.press('Enter');
}
export async function save(frame: any) {
  const button = frame.locator('[data-testid="plan-save-btn"]');
  await expect(button).toHaveAttribute('data-has-changes', '1'); await button.click();
  await expect(button).toHaveAttribute('data-has-changes', '0', { timeout: 30_000 });
}
export async function refresh(page: any, frame: any, planId: string) {
  await frame.getByRole('button', { name: /^Dashboard/i }).first().click();
  const received = waitForIssueReload(page);
  expect((await getTestState('lz-ppm', { what: 'refreshPlan', planId })).ok).toBe(true);
  await frame.getByRole('button', { name: /^Table/i }).first().click();
  expect(await received).toEqual({ ok: true });
  await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
}
export async function review(frame: any) {
  await frame.getByRole('button', { name: /^Apply \d+ change/i }).first().click();
  const modal = frame.locator('[data-testid="apply-review-modal"]'); await expect(modal).toBeVisible(); return modal;
}
export async function discard(frame: any) {
  const modal = await review(frame); await modal.getByRole('button', { name: 'Discard All', exact: true }).click();
  await expect(modal).toHaveCount(0);
}
export async function snapshot(frame: any, key: string) {
  const r = row(frame, key); return { duration: await r.getAttribute('data-row-duration'), start: await r.getAttribute('data-row-start'), due: await r.getAttribute('data-row-due') };
}

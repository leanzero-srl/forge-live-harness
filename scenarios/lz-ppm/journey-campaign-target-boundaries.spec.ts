import {settledScreenshot} from './settled-screenshot.mjs';
import {test,expect} from '../../fixtures/forge';
import {get,put} from '../../data/jira.mjs';
import {getTestState} from '../../testhook/client';
import {withOwnedSchedule,table} from './normalization-owned-fixture';
import {openPlan} from './forecast-fixture';
import {planning,chooseDate,currentUserResolver} from './campaign-ui';
test.describe.configure({retries:0,timeout:900000});

test('targets: outside-release predecessor constrains finish; rename keeps identity, drift requires explicit refresh, empty scope and invalid date never yield success',async({page},info)=>{
 await withOwnedSchedule(page,info,[
  {label:'external predecessor',duration:5,start:'2026-03-02',due:'2026-03-06'},
  {label:'release member',duration:5,start:'2026-03-09',due:'2026-03-13',release:true},
  {label:'unrelated late branch',duration:5,start:'2026-12-07',due:'2026-12-11'},
 ],async(f)=>{
  const[pred,member,late]=f.keys,source=await Promise.all(f.keys.map((key:string)=>f.read(key)));
  const rpc=currentUserResolver(page,c=>c?.functionKey==='getTargets'&&c.payload?.planId===f.planId);let renamed=false;
  try{
   let frame=await table(page,f.name),work=await planning(frame);await work.getByRole('button',{name:'Targets',exact:true}).click();let panel=frame.locator('[data-testid="targets-editor"]');
   await panel.getByRole('button',{name:'Add target',exact:true}).click();const form=panel.locator('form');await form.getByLabel('Target name',{exact:true}).fill('Upstream constrained release');await expect(form.getByRole('button',{name:'Save target',exact:true})).toBeDisabled();
   await chooseDate(frame,form,'Target date','2026-03-20');await form.getByRole('combobox').click();await frame.getByRole('option',{name:`Release · ${f.name}`,exact:true}).click();await expect(form).toContainText('1 current leaf tasks');await form.getByRole('button',{name:'Save target',exact:true}).click();await expect(form).toHaveCount(0);
   let data=await rpc.invoke('getTargets',{planId:f.planId});expect(data.success).toBe(true);const target=data.targets.find((t:any)=>t.name==='Upstream constrained release');expect(target.scope.memberKeys).toEqual([member]);
   for(const date of ['', '2026-02-30','2026-13-01']){const invalid=await rpc.invoke('saveTarget',{planId:f.planId,expectedVersion:data.version,target:{...target,date}});expect(invalid.success).toBe(false);expect(invalid.error).toContain('real YYYY-MM-DD');}
   expect((await rpc.invoke('getTargets',{planId:f.planId})).targets).toEqual(data.targets);
   await frame.getByRole('button',{name:/^Dashboard/i}).first().click();let confidence=frame.locator('[data-testid="schedule-confidence"]');let targetRow=confidence.locator('[data-testid="sc-milestone"]').filter({hasText:target.name});await expect(targetRow).toHaveAttribute('data-probability','1');
   const sensitivity=frame.locator('[data-testid="finish-sensitivity"]');await sensitivity.getByRole('combobox').click();await sensitivity.getByRole('option',{name:target.name,exact:true}).click();await sensitivity.getByRole('button',{name:'Test finish sensitivity',exact:true}).click();await expect(sensitivity).toContainText('settled finish 2026-03-13');await sensitivity.getByRole('button',{name:'Show all tested tasks',exact:true}).click();await expect(sensitivity.locator('[data-testid="finish-effect"]')).toHaveCount(3);
   const outside=sensitivity.locator(`[data-testid="finish-effect"][data-key="${pred}"]`);await expect(outside.locator('td').nth(0)).toHaveText('2026-03-12 (1 calendar days earlier)');await expect(outside.locator('td').nth(1)).toHaveText('2026-03-16 (3 calendar days later)');
   const unrelated=sensitivity.locator(`[data-testid="finish-effect"][data-key="${late}"]`);for(const td of await unrelated.locator('td').all())await expect(td).toContainText('2026-03-13 (0 calendar days');await settledScreenshot(sensitivity,{path:info.outputPath('target-outside-predecessor-full-graph.png')});
   const reload=async()=>{await page.goto('about:blank');await getTestState('lz-ppm',{what:'refreshPlan',planId:f.planId});frame=await openPlan(page,f.name);await frame.getByRole('button',{name:/^Dashboard/i}).first().click();confidence=frame.locator('[data-testid="schedule-confidence"]');targetRow=confidence.locator('[data-testid="sc-milestone"]').filter({hasText:target.name});};
   await put(`/rest/api/3/version/${f.version.id}`,{name:f.name+' renamed'});renamed=true;expect((await get(`/rest/api/3/version/${f.version.id}`)).name).toBe(f.name+' renamed');await reload();await expect(targetRow).toHaveAttribute('data-probability','1');
   work=await planning(frame);await work.getByRole('button',{name:'Targets',exact:true}).click();panel=frame.locator('[data-testid="targets-editor"]');await expect(panel.locator('[data-testid="target-row"]')).toContainText(f.name+' renamed');expect((await rpc.invoke('getTargets',{planId:f.planId})).targets[0].scope.id).toBe(String(f.version.id));
   await f.read(pred);await put(`/rest/api/3/issue/${pred}`,{fields:{fixVersions:[{id:String(f.version.id)}]}});expect((await get(`/rest/api/3/issue/${pred}?fields=fixVersions`)).fields.fixVersions.map((v:any)=>v.id)).toEqual([String(f.version.id)]);await reload();
   await expect(targetRow).toHaveAttribute('data-available','0');await expect(targetRow).toHaveAttribute('data-probability','');await expect(targetRow).toContainText('Scope membership changed');await settledScreenshot(targetRow,{path:info.outputPath('target-drift-unavailable.png')});
   work=await planning(frame);await work.getByRole('button',{name:'Targets',exact:true}).click();panel=frame.locator('[data-testid="targets-editor"]');await panel.locator('[data-testid="target-row"]').getByRole('button',{name:'Refresh scope',exact:true}).click();await expect(panel).toContainText('Target scope refreshed');data=await rpc.invoke('getTargets',{planId:f.planId});expect(data.targets[0].scope.memberKeys).toEqual([pred,member].sort());
   await frame.getByRole('button',{name:/^Dashboard/i}).first().click();await expect(targetRow).toHaveAttribute('data-available','1');await expect(targetRow).toHaveAttribute('data-probability','1');
   for(const key of[pred,member]){await f.read(key);await put(`/rest/api/3/issue/${key}`,{fields:{fixVersions:[]}});expect((await get(`/rest/api/3/issue/${key}?fields=fixVersions`)).fields.fixVersions).toEqual([]);}await reload();
   await expect(targetRow).toHaveAttribute('data-available','0');await expect(targetRow).toHaveAttribute('data-probability','');await expect(targetRow).toContainText('no current members');
   work=await planning(frame);await work.getByRole('button',{name:'Targets',exact:true}).click();panel=frame.locator('[data-testid="targets-editor"]');await panel.locator('[data-testid="target-row"]').getByRole('button',{name:'Refresh scope',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('no current members');await settledScreenshot(panel,{path:info.outputPath('target-empty-cannot-refresh.png')});
   expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(source);
   await info.attach('scope-boundary-oracles',{body:JSON.stringify({target,externalPredecessor:pred,unrelated:late,refreshedMembers:data.targets[0].scope.memberKeys,sourceDatesUnchanged:true}),contentType:'application/json'});
  }finally{rpc.stop();if(renamed){const version=await get(`/rest/api/3/version/${f.version.id}`);expect(version.projectId).toBe(f.version.projectId);await put(`/rest/api/3/version/${f.version.id}`,{name:f.name});expect((await get(`/rest/api/3/version/${f.version.id}`)).name).toBe(f.name);}}
 },[[0,1]]);
});

// Explicit operator recovery only; never selected by the ordinary manifest.
import fs from 'node:fs';
import path from 'node:path';
import {test,expect} from '../../fixtures/forge';
import {getTestState} from '../../testhook/client';
import {openPlans,LZPT_PLAN} from './forecast-fixture';
import {actualResponse,currentUserResolver} from './campaign-ui';
import {settledScreenshot} from './settled-screenshot.mjs';
test.describe.configure({retries:0,timeout:180000});
test('operator recovery: sixth numeric crash exact acknowledged preferences restored while diagnostic fixtures remain retained',async({page},info)=>{
 test.skip(!process.env.LZ_SIXTH_NUMERIC_JOURNAL,'Explicit exact sixth crash journal is required');
 const sourcePath=path.resolve(process.env.LZ_SIXTH_NUMERIC_JOURNAL!),source=JSON.parse(fs.readFileSync(sourcePath,'utf8')),fixture=JSON.parse(fs.readFileSync(path.join(path.dirname(sourcePath),'fixture-journal.json'),'utf8'));
 expect(source.bodyError.message).toContain('download.saveAs: Target page, context or browser has been closed');expect(source.preferences.pending).toBeNull();expect(source.preferences.version).toBe(35);expect(source.preferences.restored).toBe(false);expect(source.originalPrivateSettingsRestored).toBe(false);expect(fixture.integrityPassed).toBe(false);
 expect(fixture.planId).toBe('plan-test-mtozislw-v816ze');expect(fixture.issues.map((i:any)=>i.key)).toEqual(['WFH-2847']);expect(fixture.version.id).toBe('10289');expect(fixture.cleanup).toEqual([]);
 const original=source.preferences.original,expected=source.preferences.lastOwned;expect(expected.selectedPlanIds).toEqual([LZPT_PLAN]);expect(original).toEqual({selectedPlanIds:[],profiles:{},issueChoices:{}});
 const journal:any={sourcePath,expectedAcknowledgedVersion:35,original,expected,fixture:{planId:fixture.planId,name:fixture.name,issues:fixture.issues,version:fixture.version},intent:null,restored:false,fixtureRetainedForDiagnosis:true};const retain=()=>fs.writeFileSync(info.outputPath('sixth-numeric-settings-recovery.json'),JSON.stringify(journal,null,2));retain();
 const rpc=currentUserResolver(page,c=>c?.functionKey==='getCapacitySettings');
 try{
  const currentFixture=await getTestState('lz-ppm',{what:'plan',planId:fixture.planId});expect(currentFixture.meta.name).toBe(fixture.name);expect(currentFixture.issues.map((i:any)=>i.key)).toEqual(['WFH-2847']);expect(currentFixture.issues[0]).toMatchObject({startDate:'2026-09-07',dueDate:'2026-09-11',duration:5});
  let frame=await openPlans(page);await expect(frame.locator('body')).toContainText(/REV\s+V4\.58\.579/i);let pending=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const before=await pending;journal.before=before;retain();
  expect(before.version,'No intervening settings generation is implicitly owned').toBe(35);expect(before.settings,'Do not overwrite anything except this exact acknowledged crash residue').toEqual(expected);
  journal.intent={settings:original,expectedVersion:before.version,time:new Date().toISOString()};retain();const saved=await rpc.invoke('saveCapacitySettings',{settings:original,expectedVersion:before.version});expect(saved.success).toBe(true);expect(saved.version).toBe(before.version+1);expect(saved.settings).toEqual(original);journal.acknowledged=saved;journal.intent=null;retain();
  const after=await rpc.invoke('getCapacitySettings');expect(after.success).toBe(true);expect(after.settings).toEqual(original);expect(after.version).toBe(saved.version);journal.after=after;retain();
  frame=await openPlans(page);pending=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const reopened=await pending;expect(reopened.settings).toEqual(original);expect(reopened.version).toBe(saved.version);journal.reopened=reopened;retain();
  const cap=frame.locator('[data-testid="capacity-view"]');await expect(cap.getByRole('status')).toHaveCount(0,{timeout:120000});for(const box of await cap.getByRole('checkbox').all())await expect(box).toHaveAttribute('aria-checked','false');await expect(cap.locator('[data-testid="capacity-cell"]')).toHaveCount(0);await settledScreenshot(cap,{path:info.outputPath('sixth-numeric-settings-restored.png')});
  const retained=await getTestState('lz-ppm',{what:'plan',planId:fixture.planId});expect(retained.meta.name).toBe(fixture.name);expect(retained.issues).toEqual(currentFixture.issues);journal.restored=true;retain();
 }catch(error){journal.error=String(error);retain();throw error;}finally{rpc.stop();}
});

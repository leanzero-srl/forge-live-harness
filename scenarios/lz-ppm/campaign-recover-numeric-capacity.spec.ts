// Explicit recovery of the fourth-cut Chrome crash residue, never feature proof.
import fs from 'node:fs';
import path from 'node:path';
import {test,expect} from '../../fixtures/forge';
import {openPlans,LZPT_PLAN} from './forecast-fixture';
import {actualResponse,currentUserResolver} from './campaign-ui';
import {settledScreenshot} from './settled-screenshot.mjs';
test.describe.configure({retries:0,timeout:180000});
test('operator recovery: restore exact pre-numeric-report Capacity preferences after verified browser crash',async({page},info)=>{
 test.skip(!process.env.LZ_NUMERIC_RECOVERY_JOURNAL,'Requires exact retained numeric crash and earlier successful restoration journals');
 const numericPath=path.resolve(process.env.LZ_NUMERIC_RECOVERY_JOURNAL!),originalPath=path.resolve(process.env.LZ_NUMERIC_ORIGINAL_SETTINGS_JOURNAL!);
 const numeric=JSON.parse(fs.readFileSync(numericPath,'utf8')),original=JSON.parse(fs.readFileSync(originalPath,'utf8'));
 const fixture=JSON.parse(fs.readFileSync(path.join(path.dirname(numericPath),'fixture-journal.json'),'utf8'));
 expect(numeric.originalPrivateSettingsRestored).toBe(false);expect(numeric.immutableAfterScheduleEffortProfileChanges).toBeUndefined();expect(fixture.integrityPassed).toBe(true);expect(fixture.cleanup.every((item:any)=>item.deleted)).toBe(true);
 expect(original.privateSettingsRestored).toBe(true);expect(original.originalSettings).toEqual({selectedPlanIds:[],profiles:{},issueChoices:{}});
 expect(numeric.capacityRows).toHaveLength(1);expect(numeric.availabilityRows).toHaveLength(1);const person=numeric.capacityRows[0].personId;expect(person).toBeTruthy();
 const expected={selectedPlanIds:[LZPT_PLAN],profiles:{[person]:numeric.availabilityRows[0].profile},issueChoices:{}};
 const journal:any={numericPath,originalPath,expectedOwnedResidue:expected,originalSettings:original.originalSettings};const retain=()=>fs.writeFileSync(info.outputPath('numeric-capacity-recovery.json'),JSON.stringify(journal,null,2));retain();
 const rpc=currentUserResolver(page,c=>c?.functionKey==='getCapacitySettings');
 try{
  let frame=await openPlans(page);await expect(frame.locator('body')).toContainText(/REV\s+V4\.58\.578/i);
  const read=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const before=await read;journal.before=before;retain();
  expect(before.settings,'refuse overwriting any settings other than the exact owned residue').toEqual(expected);
  const saved=await rpc.invoke('saveCapacitySettings',{settings:original.originalSettings,expectedVersion:before.version});expect(saved.success).toBe(true);
  const after=await rpc.invoke('getCapacitySettings');expect(after.success).toBe(true);expect(after.settings).toEqual(original.originalSettings);journal.after=after;retain();
  frame=await openPlans(page);const reread=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const reopened=await reread;expect(reopened.settings).toEqual(original.originalSettings);
  const cap=frame.locator('[data-testid="capacity-view"]');await expect(cap.getByRole('status')).toHaveCount(0);await expect(cap.locator('[data-testid="capacity-cell"]')).toHaveCount(0);for(const box of await cap.getByRole('checkbox').all())await expect(box).toHaveAttribute('aria-checked','false');
  await settledScreenshot(cap,{path:info.outputPath('numeric-capacity-preferences-restored.png')});journal.reopened=reopened;journal.restored=true;retain();
 }finally{rpc.stop();}
});

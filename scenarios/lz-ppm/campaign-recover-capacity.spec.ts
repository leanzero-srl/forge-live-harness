// Explicit operator recovery only. Not a product feature or campaign acceptance.
import fs from 'node:fs';
import path from 'node:path';
import {test,expect} from '../../fixtures/forge';
import {openPlans} from './forecast-fixture';
import {actualResponse,currentUserResolver} from './campaign-ui';
test('operator recovery: restore exact captured Capacity preferences after owned harness cleanup failure',async({page},info)=>{
 test.skip(!process.env.LZ_CAPACITY_RECOVERY_JOURNAL,'Run only against an explicitly retained failed cleanup journal');
 const file=path.resolve(process.env.LZ_CAPACITY_RECOVERY_JOURNAL!);const notes=JSON.parse(fs.readFileSync(file,'utf8')),fixture=JSON.parse(fs.readFileSync(path.join(path.dirname(file),'fixture-journal.json'),'utf8'));
 expect(notes.privateSettingsRestored).toBe(false);expect(notes.secondaryDeleted).toBe(true);expect(fixture.cleanup.every((r:any)=>r.deleted)).toBe(true);expect(notes.settingsRestorationError).toContain(':authority');
 const journal:any={sourceJournal:file,originalSettings:notes.originalSettings};const retain=()=>fs.writeFileSync(info.outputPath('capacity-recovery.json'),JSON.stringify(journal,null,2));retain();
 const rpc=currentUserResolver(page,c=>c?.functionKey==='getCapacitySettings');
 try{
  let frame=await openPlans(page);const read=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const before=await read;journal.before=before;retain();
  const expected={selectedPlanIds:[fixture.planId,notes.secondPlan],profiles:{[notes.people.A]:{hoursPerDay:8,partTimePct:50,reservePct:25,workingDays:[1,2,3,4,5],leaveDates:[new Date(Date.parse(notes.M+'T00:00:00Z')+3*86400000).toISOString().slice(0,10)]},[notes.people.B]:{hoursPerDay:8,partTimePct:100,reservePct:0,workingDays:[1,2,3,4,5],leaveDates:[]}},issueChoices:Object.fromEntries(notes.chosenReport.alternatives.map((r:any)=>[r.identity,r.selectedPlanId]))};
  expect(before.settings).toEqual(expected); // Refuse overwriting any unobserved external change.
  const saved=await rpc.invoke('saveCapacitySettings',{settings:notes.originalSettings,expectedVersion:before.version});expect(saved.success).toBe(true);
  const after=await rpc.invoke('getCapacitySettings');expect(after.success).toBe(true);expect(after.settings).toEqual(notes.originalSettings);journal.after=after;retain();
  frame=await openPlans(page);const reread=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const reopened=await reread;expect(reopened.settings).toEqual(notes.originalSettings);for(const box of await frame.locator('[data-testid="capacity-view"]').getByRole('checkbox').all())await expect(box).toHaveAttribute('aria-checked','false');await expect(frame.locator('[data-testid="capacity-cell"]')).toHaveCount(0);await page.screenshot({path:info.outputPath('capacity-preferences-restored.png')});journal.reopened=reopened;journal.restored=true;retain();
 }finally{rpc.stop();}
});

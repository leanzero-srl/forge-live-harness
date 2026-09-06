import {settledScreenshot} from './settled-screenshot.mjs';
import {test,expect} from '../../fixtures/forge';
import {getTestState} from '../../testhook/client';
import {withOwnedSchedule,table,row,review,editDuration} from './normalization-owned-fixture';
import {scheduleFields} from './forecast-fixture';
import {actualResponse,planning} from './campaign-ui';
test.describe.configure({retries:0,timeout:900000});

test('adoption: compatible capture Cancel is inert, confirmed draft survives reopen, explicit Apply writes exact Jira fields, later Discard retains applied original',async({page},info)=>{
  await withOwnedSchedule(page,info,[{label:'adopt predecessor',duration:5,start:'2026-03-02',due:'2026-03-06'},{label:'adopt successor',duration:5,start:'2026-03-09',due:'2026-03-13'}],async(f)=>{
    const[pred,succ]=f.keys,original=await Promise.all(f.keys.map((key:string)=>f.read(key)));
    const source=scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues);
    let frame=await table(page,f.name),work=await planning(frame);
    const captured=actualResponse(page,'getSnapshot',f.planId);
    await work.getByLabel('Capture name',{exact:true}).fill('Adoption original');await work.getByRole('button',{name:'Capture working plan',exact:true}).click();const base=(await captured).snapshot;
    await work.getByRole('button',{name:'Create alternative',exact:true}).click();const editor=work.locator('[data-testid="scenario-editor"]');
    await editor.getByLabel('Alternative name',{exact:true}).fill('Compatible six days');await editor.getByLabel(`${pred} duration`,{exact:true}).fill('6');
    await editor.getByRole('button',{name:'Preview alternative',exact:true}).click();const preview=editor.locator('[data-testid="scenario-preview"]');
    const expected=[{key:pred,start:'2026-03-02',due:'2026-03-09',duration:6},{key:succ,start:'2026-03-10',due:'2026-03-16',duration:5}];
    for(const item of expected){const cells=preview.locator('tbody tr').filter({hasText:item.key}).locator('td');await expect(cells.nth(1)).toHaveText(item.start);await expect(cells.nth(2)).toHaveText(item.due);await expect(cells.nth(3)).toHaveText(String(item.duration));}
    const variantRead=actualResponse(page,'getSnapshot',f.planId);await editor.getByRole('button',{name:'Save new scenario',exact:true}).click();const variant=(await variantRead).snapshot;
    expect(variant.calendar.workingDays).toEqual(base.calendar.workingDays);expect(variant.calendar.holidays).toEqual(base.calendar.holidays);
    // Independently enumerate the only real dependency; absent/explicit zero lag
    // encode the same edge. Reject every unexpected lag entry or hierarchy edit.
    for(const capture of [base,variant]){
      expect(capture.issues.map((i:any)=>i.key).sort()).toEqual([pred,succ].sort());
      for(const issue of capture.issues){
        expect(issue.predecessors||[]).toEqual(issue.key===succ?[pred]:[]);
        expect(issue.parentKey??null).toBe(null);
        for(const [edge,lag]of Object.entries(issue.predecessorLags||{})){expect(issue.key).toBe(succ);expect(edge).toBe(pred);expect(lag).toBe(0);}
        if(issue.key===succ)expect(issue.predecessorLags?.[pred]??0).toBe(0);
      }
    }
    await work.getByRole('button',{name:'Adopt schedule…',exact:true}).click();let dialog=frame.getByRole('dialog',{name:'Adopt scenario',exact:true});
    await expect(dialog).toContainText('Compatible six days');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues)).toEqual(source);expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(original);
    frame=await table(page,f.name);for(const item of original){await expect(row(frame,item.key)).toHaveAttribute('data-row-duration',String(item.duration));await expect(row(frame,item.key)).toHaveAttribute('data-row-due',item.due);}
    await expect(frame.getByRole('button',{name:/^Apply \d+ change/})).toHaveCount(0);
    work=await planning(frame);await work.getByRole('navigation',{name:'Retained captures'}).getByRole('button').filter({hasText:'Compatible six days'}).click();
    await work.getByRole('button',{name:'Adopt schedule…',exact:true}).click();dialog=frame.getByRole('dialog',{name:'Adopt scenario',exact:true});const draft=actualResponse(page,'saveDraft',f.planId);
    await dialog.getByRole('button',{name:'Create working draft',exact:true}).click();await draft;await expect(work).toContainText('Scenario adopted into your working draft.');
    await page.goto('about:blank');frame=await table(page,f.name);
    for(const item of expected){await expect(row(frame,item.key)).toHaveAttribute('data-row-start',item.start);await expect(row(frame,item.key)).toHaveAttribute('data-row-due',item.due);await expect(row(frame,item.key)).toHaveAttribute('data-row-duration',String(item.duration));}
    expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(original);
    let modal=await review(frame);await expect(modal.locator('[data-testid="apply-change-row"]')).toHaveCount(2);await settledScreenshot(modal,{path:info.outputPath('adopted-draft-apply-review.png')});
    await modal.getByRole('button',{name:/^Apply 2 Changes/i}).click();await expect(frame.getByText('Successfully wrote 2 issues',{exact:true})).toBeVisible({timeout:120000});
    await expect.poll(()=>Promise.all(f.keys.map((key:string)=>f.read(key))),{timeout:60000}).toEqual(expected);
    const second=await Promise.all(f.keys.map((key:string)=>f.read(key)));expect(second).toEqual(expected);
    frame=await table(page,f.name);await expect(frame.getByRole('button',{name:/^Apply \d+ change/})).toHaveCount(0);
    await editDuration(frame,pred,'7');modal=await review(frame);await modal.getByRole('button',{name:'Discard All',exact:true}).click();await expect(modal).toHaveCount(0);
    frame=await table(page,f.name);for(const item of expected){await expect(row(frame,item.key)).toHaveAttribute('data-row-due',item.due);await expect(row(frame,item.key)).toHaveAttribute('data-row-duration',String(item.duration));}
    expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(expected);await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveAttribute('data-has-changes','0');
    work=await planning(frame);const readOriginal=actualResponse(page,'getSnapshot',f.planId);await work.getByRole('navigation',{name:'Retained captures'}).getByRole('button').filter({hasText:'Adoption original'}).click();const originalCapture=(await readOriginal).snapshot;
    expect(originalCapture.hash).toBe(base.hash);expect(originalCapture.issues).toEqual(base.issues);
    await settledScreenshot(work,{path:info.outputPath('adoption-history-unchanged-after-apply.png')});await info.attach('actual-adoption-jira-second-reads',{body:JSON.stringify({original,expected,secondRead:second,afterDiscard:await Promise.all(f.keys.map((key:string)=>f.read(key))),baseHash:base.hash}),contentType:'application/json'});
  },true);
});

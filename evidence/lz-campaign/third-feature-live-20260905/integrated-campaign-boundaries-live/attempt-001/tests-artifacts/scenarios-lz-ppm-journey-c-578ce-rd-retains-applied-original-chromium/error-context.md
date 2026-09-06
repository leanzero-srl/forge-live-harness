# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-adoption.spec.ts >> adoption: compatible capture Cancel is inert, confirmed draft survives reopen, explicit Apply writes exact Jira fields, later Discard retains applied original
- Location: scenarios/lz-ppm/journey-campaign-adoption.spec.ts:8:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 4

  Array [
    Object {
      "key": "WFH-2798",
-     "predecessorLags": undefined,
+     "predecessorLags": Object {},
      "predecessors": Array [],
    },
    Object {
      "key": "WFH-2799",
-     "predecessorLags": undefined,
+     "predecessorLags": Object {
+       "WFH-2798": 0,
+     },
      "predecessors": Array [
        "WFH-2798",
      ],
    },
  ]
```

# Test source

```ts
  1  | import {test,expect} from '../../fixtures/forge';
  2  | import {getTestState} from '../../testhook/client';
  3  | import {withOwnedSchedule,table,row,review,editDuration} from './normalization-owned-fixture';
  4  | import {scheduleFields} from './forecast-fixture';
  5  | import {actualResponse,planning} from './campaign-ui';
  6  | test.describe.configure({retries:0,timeout:900000});
  7  | 
  8  | test('adoption: compatible capture Cancel is inert, confirmed draft survives reopen, explicit Apply writes exact Jira fields, later Discard retains applied original',async({page},info)=>{
  9  |   await withOwnedSchedule(page,info,[{label:'adopt predecessor',duration:5,start:'2026-03-02',due:'2026-03-06'},{label:'adopt successor',duration:5,start:'2026-03-09',due:'2026-03-13'}],async(f)=>{
  10 |     const[pred,succ]=f.keys,original=await Promise.all(f.keys.map((key:string)=>f.read(key)));
  11 |     const source=scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues);
  12 |     let frame=await table(page,f.name),work=await planning(frame);
  13 |     const captured=actualResponse(page,'getSnapshot',f.planId);
  14 |     await work.getByLabel('Capture name',{exact:true}).fill('Adoption original');await work.getByRole('button',{name:'Capture working plan',exact:true}).click();const base=(await captured).snapshot;
  15 |     await work.getByRole('button',{name:'Create alternative',exact:true}).click();const editor=work.locator('[data-testid="scenario-editor"]');
  16 |     await editor.getByLabel('Alternative name',{exact:true}).fill('Compatible six days');await editor.getByLabel(`${pred} duration`,{exact:true}).fill('6');
  17 |     await editor.getByRole('button',{name:'Preview alternative',exact:true}).click();const preview=editor.locator('[data-testid="scenario-preview"]');
  18 |     const expected=[{key:pred,start:'2026-03-02',due:'2026-03-09',duration:6},{key:succ,start:'2026-03-10',due:'2026-03-16',duration:5}];
  19 |     for(const item of expected){const cells=preview.locator('tbody tr').filter({hasText:item.key}).locator('td');await expect(cells.nth(1)).toHaveText(item.start);await expect(cells.nth(2)).toHaveText(item.due);await expect(cells.nth(3)).toHaveText(String(item.duration));}
  20 |     const variantRead=actualResponse(page,'getSnapshot',f.planId);await editor.getByRole('button',{name:'Save new scenario',exact:true}).click();const variant=(await variantRead).snapshot;
  21 |     expect(variant.calendar.workingDays).toEqual(base.calendar.workingDays);expect(variant.calendar.holidays).toEqual(base.calendar.holidays);
> 22 |     expect(variant.issues.map((i:any)=>({key:i.key,predecessors:i.predecessors,predecessorLags:i.predecessorLags}))).toEqual(base.issues.map((i:any)=>({key:i.key,predecessors:i.predecessors,predecessorLags:i.predecessorLags})));
     |                                                                                                                      ^ Error: expect(received).toEqual(expected) // deep equality
  23 |     await work.getByRole('button',{name:'Adopt schedule…',exact:true}).click();let dialog=frame.getByRole('dialog',{name:'Adopt scenario',exact:true});
  24 |     await expect(dialog).toContainText('Compatible six days');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  25 |     expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues)).toEqual(source);expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(original);
  26 |     frame=await table(page,f.name);for(const item of original){await expect(row(frame,item.key)).toHaveAttribute('data-row-duration',String(item.duration));await expect(row(frame,item.key)).toHaveAttribute('data-row-due',item.due);}
  27 |     await expect(frame.getByRole('button',{name:/^Apply \d+ change/})).toHaveCount(0);
  28 |     work=await planning(frame);await work.getByRole('navigation',{name:'Retained captures'}).getByRole('button').filter({hasText:'Compatible six days'}).click();
  29 |     await work.getByRole('button',{name:'Adopt schedule…',exact:true}).click();dialog=frame.getByRole('dialog',{name:'Adopt scenario',exact:true});const draft=actualResponse(page,'saveDraft',f.planId);
  30 |     await dialog.getByRole('button',{name:'Create working draft',exact:true}).click();await draft;await expect(work).toContainText('Scenario adopted into your working draft.');
  31 |     await page.goto('about:blank');frame=await table(page,f.name);
  32 |     for(const item of expected){await expect(row(frame,item.key)).toHaveAttribute('data-row-start',item.start);await expect(row(frame,item.key)).toHaveAttribute('data-row-due',item.due);await expect(row(frame,item.key)).toHaveAttribute('data-row-duration',String(item.duration));}
  33 |     expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(original);
  34 |     let modal=await review(frame);await expect(modal.locator('[data-testid="apply-change-row"]')).toHaveCount(2);await modal.screenshot({path:info.outputPath('adopted-draft-apply-review.png')});
  35 |     await modal.getByRole('button',{name:/^Apply 2 Changes/i}).click();await expect(frame.getByText('Successfully wrote 2 issues',{exact:true})).toBeVisible({timeout:120000});
  36 |     await expect.poll(()=>Promise.all(f.keys.map((key:string)=>f.read(key))),{timeout:60000}).toEqual(expected);
  37 |     const second=await Promise.all(f.keys.map((key:string)=>f.read(key)));expect(second).toEqual(expected);
  38 |     frame=await table(page,f.name);await expect(frame.getByRole('button',{name:/^Apply \d+ change/})).toHaveCount(0);
  39 |     await editDuration(frame,pred,'7');modal=await review(frame);await modal.getByRole('button',{name:'Discard All',exact:true}).click();await expect(modal).toHaveCount(0);
  40 |     frame=await table(page,f.name);for(const item of expected){await expect(row(frame,item.key)).toHaveAttribute('data-row-due',item.due);await expect(row(frame,item.key)).toHaveAttribute('data-row-duration',String(item.duration));}
  41 |     expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(expected);await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveAttribute('data-has-changes','0');
  42 |     work=await planning(frame);const readOriginal=actualResponse(page,'getSnapshot',f.planId);await work.getByRole('navigation',{name:'Retained captures'}).getByRole('button').filter({hasText:'Adoption original'}).click();const originalCapture=(await readOriginal).snapshot;
  43 |     expect(originalCapture.hash).toBe(base.hash);expect(originalCapture.issues).toEqual(base.issues);
  44 |     await work.screenshot({path:info.outputPath('adoption-history-unchanged-after-apply.png')});await info.attach('actual-adoption-jira-second-reads',{body:JSON.stringify({original,expected,secondRead:second,afterDiscard:await Promise.all(f.keys.map((key:string)=>f.read(key))),baseHash:base.hash}),contentType:'application/json'});
  45 |   },true);
  46 | });
  47 | 
```
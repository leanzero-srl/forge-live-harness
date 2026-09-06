# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-planning.spec.ts >> history: captures retain schedules, active baseline cannot be deleted, replacement permits deletion
- Location: scenarios/lz-ppm/journey-campaign-planning.spec.ts:49:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('[data-testid="gantt-baseline-ghost"]')
Expected: 1
Received: 0
Timeout:  15000ms

Call log:
  - Expect "toHaveCount" with timeout 15000ms
  - waiting for locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('[data-testid="gantt-baseline-ghost"]')
    34 × locator resolved to 0 elements
       - unexpected value "0"

```

# Test source

```ts
  1  | import {test,expect} from '../../fixtures/forge';
  2  | import {getTestState} from '../../testhook/client';
  3  | import {withOwnedSchedule,table,editDuration} from './normalization-owned-fixture';
  4  | import {openPlan} from './forecast-fixture';
  5  | const seed=(label:string,duration:number,start='2026-10-05',due='2026-10-09')=>({label,duration,start,due});
  6  | test.describe.configure({retries:0,timeout:600_000});
  7  | const planning=async(frame:any)=>{await frame.getByRole('button',{name:/^Planning/i}).first().click();return frame.locator('[data-testid="planning-workspace"]');};
  8  | async function chooseDate(frame:any,form:any,iso:string){
  9  |  await form.getByRole('button',{name:'Target date',exact:true}).click();
  10 |  const cal=frame.locator('.lz-datepicker');await expect(cal).toBeVisible();
  11 |  const [year,month,day]=iso.split('-').map(Number);const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  12 |  for(let n=0;n<30;n++){
  13 |   const title=(await cal.locator('span').first().textContent()).trim();if(title===`${months[month-1]} ${year}`)break;
  14 |   const [currentMonth,currentYear]=title.split(' ');const earlier=Number(currentYear)*12+months.indexOf(currentMonth)<year*12+month-1;
  15 |   await cal.getByRole('button',{name:earlier?'Next month':'Previous month',exact:true}).click();
  16 |  }
  17 |  await expect(cal.locator('span').first()).toHaveText(`${months[month-1]} ${year}`);
  18 |  await cal.getByRole('button',{name:iso,exact:true}).click();await expect(cal).toHaveCount(0);
  19 | }
  20 | 
  21 | test('targets: real release scope CRUD persists and produces independently bounded 100 versus 0 percent',async({page},info)=>{
  22 |  await withOwnedSchedule(page,info,[{...seed('scoped early',2,'2026-10-05','2026-10-06'),release:true},seed('outside long',41,'2026-10-05','2026-11-30')],async(f)=>{
  23 |   let frame=await table(page,f.name);let workspace=await planning(frame);await workspace.getByRole('button',{name:'Targets',exact:true}).click();
  24 |   let panel=frame.locator('[data-testid="targets-editor"]');await expect(panel.getByText('No targets yet. Add a delivery date to track.')).toBeVisible();
  25 |   for(const scoped of [true,false]){
  26 |    await panel.getByRole('button',{name:'Add target',exact:true}).click();const form=panel.locator('form');
  27 |    await form.getByLabel('Target name').fill(scoped?'Owned release':'Whole plan control');await chooseDate(frame,form,'2026-10-30');
  28 |    if(scoped){await form.getByRole('combobox').click();await frame.getByRole('option',{name:`Release · ${f.name}`,exact:true}).click();}
  29 |    await expect(form).toContainText(`${scoped?1:2} current leaf tasks`);await form.getByRole('button',{name:'Save target',exact:true}).click();await expect(form).toHaveCount(0);
  30 |   }
  31 |   const meta=(await getTestState('lz-ppm',{what:'plan',planId:f.planId})).meta;
  32 |   const scoped=meta.milestones.find((m:any)=>m.name==='Owned release');expect(scoped.scope).toEqual({type:'release',id:String(f.version.id),memberKeys:[f.keys[0]]});
  33 |   await frame.getByRole('button',{name:/^Dashboard/i}).first().click();const card=frame.locator('[data-testid="schedule-confidence"]');
  34 |   await expect(card).toHaveAttribute('data-p90',/^\d{4}-\d{2}-\d{2}$/,{timeout:90_000});
  35 |   await expect(card.locator('[data-testid="sc-milestone"]').filter({hasText:'Owned release'})).toHaveAttribute('data-probability','1');
  36 |   await expect(card.locator('[data-testid="sc-milestone"]').filter({hasText:'Whole plan control'})).toHaveAttribute('data-probability','0');
  37 |   await page.screenshot({path:info.outputPath('scoped-release-numeric.png'),fullPage:true,animations:'disabled'});
  38 |   workspace=await planning(frame);await workspace.getByRole('button',{name:'Targets',exact:true}).click();panel=frame.locator('[data-testid="targets-editor"]');
  39 |   await panel.locator('[data-testid="target-row"]').filter({hasText:'Owned release'}).getByRole('button',{name:'Edit',exact:true}).click();const form=panel.locator('form');
  40 |   await form.getByLabel('Target name').fill('Owned release revised');await chooseDate(frame,form,'2026-11-30');await expect(form).toBeVisible();await form.getByRole('button',{name:'Save target',exact:true}).click();await expect(form).toHaveCount(0);
  41 |   frame=await openPlan(page,f.name);workspace=await planning(frame);await workspace.getByRole('button',{name:'Targets',exact:true}).click();panel=frame.locator('[data-testid="targets-editor"]');
  42 |   const revised=panel.locator('[data-testid="target-row"]').filter({hasText:'Owned release revised'});await expect(revised).toContainText('2026-11-30');await expect(revised).toContainText('1 leaf tasks');
  43 |   await revised.getByRole('button',{name:'Refresh scope',exact:true}).click();await expect(panel).toContainText('Target scope refreshed');
  44 |   await revised.getByRole('button',{name:'Delete',exact:true}).click();await frame.getByRole('button',{name:'Delete target',exact:true}).click();await expect(revised).toHaveCount(0);
  45 |   await expect(panel.locator('[data-testid="target-row"]')).toHaveCount(1);await page.screenshot({path:info.outputPath('scoped-target-crud.png'),fullPage:true,animations:'disabled'});
  46 |  });
  47 | });
  48 | 
  49 | test('history: captures retain schedules, active baseline cannot be deleted, replacement permits deletion',async({page},info)=>{
  50 |  await withOwnedSchedule(page,info,[seed('history',5)],async(f)=>{
  51 |   let frame=await table(page,f.name);const original=await f.read(f.keys[0]);let workspace=await planning(frame);
  52 |   const capture=async(name:string)=>{await workspace.getByLabel('Capture name').fill(name);await workspace.locator('form').getByRole('combobox').first().click();await frame.getByRole('option',{name:'Baseline',exact:true}).click();await workspace.getByRole('button',{name:'Capture working plan',exact:true}).click();await expect(workspace.locator('[data-testid="snapshot-detail"] h3')).toHaveText(name);};
  53 |   await capture('Commitment one');await workspace.getByRole('button',{name:'Use as baseline',exact:true}).click();await expect(workspace).toContainText('Baseline set to Commitment one');
> 54 |   await frame.getByRole('button',{name:/^Gantt/i}).first().click();const show=frame.getByTitle('Show baseline ghost bars');if(await show.count())await show.click();await expect(frame.locator('[data-testid="gantt-baseline-ghost"]')).toHaveCount(1);await page.screenshot({path:info.outputPath('active-baseline-ghost.png'),fullPage:true,animations:'disabled'});
     |                                                                                                                                                                                                                                         ^ Error: expect(locator).toHaveCount(expected) failed
  55 |   await frame.getByRole('button',{name:/^Table/i}).first().click();await editDuration(frame,f.keys[0],'6');workspace=await planning(frame);await workspace.getByRole('button',{name:/baseline\s*Commitment one/}).click();
  56 |   await expect(workspace.locator('[data-testid="snapshot-detail"]')).toContainText('1 changed schedules');await expect(workspace.locator('tbody tr')).toHaveCount(1);await expect(workspace.locator('tbody tr')).toContainText(f.keys[0]);
  57 |   const cells=workspace.locator('tbody tr').locator('td');await expect(cells.nth(1)).toHaveText('2026-10-05→ 2026-10-05');await expect(cells.nth(2)).toHaveText('2026-10-09→ 2026-10-12');await expect(cells.nth(3)).toHaveText('5→ 6');await expect(cells.nth(4)).toHaveText('No→ No');
  58 |   const remove=async()=>{await workspace.getByRole('button',{name:'Delete capture',exact:true}).click();await frame.getByRole('button',{name:'Delete capture',exact:true}).last().click();};
  59 |   await remove();await expect(workspace.getByRole('alert')).toContainText('active baseline');await expect(workspace.locator('[data-testid="snapshot-detail"] h3')).toHaveText('Commitment one');
  60 |   await capture('Commitment two');await workspace.getByRole('button',{name:'Use as baseline',exact:true}).click();await expect(workspace).toContainText('Baseline set to Commitment two');
  61 |   await workspace.getByRole('button',{name:/baseline\s*Commitment one/}).click();await expect(workspace.locator('[data-testid="snapshot-detail"] h3')).toHaveText('Commitment one');await remove();await expect(workspace).toContainText('Capture deleted.');
  62 |   frame=await openPlan(page,f.name);workspace=await planning(frame);await expect(workspace.getByRole('button',{name:/baseline\s*Commitment one/})).toHaveCount(0);await workspace.getByRole('button',{name:/baseline\s*Commitment two/}).click();await expect(workspace.locator('[data-testid="snapshot-detail"] h3')).toHaveText('Commitment two');
  63 |   expect(await f.read(f.keys[0]),'history capture/activation never writes Jira').toEqual(original);
  64 |   await page.screenshot({path:info.outputPath('history-reopen-retained.png'),fullPage:true,animations:'disabled'});
  65 |  });
  66 | });
  67 | 
```
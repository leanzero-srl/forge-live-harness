# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-simulation.spec.ts >> private simulation: scope, holiday and lag survive model save/reopen; excluded task can return without changing Jira or capture
- Location: scenarios/lz-ppm/journey-campaign-simulation.spec.ts:42:1

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "private simulation"
Received string:    "The simulation changed or its version is missing. Reload before saving."
```

# Test source

```ts
  91  |       await fork.getByRole('button',{name:'Create private simulation',exact:true}).click();
  92  |       const plan=(await made).plan; simId=plan.id; journal.simId=simId; retain();
  93  |       expect(plan).toMatchObject({name:simName,mode:'simulation',sources:[],defaultAccess:'none',protectionEnabled:false,issueCount:3});
  94  |       expect(plan.simulationProvenance).toMatchObject({sourcePlanId:f.planId,snapshotId:base.id,snapshotHash:base.hash});
  95  |       await expect(frame.locator('[data-testid="simulation-plan-banner"]')).toBeVisible();
  96  |       await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveCount(0);
  97  |       await expect(frame.getByRole('button',{name:'Re-index',exact:true})).toHaveCount(0);
  98  |       await expect(frame.getByRole('button',{name:/^Apply \d+ change/})).toHaveCount(0);
  99  |       work=await planning(frame);
  100 |       let loaded=response(page,'getSimulationModel',simId!);
  101 |       await work.getByRole('button',{name:'Edit simulation',exact:true}).click();
  102 |       const initial=await loaded;
  103 |       expect(modelRows(initial.model)).toEqual(modelRows(base));
  104 |       expect(modelRows(initial.scopeBasis)).toEqual(modelRows(base));
  105 |       let editor=work.locator('[data-testid="scenario-editor"]');
  106 |       // Calendar-only edit must preserve declared work. The source dates contain
  107 |       // five old-calendar workdays; the added holiday moves finish, not duration.
  108 |       await editor.getByRole('textbox',{name:'Holiday dates, one YYYY-MM-DD per line',exact:true}).fill('2026-03-04');
  109 |       await editor.getByRole('button',{name:'Preview simulation',exact:true}).click();
  110 |       let calendarPreview=editor.locator('[data-testid="scenario-preview"]');
  111 |       const calendarPred=calendarPreview.locator('tbody tr').filter({hasText:pred}).locator('td');
  112 |       await expect(calendarPred.nth(1)).toHaveText('2026-03-02');
  113 |       await expect(calendarPred.nth(2)).toHaveText('2026-03-09');
  114 |       await expect(calendarPred.nth(3)).toHaveText('5');
  115 |       await settledScreenshot(calendarPreview,{path:info.outputPath('simulation-calendar-only-five-days.png')});
  116 |       loaded=response(page,'getSimulationModel',simId!);
  117 |       await editor.getByRole('button',{name:'Save simulation',exact:true}).click();
  118 |       const calendarOnly=await loaded;
  119 |       expect(calendarOnly.model.issues.find((i:any)=>i.key===pred)).toMatchObject({duration:5,startDate:'2026-03-02',dueDate:'2026-03-09'});
  120 |       expect(calendarOnly.model.issues.find((i:any)=>i.key===succ)).toMatchObject({duration:5,startDate:'2026-03-10',dueDate:'2026-03-16'});
  121 |       journal.steps.push({name:'calendar-only-preserves-five-days',version:calendarOnly.version,rows:modelRows(calendarOnly.model)}); retain();
  122 |       // Reload of the saved model remounts the editor with the new generation.
  123 |       await expect(editor.getByLabel(`${pred} duration`,{exact:true})).toHaveValue('5');
  124 |       await expect(editor.getByRole('button',{name:'Save simulation',exact:true})).toBeDisabled();
  125 |       await editor.getByRole('checkbox',{name:`Include ${late}`,exact:true}).click();
  126 |       await editor.getByLabel(`${pred} duration`,{exact:true}).fill('6');
  127 |       await editor.getByRole('textbox',{name:'Holiday dates, one YYYY-MM-DD per line',exact:true}).fill('2026-03-04');
  128 |       await editor.locator('summary').filter({hasText:'Edit finish-to-start dependencies'}).click();
  129 |       const details=editor.locator('details');
  130 |       await details.locator('label').filter({hasText:'Predecessor'}).getByRole('combobox').click();
  131 |       await details.getByRole('option').filter({hasText:pred}).click();
  132 |       await details.locator('label').filter({hasText:'Successor'}).getByRole('combobox').click();
  133 |       await details.getByRole('option').filter({hasText:succ}).click();
  134 |       await details.getByLabel('Dependency lag',{exact:true}).fill('2');
  135 |       await details.getByRole('button',{name:'Set dependency',exact:true}).click();
  136 |       await expect(editor.getByRole('button',{name:'Save simulation',exact:true})).toBeDisabled();
  137 |       await editor.getByRole('button',{name:'Preview simulation',exact:true}).click();
  138 |       const preview=editor.locator('[data-testid="scenario-preview"]');
  139 |       // Independent inclusive calendar oracle: predecessor Mar 2,3,5,6,9,10;
  140 |       // two lag days Mar 11,12; successor Mar 13,16,17,18,19.
  141 |       const expected=[
  142 |         {key:pred,start:'2026-03-02',due:'2026-03-10',duration:6,predecessors:[],predecessorLags:{}},
  143 |         {key:succ,start:'2026-03-13',due:'2026-03-19',duration:5,predecessors:[pred],predecessorLags:{[pred]:2}},
  144 |       ].sort((a,b)=>a.key.localeCompare(b.key));
  145 |       await expect(preview.locator('tbody tr')).toHaveCount(2);
  146 |       for (const item of expected) {
  147 |         const cells=preview.locator('tbody tr').filter({hasText:item.key}).locator('td');
  148 |         await expect(cells.nth(1)).toHaveText(item.start); await expect(cells.nth(2)).toHaveText(item.due);
  149 |         await expect(cells.nth(3)).toHaveText(String(item.duration));
  150 |       }
  151 |       await settledScreenshot(preview,{path:info.outputPath('simulation-scope-holiday-lag-preview.png')});
  152 |       loaded=response(page,'getSimulationModel',simId!);
  153 |       await editor.getByRole('button',{name:'Save simulation',exact:true}).click();
  154 |       const saved=await loaded;
  155 |       expect(modelRows(saved.model)).toEqual(expected); expect(saved.version).toBeGreaterThan(initial.version);
  156 |       expect(saved.model.calendar.holidays).toEqual([{date:'2026-03-04',name:''}]);
  157 |       expect(modelRows(saved.scopeBasis)).toEqual(modelRows(base));
  158 |       await expect(work).toContainText('Simulation saved. Gantt, Table and Dashboard now use this model.');
  159 |       journal.steps.push({name:'scope-holiday-lag-saved',version:saved.version,rows:modelRows(saved.model),calendar:saved.model.calendar}); retain();
  160 | 
  161 |       // Fresh navigation, then visible Table, Gantt and Dashboard must consume the
  162 |       // same saved generation; API metadata by itself is insufficient evidence.
  163 |       frame=await table(page,simName);
  164 |       await expect(frame.locator('[data-testid="table-row"]')).toHaveCount(2);
  165 |       for (const item of expected) {
  166 |         await expect(row(frame,item.key)).toHaveAttribute('data-row-start',item.start);
  167 |         await expect(row(frame,item.key)).toHaveAttribute('data-row-due',item.due);
  168 |         await expect(row(frame,item.key)).toHaveAttribute('data-row-duration',String(item.duration));
  169 |       }
  170 |       await settledScreenshot(page,{subject:row(frame,pred),path:info.outputPath('simulation-table-reopen.png')});
  171 |       await frame.getByRole('button',{name:/^Gantt/i}).first().click();
  172 |       await expect(frame.locator('[data-testid="gantt-bar"]')).toHaveCount(2);
  173 |       for (const key of [pred,succ]) await expect(frame.locator(`[data-testid="gantt-bar"][data-key="${key}"]`)).toBeVisible();
  174 |       await expect(frame.locator('[data-testid="gantt-dep-arrows"] .dep-arrow-line')).toHaveCount(1);
  175 |       await settledScreenshot(page,{subject:frame.locator(`[data-testid="gantt-row"][data-row-key="${pred}"]`),path:info.outputPath('simulation-gantt-reopen.png')});
  176 |       await frame.getByRole('button',{name:/^Dashboard/i}).first().click();
  177 |       const confidence=frame.locator('[data-testid="schedule-confidence"]');
  178 |       await expect(confidence).toHaveAttribute('data-leaves','2');
  179 |       await expect(confidence).toHaveAttribute('data-runs','300');
  180 |       await expect(confidence.locator('[data-testid="sc-planned"]')).toContainText('Mar 19');
  181 |       await settledScreenshot(confidence,{path:info.outputPath('simulation-dashboard-reopen.png')});
  182 | 
  183 |       // Same authenticated owner is allowed to model but forbidden to sync,
  184 |       // replace sources, or share. These real denials do not prove AUTH-1.
  185 |       for (const [name,payload] of [
  186 |         ['startWrite',{planId:simId}], ['indexPlan',{planId:simId}],
  187 |         ['updatePlan',{planId:simId,sources:[{type:'project',projectKey:'WFH'}]}],
  188 |         ['updatePlanAccess',{planId:simId,defaultAccess:'edit'}],
  189 |       ] as const) {
  190 |         const denied=await invoke(name,payload); expect(denied.success).toBe(false);
> 191 |         expect(denied.error).toContain('private simulation'); journal.steps.push({name,denied}); retain();
      |                              ^ Error: expect(received).toContain(expected) // indexOf
  192 |       }
  193 |       const stale=await invoke('saveSimulationModel',{planId:simId,expectedVersion:initial.version,name:simName,
  194 |         selectedLeafKeys:[pred,succ],changes:[],calendar:saved.model.calendar,uncertainty:'medium',dependencyChanges:[]});
  195 |       expect(stale.success).toBe(false); expect(stale.error).toContain('Reload before saving');
  196 |       const unchanged=await invoke('getSimulationModel',{planId:simId});
  197 |       expect(unchanged.success).toBe(true); expect(unchanged.version).toBe(saved.version);
  198 |       expect(modelRows(unchanged.model)).toEqual(expected);
  199 |       journal.steps.push({name:'stale-version-rejected',error:stale.error}); retain();
  200 | 
  201 |       work=await planning(frame); loaded=response(page,'getSimulationModel',simId!);
  202 |       await work.getByRole('button',{name:'Edit simulation',exact:true}).click(); await loaded;
  203 |       editor=work.locator('[data-testid="scenario-editor"]');
  204 |       await expect(editor.getByRole('checkbox',{name:`Include ${late}`,exact:true})).toHaveAttribute('aria-checked','false');
  205 |       await editor.getByRole('checkbox',{name:`Include ${late}`,exact:true}).click();
  206 |       await editor.getByRole('button',{name:'Preview simulation',exact:true}).click();
  207 |       await expect(editor.locator('[data-testid="scenario-preview"] tbody tr')).toHaveCount(3);
  208 |       loaded=response(page,'getSimulationModel',simId!);
  209 |       await editor.getByRole('button',{name:'Save simulation',exact:true}).click(); const restored=await loaded;
  210 |       const restoredExpected=[...expected,modelRows(base).find((i:any)=>i.key===late)].sort((a,b)=>a.key.localeCompare(b.key));
  211 |       expect(modelRows(restored.model)).toEqual(restoredExpected);
  212 |       expect(restored.model.calendar).toEqual(saved.model.calendar);
  213 |       frame=await table(page,simName);
  214 |       await expect(frame.locator('[data-testid="table-row"]')).toHaveCount(3);
  215 |       await expect(row(frame,late)).toHaveAttribute('data-row-start','2026-12-07');
  216 |       await expect(row(frame,late)).toHaveAttribute('data-row-due','2026-12-11');
  217 |       await expect(row(frame,pred)).toHaveAttribute('data-row-duration','6');
  218 |       const finalModel=await invoke('getSimulationModel',{planId:simId});
  219 |       expect(modelRows(finalModel.model)).toEqual(restoredExpected);
  220 |       expect(finalModel.model.calendar).toEqual(saved.model.calendar);
  221 |       await settledScreenshot(page,{subject:row(frame,late),path:info.outputPath('simulation-excluded-task-restored.png')});
  222 |       journal.steps.push({name:'excluded-task-restored-after-reopen',version:finalModel.version,rows:modelRows(finalModel.model)}); retain();
  223 |       const original=await invoke('getSnapshot',{planId:f.planId,snapshotId:base.id});
  224 |       expect(original.success).toBe(true); expect(original.snapshot.hash).toBe(base.hash);
  225 |       expect(original.snapshot.issues).toEqual(base.issues); expect(original.snapshot.calendar).toEqual(base.calendar);
  226 |       expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues)).toEqual(scheduleFields(sourceBefore.issues));
  227 |       expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(jiraBefore);
  228 |       expect(await jiraLinks()).toEqual(jiraLinksBefore);
  229 |       journal.sourceAndCaptureUnchanged=true; retain();
  230 | 
  231 |       frame=await openPlans(page);
  232 |       const card=frame.locator('.lz-card').filter({hasText:simName});
  233 |       await expect(card.locator('[data-testid="plan-card-simulation"]')).toHaveText('Private simulation');
  234 |       await card.getByRole('button',{name:'More',exact:true}).click();
  235 |       await card.getByRole('button',{name:'Delete plan',exact:true}).click();
  236 |       const removed=response(page,'deletePlan',simId!);
  237 |       await frame.getByRole('dialog',{name:'Delete Plan',exact:true}).getByRole('button',{name:'Delete',exact:true}).click();
  238 |       await removed; await expect(card).toHaveCount(0);
  239 |       expect((await getTestState('lz-ppm',{what:'plans'})).plans.some((p:any)=>p.id===simId)).toBe(false);
  240 |       deleted=true; journal.cleanup.uiDelete=true; retain();
  241 |     } finally {
  242 |       page.off('request',capture);
  243 |       // If a failure prevented receiving the fork response, recover only the
  244 |       // positively named owned simulation with its source provenance.
  245 |       const registry=(await getTestState('lz-ppm',{what:'plans'})).plans;
  246 |       const owned=registry.filter((p:any)=>p.name===simName && p.mode==='simulation');
  247 |       expect(owned.length).toBeLessThanOrEqual(1);
  248 |       if (!simId && owned.length) {simId=owned[0].id; journal.simId=simId; retain();}
  249 |       if (simId && !deleted) {
  250 |         const state=await getTestState('lz-ppm',{what:'plan',planId:simId});
  251 |         if (state.meta) {
  252 |           expect(state.meta).toMatchObject({name:simName,mode:'simulation',simulationProvenance:{sourcePlanId:f.planId}});
  253 |           const removed=await invoke('deletePlan',{planId:simId}); expect(removed.success).toBe(true);
  254 |           journal.cleanup.fallbackRealResolverDelete=true; retain();
  255 |         } else {
  256 |           expect(registry.some((p:any)=>p.id===simId)).toBe(false);
  257 |           journal.cleanup.metaAndRegistryAlreadyAbsent=true; retain();
  258 |         }
  259 |       }
  260 |       if (simId) expect((await getTestState('lz-ppm',{what:'plans'})).plans.some((p:any)=>p.id===simId)).toBe(false);
  261 |       journal.cleanup.simulationRegistryAbsent=true; retain();
  262 |     }
  263 |   },[[0,1]]);
  264 | });
  265 | 
```
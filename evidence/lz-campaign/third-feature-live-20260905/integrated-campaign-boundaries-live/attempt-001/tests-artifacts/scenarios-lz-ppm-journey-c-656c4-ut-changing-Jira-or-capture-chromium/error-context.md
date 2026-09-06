# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-simulation.spec.ts >> private simulation: scope, holiday and lag survive model save/reopen; excluded task can return without changing Jira or capture
- Location: scenarios/lz-ppm/journey-campaign-simulation.spec.ts:41:1

# Error details

```
TimeoutError: locator.fill: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('[data-testid="planning-workspace"]').locator('[data-testid="scenario-editor"]').getByLabel('Holiday dates, one YYYY-MM-DD per line', { exact: true })

```

# Test source

```ts
  26  |   });
  27  | }
  28  | async function planning(frame:any) {
  29  |   await frame.getByRole('button',{name:/^Planning/i}).first().click();
  30  |   await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0);
  31  |   return frame.locator('[data-testid="planning-workspace"]');
  32  | }
  33  | const modelRows=(model:any)=>model.issues.map((issue:any)=>({
  34  |   key:issue.key,start:issue.startDate,due:issue.dueDate,duration:issue.duration,
  35  |   predecessors:issue.predecessors||[],predecessorLags:issue.predecessorLags||{},
  36  | })).sort((a:any,b:any)=>a.key.localeCompare(b.key));
  37  | 
  38  | // Genuine Jira fixture + real UI. RPC replay below keeps the captured current-user
  39  | // identity and real backend responses; it is used for readback, explicit negative
  40  | // boundary probes, and failure cleanup. No result or app state is mocked.
  41  | test('private simulation: scope, holiday and lag survive model save/reopen; excluded task can return without changing Jira or capture',async({page},info)=>{
  42  |   await withOwnedSchedule(page,info,[
  43  |     {label:'simulation predecessor',duration:5,start:'2026-03-02',due:'2026-03-06'},
  44  |     {label:'simulation successor',duration:5,start:'2026-03-09',due:'2026-03-13'},
  45  |     {label:'simulation independent December',duration:5,start:'2026-12-07',due:'2026-12-11'},
  46  |   ],async(f)=>{
  47  |     const [pred,succ,late]=f.keys;
  48  |     const sourceBefore=await getTestState('lz-ppm',{what:'plan',planId:f.planId});
  49  |     const jiraBefore=await Promise.all(f.keys.map((key:string)=>f.read(key)));
  50  |     const jiraLinks=async()=>Promise.all(f.keys.map(async(key:string)=>{
  51  |       await f.read(key); // Positive owned-key and project control before this read.
  52  |       const actual=await get(`/rest/api/3/issue/${key}?fields=issuelinks`);
  53  |       return {key,links:actual.fields.issuelinks.map((link:any)=>({id:link.id,type:link.type.id,
  54  |         inward:link.inwardIssue?.key||null,outward:link.outwardIssue?.key||null})).sort((a:any,b:any)=>a.id.localeCompare(b.id))};
  55  |     }));
  56  |     const jiraLinksBefore=await jiraLinks();
  57  |     let simId:string|undefined, wire:any, deleted=false;
  58  |     const simName=f.name+' private simulation';
  59  |     const journal:any={sourcePlanId:f.planId,simName,keys:f.keys,steps:[],cleanup:{}};
  60  |     const retain=()=>fs.writeFileSync(info.outputPath('simulation-journal.json'),JSON.stringify(journal,null,2));
  61  |     const capture=(req:any)=>{
  62  |       const data=envelope(req), call=data?.variables?.input?.payload?.call;
  63  |       if (call?.functionKey==='forkSimulationPlan' && call.payload?.planId===f.planId) {
  64  |         // Header promise stays in memory. Never serialize headers, identity
  65  |         // context or the whole transport envelope.
  66  |         wire={url:req.url(),headers:req.allHeaders(),data};
  67  |       }
  68  |     };
  69  |     page.on('request',capture); retain();
  70  |     const invoke=async(name:string,payload:any)=>{
  71  |       expect(wire,'real current-user envelope observed during this owned fork').toBeTruthy();
  72  |       const data=structuredClone(wire.data); data.variables.input.payload.call={functionKey:name,payload};
  73  |       const headers=replayHeaders(await wire.headers);
  74  |       const res=await page.request.post(wire.url,{headers,data:JSON.stringify(data)});
  75  |       expect(res.status()).toBe(200); const body=await rpcBody(res); expect(body).toBeTruthy(); return body;
  76  |     };
  77  |     try {
  78  |       let frame=await table(page,f.name), work=await planning(frame);
  79  |       const captured=response(page,'getSnapshot',f.planId);
  80  |       await work.getByLabel('Capture name',{exact:true}).fill('Simulation source capture');
  81  |       await work.getByRole('button',{name:'Capture working plan',exact:true}).click();
  82  |       const base=(await captured).snapshot;
  83  |       expect(base.issues.map((i:any)=>i.key).sort()).toEqual([...f.keys].sort());
  84  |       expect(base.issues.find((i:any)=>i.key===succ).predecessors).toEqual([pred]);
  85  |       journal.base={id:base.id,hash:base.hash,rows:modelRows(base),calendar:base.calendar}; retain();
  86  |       await work.getByRole('button',{name:'Open as private simulation…',exact:true}).click();
  87  |       const fork=work.locator('[data-testid="simulation-fork"]');
  88  |       await fork.getByLabel('Simulation plan name',{exact:true}).fill(simName);
  89  |       const made=response(page,'forkSimulationPlan',f.planId);
  90  |       await fork.getByRole('button',{name:'Create private simulation',exact:true}).click();
  91  |       const plan=(await made).plan; simId=plan.id; journal.simId=simId; retain();
  92  |       expect(plan).toMatchObject({name:simName,mode:'simulation',sources:[],defaultAccess:'none',protectionEnabled:false,issueCount:3});
  93  |       expect(plan.simulationProvenance).toMatchObject({sourcePlanId:f.planId,snapshotId:base.id,snapshotHash:base.hash});
  94  |       await expect(frame.locator('[data-testid="simulation-plan-banner"]')).toBeVisible();
  95  |       await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveCount(0);
  96  |       await expect(frame.getByRole('button',{name:'Re-index',exact:true})).toHaveCount(0);
  97  |       await expect(frame.getByRole('button',{name:/^Apply \d+ change/})).toHaveCount(0);
  98  |       work=await planning(frame);
  99  |       let loaded=response(page,'getSimulationModel',simId!);
  100 |       await work.getByRole('button',{name:'Edit simulation',exact:true}).click();
  101 |       const initial=await loaded;
  102 |       expect(modelRows(initial.model)).toEqual(modelRows(base));
  103 |       expect(modelRows(initial.scopeBasis)).toEqual(modelRows(base));
  104 |       let editor=work.locator('[data-testid="scenario-editor"]');
  105 |       // Calendar-only edit must preserve declared work. The source dates contain
  106 |       // five old-calendar workdays; the added holiday moves finish, not duration.
  107 |       await editor.getByLabel('Holiday dates, one YYYY-MM-DD per line',{exact:true}).fill('2026-03-04');
  108 |       await editor.getByRole('button',{name:'Preview simulation',exact:true}).click();
  109 |       let calendarPreview=editor.locator('[data-testid="scenario-preview"]');
  110 |       const calendarPred=calendarPreview.locator('tbody tr').filter({hasText:pred}).locator('td');
  111 |       await expect(calendarPred.nth(1)).toHaveText('2026-03-02');
  112 |       await expect(calendarPred.nth(2)).toHaveText('2026-03-09');
  113 |       await expect(calendarPred.nth(3)).toHaveText('5');
  114 |       await calendarPreview.screenshot({path:info.outputPath('simulation-calendar-only-five-days.png')});
  115 |       loaded=response(page,'getSimulationModel',simId!);
  116 |       await editor.getByRole('button',{name:'Save simulation',exact:true}).click();
  117 |       const calendarOnly=await loaded;
  118 |       expect(calendarOnly.model.issues.find((i:any)=>i.key===pred)).toMatchObject({duration:5,startDate:'2026-03-02',dueDate:'2026-03-09'});
  119 |       expect(calendarOnly.model.issues.find((i:any)=>i.key===succ)).toMatchObject({duration:5,startDate:'2026-03-10',dueDate:'2026-03-16'});
  120 |       journal.steps.push({name:'calendar-only-preserves-five-days',version:calendarOnly.version,rows:modelRows(calendarOnly.model)}); retain();
  121 |       // Reload of the saved model remounts the editor with the new generation.
  122 |       await expect(editor.getByLabel(`${pred} duration`,{exact:true})).toHaveValue('5');
  123 |       await expect(editor.getByRole('button',{name:'Save simulation',exact:true})).toBeDisabled();
  124 |       await editor.getByRole('checkbox',{name:`Include ${late}`,exact:true}).click();
  125 |       await editor.getByLabel(`${pred} duration`,{exact:true}).fill('6');
> 126 |       await editor.getByLabel('Holiday dates, one YYYY-MM-DD per line',{exact:true}).fill('2026-03-04');
      |                                                                                      ^ TimeoutError: locator.fill: Timeout 20000ms exceeded.
  127 |       await editor.locator('summary').filter({hasText:'Edit finish-to-start dependencies'}).click();
  128 |       const details=editor.locator('details');
  129 |       await details.locator('label').filter({hasText:'Predecessor'}).getByRole('combobox').click();
  130 |       await details.getByRole('option').filter({hasText:pred}).click();
  131 |       await details.locator('label').filter({hasText:'Successor'}).getByRole('combobox').click();
  132 |       await details.getByRole('option').filter({hasText:succ}).click();
  133 |       await details.getByLabel('Dependency lag',{exact:true}).fill('2');
  134 |       await details.getByRole('button',{name:'Set dependency',exact:true}).click();
  135 |       await expect(editor.getByRole('button',{name:'Save simulation',exact:true})).toBeDisabled();
  136 |       await editor.getByRole('button',{name:'Preview simulation',exact:true}).click();
  137 |       const preview=editor.locator('[data-testid="scenario-preview"]');
  138 |       // Independent inclusive calendar oracle: predecessor Mar 2,3,5,6,9,10;
  139 |       // two lag days Mar 11,12; successor Mar 13,16,17,18,19.
  140 |       const expected=[
  141 |         {key:pred,start:'2026-03-02',due:'2026-03-10',duration:6,predecessors:[],predecessorLags:{}},
  142 |         {key:succ,start:'2026-03-13',due:'2026-03-19',duration:5,predecessors:[pred],predecessorLags:{[pred]:2}},
  143 |       ].sort((a,b)=>a.key.localeCompare(b.key));
  144 |       await expect(preview.locator('tbody tr')).toHaveCount(2);
  145 |       for (const item of expected) {
  146 |         const cells=preview.locator('tbody tr').filter({hasText:item.key}).locator('td');
  147 |         await expect(cells.nth(1)).toHaveText(item.start); await expect(cells.nth(2)).toHaveText(item.due);
  148 |         await expect(cells.nth(3)).toHaveText(String(item.duration));
  149 |       }
  150 |       await preview.screenshot({path:info.outputPath('simulation-scope-holiday-lag-preview.png')});
  151 |       loaded=response(page,'getSimulationModel',simId!);
  152 |       await editor.getByRole('button',{name:'Save simulation',exact:true}).click();
  153 |       const saved=await loaded;
  154 |       expect(modelRows(saved.model)).toEqual(expected); expect(saved.version).toBeGreaterThan(initial.version);
  155 |       expect(saved.model.calendar.holidays).toEqual([{date:'2026-03-04',name:''}]);
  156 |       expect(modelRows(saved.scopeBasis)).toEqual(modelRows(base));
  157 |       await expect(work).toContainText('Simulation saved. Gantt, Table and Dashboard now use this model.');
  158 |       journal.steps.push({name:'scope-holiday-lag-saved',version:saved.version,rows:modelRows(saved.model),calendar:saved.model.calendar}); retain();
  159 | 
  160 |       // Fresh navigation, then visible Table, Gantt and Dashboard must consume the
  161 |       // same saved generation; API metadata by itself is insufficient evidence.
  162 |       frame=await table(page,simName);
  163 |       await expect(frame.locator('[data-testid="table-row"]')).toHaveCount(2);
  164 |       for (const item of expected) {
  165 |         await expect(row(frame,item.key)).toHaveAttribute('data-row-start',item.start);
  166 |         await expect(row(frame,item.key)).toHaveAttribute('data-row-due',item.due);
  167 |         await expect(row(frame,item.key)).toHaveAttribute('data-row-duration',String(item.duration));
  168 |       }
  169 |       await page.screenshot({path:info.outputPath('simulation-table-reopen.png')});
  170 |       await frame.getByRole('button',{name:/^Gantt/i}).first().click();
  171 |       await expect(frame.locator('[data-testid="gantt-bar"]')).toHaveCount(2);
  172 |       for (const key of [pred,succ]) await expect(frame.locator(`[data-testid="gantt-bar"][data-key="${key}"]`)).toBeVisible();
  173 |       await expect(frame.locator('[data-testid="gantt-dep-arrows"] .dep-arrow-line')).toHaveCount(1);
  174 |       await page.screenshot({path:info.outputPath('simulation-gantt-reopen.png')});
  175 |       await frame.getByRole('button',{name:/^Dashboard/i}).first().click();
  176 |       const confidence=frame.locator('[data-testid="schedule-confidence"]');
  177 |       await expect(confidence).toHaveAttribute('data-leaves','2');
  178 |       await expect(confidence).toHaveAttribute('data-runs','300');
  179 |       await expect(confidence.locator('[data-testid="sc-planned"]')).toContainText('Mar 19');
  180 |       await confidence.screenshot({path:info.outputPath('simulation-dashboard-reopen.png')});
  181 | 
  182 |       // Same authenticated owner is allowed to model but forbidden to sync,
  183 |       // replace sources, or share. These real denials do not prove AUTH-1.
  184 |       for (const [name,payload] of [
  185 |         ['startWrite',{planId:simId}], ['indexPlan',{planId:simId}],
  186 |         ['updatePlan',{planId:simId,sources:[{type:'project',projectKey:'WFH'}]}],
  187 |         ['updatePlanAccess',{planId:simId,defaultAccess:'edit'}],
  188 |       ] as const) {
  189 |         const denied=await invoke(name,payload); expect(denied.success).toBe(false);
  190 |         expect(denied.error).toContain('private simulation'); journal.steps.push({name,denied}); retain();
  191 |       }
  192 |       const stale=await invoke('saveSimulationModel',{planId:simId,expectedVersion:initial.version,name:simName,
  193 |         selectedLeafKeys:[pred,succ],changes:[],calendar:saved.model.calendar,uncertainty:'medium',dependencyChanges:[]});
  194 |       expect(stale.success).toBe(false); expect(stale.error).toContain('Reload before saving');
  195 |       const unchanged=await invoke('getSimulationModel',{planId:simId});
  196 |       expect(unchanged.success).toBe(true); expect(unchanged.version).toBe(saved.version);
  197 |       expect(modelRows(unchanged.model)).toEqual(expected);
  198 |       journal.steps.push({name:'stale-version-rejected',error:stale.error}); retain();
  199 | 
  200 |       work=await planning(frame); loaded=response(page,'getSimulationModel',simId!);
  201 |       await work.getByRole('button',{name:'Edit simulation',exact:true}).click(); await loaded;
  202 |       editor=work.locator('[data-testid="scenario-editor"]');
  203 |       await expect(editor.getByRole('checkbox',{name:`Include ${late}`,exact:true})).toHaveAttribute('aria-checked','false');
  204 |       await editor.getByRole('checkbox',{name:`Include ${late}`,exact:true}).click();
  205 |       await editor.getByRole('button',{name:'Preview simulation',exact:true}).click();
  206 |       await expect(editor.locator('[data-testid="scenario-preview"] tbody tr')).toHaveCount(3);
  207 |       loaded=response(page,'getSimulationModel',simId!);
  208 |       await editor.getByRole('button',{name:'Save simulation',exact:true}).click(); const restored=await loaded;
  209 |       const restoredExpected=[...expected,modelRows(base).find((i:any)=>i.key===late)].sort((a,b)=>a.key.localeCompare(b.key));
  210 |       expect(modelRows(restored.model)).toEqual(restoredExpected);
  211 |       expect(restored.model.calendar).toEqual(saved.model.calendar);
  212 |       frame=await table(page,simName);
  213 |       await expect(frame.locator('[data-testid="table-row"]')).toHaveCount(3);
  214 |       await expect(row(frame,late)).toHaveAttribute('data-row-start','2026-12-07');
  215 |       await expect(row(frame,late)).toHaveAttribute('data-row-due','2026-12-11');
  216 |       await expect(row(frame,pred)).toHaveAttribute('data-row-duration','6');
  217 |       const finalModel=await invoke('getSimulationModel',{planId:simId});
  218 |       expect(modelRows(finalModel.model)).toEqual(restoredExpected);
  219 |       expect(finalModel.model.calendar).toEqual(saved.model.calendar);
  220 |       await page.screenshot({path:info.outputPath('simulation-excluded-task-restored.png')});
  221 |       journal.steps.push({name:'excluded-task-restored-after-reopen',version:finalModel.version,rows:modelRows(finalModel.model)}); retain();
  222 |       const original=await invoke('getSnapshot',{planId:f.planId,snapshotId:base.id});
  223 |       expect(original.success).toBe(true); expect(original.snapshot.hash).toBe(base.hash);
  224 |       expect(original.snapshot.issues).toEqual(base.issues); expect(original.snapshot.calendar).toEqual(base.calendar);
  225 |       expect(scheduleFields((await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues)).toEqual(scheduleFields(sourceBefore.issues));
  226 |       expect(await Promise.all(f.keys.map((key:string)=>f.read(key)))).toEqual(jiraBefore);
```
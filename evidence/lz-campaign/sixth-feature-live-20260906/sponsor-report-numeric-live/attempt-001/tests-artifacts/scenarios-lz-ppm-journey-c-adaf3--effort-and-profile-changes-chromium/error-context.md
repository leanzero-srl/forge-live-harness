# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-report-numeric.spec.ts >> report analytics: actual capture retains exact seeded quantiles, scoped probabilities and 20h versus 12h overload despite later schedule, effort and profile changes
- Location: scenarios/lz-ppm/journey-campaign-report-numeric.spec.ts:14:1

# Error details

```
AggregateError: Capacity settings recovery required; exact owned fixtures retained, cleanup not passed
```

```
AggregateError: Numeric report body and private settings cleanup failures
```

```
Error: download.saveAs: Target page, context or browser has been closed
```

```
CapacitySettingsRecoveryRequired: Capacity preferences could not be proven restored; retain the exact owned fixtures
```

# Test source

```ts
  1  | import assert from 'node:assert/strict';
  2  | 
  3  | export class CapacitySettingsRecoveryRequired extends Error {
  4  |  constructor(message,state,cause){super(message,{cause});this.name='CapacitySettingsRecoveryRequired';this.code='LZ_CAPACITY_SETTINGS_RECOVERY_REQUIRED';this.settingsState=structuredClone(state);}
  5  | }
  6  | const copy=value=>structuredClone(value);
  7  | const checked=response=>{assert.equal(response?.success,true,response?.error||'Capacity settings response did not succeed');assert.ok(response.settings&&typeof response.settings==='object');assert.ok(Number.isSafeInteger(response.version)&&response.version>=0);return response;};
  8  | const outcome=promise=>promise.then(value=>({value}),error=>({error}));
  9  | const unwrap=result=>{if('error' in result)throw result.error;return result.value;};
  10 | 
  11 | /** One ownership rule for every capacity preference writer in live journeys.
  12 |  * Observe functions return REAL responses; no response/result is fabricated.
  13 |  * Unknown outcomes remain pending and cannot authorize restore or fixture delete.
  14 |  * @param {{invoke:(name:string,payload?:any)=>Promise<any>,onState?:(state:any)=>void,observe?:(name:string)=>Promise<any>}} options
  15 |  */
  16 | export function createCapacityPreferences({invoke,onState=(_state)=>{},observe=undefined}) {
  17 |  const state={initialized:false,original:null,lastOwned:null,version:null,pending:null,restored:false,history:[]};
  18 |  const persist=()=>onState(copy(state));
  19 |  const record=(name,details={})=>{state.history.push({name,time:new Date().toISOString(),...copy(details)});persist();};
> 20 |  const recovery=(message,cause)=>{record('recovery-required',{message});return new CapacitySettingsRecoveryRequired(message,state,cause);};
     |                                                                                ^ CapacitySettingsRecoveryRequired: Capacity preferences could not be proven restored; retain the exact owned fixtures
  21 |  const admit=response=>{assert.equal(state.initialized,false,'Settings admission is once per journey');const r=checked(response);state.initialized=true;state.original=copy(r.settings);state.lastOwned=copy(r.settings);state.version=r.version;record('admitted');};
  22 |  const current=async()=>{
  23 |   assert.equal(state.initialized,true,'Actual original settings must be admitted before writes');
  24 |   if(state.pending)throw recovery('A Capacity settings write has an unknown or pending outcome; do not overwrite or delete its fixtures');
  25 |   const r=checked(await invoke('getCapacitySettings'));
  26 |   try{assert.deepEqual(r.settings,state.lastOwned);}catch(error){record('unrecognized-current',{settings:r.settings,version:r.version});throw recovery('Current Capacity preferences differ from the last acknowledged owned settings',error);}
  27 |   return r;
  28 |  };
  29 |  const beginWrite=async(intent={kind:'UI'})=>{const r=await current();state.pending={...copy(intent),expectedVersion:r.version};state.restored=false;record('write-intent');return r.version;};
  30 |  const acknowledge=response=>{
  31 |   assert.ok(state.pending,'An acknowledgement must correspond to a recorded write intent');
  32 |   if(response?.success!==true){record('write-not-acknowledged',{error:response?.error||'Missing successful acknowledgement'});throw new Error(response?.error||'Capacity settings write not acknowledged');}
  33 |   const r=checked(response);assert.equal(r.version,state.pending.expectedVersion+1,'Acknowledgement version must match this exact pending write');state.lastOwned=copy(r.settings);state.version=r.version;state.pending=null;record('write-acknowledged');return r;
  34 |  };
  35 |  const write=async settings=>{
  36 |   const expectedVersion=await beginWrite({kind:'direct',settings:copy(settings)});
  37 |   // A transport rejection deliberately leaves the recorded intent unresolved.
  38 |   const response=await invoke('saveCapacitySettings',{settings,expectedVersion});return acknowledge(response);
  39 |  };
  40 |  const calculate=async(action,{allowReportFailure=false}={})=>{
  41 |   assert.equal(typeof observe,'function','UI writes need an actual response observer');await beginWrite({kind:'UI'});
  42 |   // Acknowledge immediately, independently of the subsequent report result.
  43 |   const saved=outcome(observe('saveCapacitySettings').then(acknowledge));
  44 |   const reported=outcome(observe('getCapacityReport'));
  45 |   await action();unwrap(await saved);const report=unwrap(await reported);
  46 |   if(!allowReportFailure)assert.equal(report?.success,true,report?.error||'Capacity report did not succeed');return report;
  47 |  };
  48 |  const restore=async()=>{
  49 |   if(!state.initialized){record('no-settings-admitted-no-write');return {initialized:false,restored:false};}
  50 |   try{
  51 |    const r=await current();state.pending={kind:'restore',settings:copy(state.original),expectedVersion:r.version};record('restore-intent');
  52 |    const saved=acknowledge(await invoke('saveCapacitySettings',{settings:state.original,expectedVersion:r.version}));assert.deepEqual(saved.settings,state.original);
  53 |    for(let i=0;i<2;i++){const read=checked(await invoke('getCapacitySettings'));assert.deepEqual(read.settings,state.original);record('restore-readback',{read:i+1,version:read.version});}
  54 |    state.restored=true;record('restored');return {initialized:true,restored:true};
  55 |   }catch(error){if(error instanceof CapacitySettingsRecoveryRequired)throw error;throw recovery('Capacity preferences could not be proven restored; retain the exact owned fixtures',error);}
  56 |  };
  57 |  return {admit,beginWrite,acknowledge,write,calculate,restore,get state(){return copy(state);}};
  58 | }
  59 | 
```
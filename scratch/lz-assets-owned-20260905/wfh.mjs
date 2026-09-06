import fs from 'node:fs';
import assert from 'node:assert/strict';
import {requireEnv} from '../../data/env.mjs';
const dir=new URL('./',import.meta.url),file=new URL('wfh-ownership.json',dir);
const original=JSON.parse(fs.readFileSync(new URL('ownership.json',dir),'utf8'));
const base=requireEnv('JIRA_BASE_URL').replace(/\/+$/,'');assert.equal(base,original.base);assert.equal(base,'https://wolfaenpak.atlassian.net');
const authorization='Basic '+Buffer.from(`${requireEnv('JIRA_ADMIN_EMAIL')}:${requireEnv('JIRA_API_TOKEN')}`).toString('base64');
const marker=original.marker+'-wfh',prefix=original.prefix+' WFH';
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{marker,prefix,base,operations:[],fields:{},createdAt:new Date().toISOString()};assert.equal(state.marker,marker);
const save=()=>{fs.writeFileSync(new URL('wfh-ownership.json.tmp',dir),JSON.stringify(state,null,2)+'\n');fs.renameSync(new URL('wfh-ownership.json.tmp',dir),file);};
const safe=b=>({message:b?.message,errorMessages:b?.errorMessages,errors:b?.errors});
async function http(method,route,body){assert.ok(route.startsWith('/rest/'));const r=await fetch(base+route,{method,headers:{Authorization:authorization,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const t=await r.text();let b;try{b=t?JSON.parse(t):null;}catch{b=null;}return{status:r.status,body:b};}
async function read(route){const r=await http('GET',route);assert.equal(r.status,200,`${route}: ${r.status} ${JSON.stringify(safe(r.body))}`);return r.body;}
async function write(kind,method,route,body,record){assert.ok(!state.operations.some(o=>o.kind===kind&&o.state==='pending'),`Reconcile uncertain ${kind} first`);const op={kind,method,route,body,state:'pending',startedAt:new Date().toISOString()};state.operations.push(op);save();let r;try{r=await http(method,route,body);}catch(e){op.transportError=e.message;save();throw e;}op.status=r.status;op.finishedAt=new Date().toISOString();if(r.status<200||r.status>=300){op.state='rejected';op.error=safe(r.body);save();throw Error(`${kind}: ${r.status} ${JSON.stringify(op.error)}`);}record?.(r.body);op.state='acknowledged';save();console.log(JSON.stringify({kind,status:r.status}));}
const projectId='10001',issueTypeId='10004';
const summaryMeta=b=>({total:b.total,fields:b.fields.map(f=>({fieldId:f.fieldId,name:f.name,required:f.required,schema:f.schema,operations:f.operations,configuration:f.configuration}))});
const schedule=['customfield_10015','customfield_10042','customfield_10180','customfield_10181'];
async function protect(){
 const configs={};for(const id of ['11589','11757','11758','11759','11760'])configs[id]=await read(`/rest/servicedesk/cmdb/latest/fieldconfig/${id}`);
 assert.deepEqual(configs['11589'],original.sharedBefore.config);assert.deepEqual(configs['11758'],original.fields.multiple.config);assert.deepEqual(configs['11760'],original.fields.gate.config);for(const id of ['11757','11759'])assert.ok(!configs[id].workspaceId&&!configs[id].objectSchemaId);
 const mappings={};for(const f of Object.values(original.fields)){const p=await read(`/rest/api/3/field/${f.id}/context/projectmapping?contextId=${f.contextId}`),t=await read(`/rest/api/3/field/${f.id}/context/issuetypemapping?contextId=${f.contextId}`);assert.deepEqual(p,f.projectMappings);assert.deepEqual(t,f.issueTypeMappings);mappings[f.id]={projects:p,types:t};}
 const current={configs,mappings};if(state.protectedBefore)assert.deepEqual(current,state.protectedBefore);else state.protectedBefore=current;state.lastProtection={at:new Date().toISOString(),unchanged:true};save();
}
const command=process.argv[2]||'status';assert.ok(['discover','contexts','config','issue','mapped-due','verify','status'].includes(command));await protect();
if(command==='discover'){
 const p=await read('/rest/api/3/project/WFH');assert.equal(p.id,projectId);assert.ok(p.issueTypes.some(t=>t.id===issueTypeId));
 const association=await read(`/rest/api/3/issuetypescreenscheme/project?projectId=${projectId}`);assert.equal(association.total,1);assert.equal(association.isLast,true);const schemeId=association.values[0].issueTypeScreenScheme.id;
 const mappings=await read(`/rest/api/3/issuetypescreenscheme/mapping?issueTypeScreenSchemeId=${schemeId}`);assert.equal(mappings.isLast,true);const mapping=mappings.values.find(m=>m.issueTypeId===issueTypeId)||mappings.values.find(m=>m.issueTypeId==='default');assert.ok(mapping);
 const schemes=await read(`/rest/api/3/screenscheme?id=${mapping.screenSchemeId}`);assert.equal(schemes.total,1);const scheme=schemes.values[0];assert.ok(scheme.name.startsWith('WFH:'));
 const screens=[];for(const id of [...new Set(Object.values(scheme.screens))]){const tabs=await read(`/rest/api/3/screens/${id}/tabs`);assert.ok(tabs.length);const selected=tabs.find(t=>t.name==='Field Tab')||tabs[0];const fields=await read(`/rest/api/3/screens/${id}/tabs/${selected.id}/fields`);screens.push({id,tabId:selected.id,tabs,fieldIds:fields.map(f=>f.id)});}
 const create=summaryMeta(await read('/rest/api/3/issue/createmeta/WFH/issuetypes/10004'));assert.equal(create.fields.length,create.total);
 state.discovery={at:new Date().toISOString(),project:{id:p.id,key:p.key},issueType:{id:issueTypeId,name:p.issueTypes.find(t=>t.id===issueTypeId).name},association,mappings,scheme,screens,create};save();
}
if(command==='contexts'){
 assert.ok(state.discovery);
 for(const [role,source]of Object.entries(original.fields)){
  const inventory=await read(`/rest/api/3/field/search?id=${source.id}`);assert.equal(inventory.values[0]?.name,source.name);assert.equal(inventory.values[0]?.schema?.custom,'com.atlassian.jira.plugins.cmdb:cmdb-object-cftype');
  if(!state.fields[role])await write(`context-${role}`,'POST',`/rest/api/3/field/${source.id}/context`,{name:prefix+' Work package',description:marker,projectIds:[projectId],issueTypeIds:[issueTypeId]},b=>{state.fields[role]={id:source.id,contextId:String(b.id)};});
  const f=state.fields[role];assert.notEqual(f.contextId,source.contextId);f.projects=await read(`/rest/api/3/field/${f.id}/context/projectmapping?contextId=${f.contextId}`);f.types=await read(`/rest/api/3/field/${f.id}/context/issuetypemapping?contextId=${f.contextId}`);assert.deepEqual(f.projects.values,[{contextId:f.contextId,projectId}]);assert.deepEqual(f.types.values,[{contextId:f.contextId,issueTypeId}]);assert.equal(f.projects.isLast,true);assert.equal(f.types.isLast,true);save();
 }
}
if(command==='config'){
 for(const [role,f]of Object.entries(state.fields)){
  const expected=original.fields[role].config;
  if(!f.configured)await write(`config-${role}`,'PUT',`/rest/servicedesk/cmdb/latest/fieldconfig/${f.contextId}`,expected,()=>{f.configured=true;});
  f.config=await read(`/rest/servicedesk/cmdb/latest/fieldconfig/${f.contextId}`);assert.deepEqual(f.config,expected);save();
  for(const screen of state.discovery.screens){const route=`/rest/api/3/screens/${screen.id}/tabs/${screen.tabId}/fields`;let current=await read(route);if(!current.some(x=>x.id===f.id))await write(`screen-${screen.id}-${role}`,'POST',route,{fieldId:f.id});current=await read(route);assert.ok(current.some(x=>x.id===f.id));assert.ok(screen.fieldIds.every(id=>current.some(x=>x.id===id)));screen.afterIds=current.map(x=>x.id);save();}
 }
 state.createAfter=summaryMeta(await read('/rest/api/3/issue/createmeta/WFH/issuetypes/10004'));for(const f of Object.values(state.fields))assert.ok(state.createAfter.fields.some(x=>x.fieldId===f.id));save();
}
async function ownIssue(){const i=await read(`/rest/api/3/issue/${state.issue.key}?fields=summary,project,issuetype,description,duedate,${schedule.join(',')},customfield_11148,customfield_11149`);assert.equal(i.id,state.issue.id);assert.equal(i.fields.project.id,projectId);assert.equal(i.fields.issuetype.id,issueTypeId);assert.equal(i.fields.summary,prefix+' positive control');assert.equal(i.fields.description?.content?.[0]?.content?.[0]?.text,marker);return i;}
if(command==='issue'){
 assert.equal(Object.keys(state.fields).length,2);assert.ok(Object.values(state.fields).every(f=>f.configured));assert.ok(state.createAfter);
 if(!state.issue)await write('issue','POST','/rest/api/3/issue',{fields:{project:{id:projectId},issuetype:{id:issueTypeId},summary:prefix+' positive control',description:{type:'doc',version:1,content:[{type:'paragraph',content:[{type:'text',text:marker}]}]}}},b=>{state.issue={id:b.id,key:b.key};});
 await ownIssue();const meta=await read(`/rest/api/3/issue/${state.issue.key}/editmeta`);state.issue.editable=Object.fromEntries([...schedule,...Object.values(state.fields).map(f=>f.id)].map(id=>[id,meta.fields[id]?{name:meta.fields[id].name,schema:meta.fields[id].schema,operations:meta.fields[id].operations,configuration:meta.fields[id].configuration}:null]));save();for(const id of schedule)assert.ok(meta.fields[id]?.operations?.includes('set'),`Not editable ${id}`);for(const[role,f]of Object.entries(state.fields))assert.equal(meta.fields[f.id]?.configuration?.multiple,role==='multiple');
 const ref=id=>({workspaceId:original.workspaceId,id:`${original.workspaceId}:${id}`,objectId:id});
 const expected={customfield_10015:'2026-10-05',customfield_10042:'2026-10-09',customfield_10180:5,customfield_11148:[ref('411'),ref('412')],customfield_11149:[ref('411')]};
 if(!state.issue.assigned)await write('assign','PUT',`/rest/api/3/issue/${state.issue.key}`,{fields:expected},()=>{state.issue.assigned=true;state.issue.expected=expected;});
}
if(command==='mapped-due'){
 const url=new URL(requireEnv('LZ_PPM_TESTHOOK_URL'));url.searchParams.set('what','fieldConfig');const response=await fetch(url,{headers:{Authorization:'Bearer '+requireEnv('HARNESS_SECRET')}});assert.equal(response.status,200);const config=await response.json();assert.equal(config.fields.dueDate,'duedate');state.mappedFields={at:new Date().toISOString(),fields:config.fields};save();
 const before=await ownIssue();assert.equal(before.fields.customfield_10042,'2026-10-09');state.issue.beforeMappedDue={customfield_10042:before.fields.customfield_10042,duedate:before.fields.duedate};save();
 await write('mapped-due','PUT',`/rest/api/3/issue/${state.issue.key}`,{fields:{duedate:'2026-10-09'}},()=>{state.issue.expected.duedate='2026-10-09';});
}
if(command==='verify'){
 state.ready=false;save();assert.ok(state.issue?.assigned);state.issue.reads=[];
 for(let n=0;n<2;n++){const i=await ownIssue(),actual={};for(const [id,expected]of Object.entries(state.issue.expected)){assert.ok(Object.hasOwn(i.fields,id));actual[id]=Array.isArray(expected)?i.fields[id].map(x=>({workspaceId:x.workspaceId,id:x.id,objectId:String(x.objectId)})).sort((a,b)=>a.objectId.localeCompare(b.objectId)):i.fields[id];assert.deepEqual(actual[id],expected);}state.issue.reads.push({at:new Date().toISOString(),id:i.id,key:i.key,fields:actual});save();}
 for(const f of Object.values(state.fields)){assert.deepEqual(await read(`/rest/servicedesk/cmdb/latest/fieldconfig/${f.contextId}`),f.config);assert.deepEqual(await read(`/rest/api/3/field/${f.id}/context/projectmapping?contextId=${f.contextId}`),f.projects);assert.deepEqual(await read(`/rest/api/3/field/${f.id}/context/issuetypemapping?contextId=${f.contextId}`),f.types);}
 for(const s of state.discovery.screens){const fields=await read(`/rest/api/3/screens/${s.id}/tabs/${s.tabId}/fields`);assert.ok([...s.fieldIds,...Object.values(state.fields).map(f=>f.id)].every(id=>fields.some(f=>f.id===id)));}
 await protect();state.ready=true;state.verifiedAt=new Date().toISOString();save();
}
console.log(JSON.stringify({command,fields:state.fields,issue:state.issue?.key,ready:state.ready||false},null,2));

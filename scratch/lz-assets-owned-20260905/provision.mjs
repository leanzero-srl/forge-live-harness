import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {requireEnv} from '../../data/env.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(root,'ownership.json');
const base=requireEnv('JIRA_BASE_URL').replace(/\/+$/,'');
assert.equal(base,'https://wolfaenpak.atlassian.net');
const authorization='Basic '+Buffer.from(`${requireEnv('JIRA_ADMIN_EMAIL')}:${requireEnv('JIRA_API_TOKEN')}`).toString('base64');
const marker='lz-assets-owned-20260905',prefix='[harness-test] LZ Assets owned 20260905';
const workspaceId='be9cca2f-5f41-446f-8f5c-76cda0be8417',schemaId='35',typeId='43',nameAttr='156';
const assetBase=`https://api.atlassian.com/jsm/assets/workspace/${workspaceId}/v1`;
const nativeType='com.atlassian.jira.plugins.cmdb:cmdb-object-cftype';
const matrix={R1:{multiple:['A','B'],gate:['A']},R2:{multiple:['B'],gate:['C']},R3:{multiple:[],gate:['A']}};
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{marker,prefix,base,workspaceId,schemaId,typeId,nameAttr,objects:{},fields:{},issues:{},operations:[],createdAt:new Date().toISOString()};
assert.equal(state.marker,marker);assert.equal(state.base,base);
const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(state,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
const safeError=b=>({errorMessages:b?.errorMessages,errors:b?.errors,message:b?.message});
async function http(method,url,body){
 assert.ok(url.startsWith(base+'/rest/')||url.startsWith(assetBase+'/'));
 // No automatic retry on creates: an uncertain response requires ownership reconciliation.
 const r=await fetch(url,{method,headers:{Authorization:authorization,Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await r.text();let parsed;try{parsed=text?JSON.parse(text):null;}catch{parsed=null;}
 return {status:r.status,body:parsed};
}
async function read(route,asset=false){const r=await http('GET',(asset?assetBase:base)+route);assert.equal(r.status,200,`GET ${route}: ${r.status} ${JSON.stringify(safeError(r.body))}`);return r.body;}
async function write(kind,method,route,body,record,asset=false){
 const pending=state.operations.find(o=>o.kind===kind&&o.state==='pending');assert.ok(!pending,`Uncertain ${kind}; reconcile its exact owned name before retrying`);
 const op={kind,method,route,body,startedAt:new Date().toISOString(),state:'pending'};state.operations.push(op);save();
 let r;try{r=await http(method,(asset?assetBase:base)+route,body);}catch(error){op.transportError=error.message;save();throw error;}
 op.status=r.status;op.finishedAt=new Date().toISOString();
 if(r.status<200||r.status>=300){op.state='rejected';op.error=safeError(r.body);save();throw new Error(`${kind}: HTTP ${r.status} ${JSON.stringify(op.error)}`);}
 // Save observed creation identity before assertions or any dependent request.
 record?.(r.body);op.state='acknowledged';save();console.log(JSON.stringify({kind,status:r.status}));return r.body;
}
const refs=v=>(v||[]).map(x=>({workspaceId:x.workspaceId,objectId:String(x.objectId),id:x.id})).sort((a,b)=>a.objectId.localeCompare(b.objectId));
const objectProjection=o=>({id:String(o.id),objectKey:o.objectKey,label:o.label,objectTypeId:String(o.objectType?.id),attributes:(o.attributes||[]).map(a=>({objectTypeAttributeId:String(a.objectTypeAttributeId),values:(a.objectAttributeValues||[]).map(v=>v.value)}))});
async function sharedGuard(){
 const config=await read('/rest/servicedesk/cmdb/latest/fieldconfig/11589');assert.equal(config.multiple,false);assert.equal(config.objectSchemaId,schemaId);
 const issues={};for(const key of ['JT-56','JT-16']){const r=await read(`/rest/api/3/issue/${key}?fields=project,issuetype,customfield_11081,customfield_10015,customfield_10180,duedate`);assert.equal(r.fields.project.id,'10008');assert.equal(r.fields.issuetype.id,'10005');issues[key]={id:r.id,key:r.key,fields:{project:{id:r.fields.project.id,key:r.fields.project.key},issuetype:{id:r.fields.issuetype.id,name:r.fields.issuetype.name},customfield_11081:refs(r.fields.customfield_11081),customfield_10015:r.fields.customfield_10015,customfield_10180:r.fields.customfield_10180,duedate:r.fields.duedate}};}
 assert.deepEqual(refs(issues['JT-56'].fields.customfield_11081).map(x=>x.objectId),['71']);assert.deepEqual(refs(issues['JT-16'].fields.customfield_11081),[]);
 const objects={};for(const id of ['71','72'])objects[id]=objectProjection(await read(`/object/${id}`,true));
 const current=JSON.parse(JSON.stringify({config,issues,objects}));if(state.sharedBefore)assert.deepEqual(current,state.sharedBefore);else{state.sharedBefore=current;save();}
 state.lastSharedGuard={verifiedAt:new Date().toISOString(),unchanged:true};save();
}
async function validateObjects(){for(const object of Object.values(state.objects)){const actual=objectProjection(await read(`/object/${object.id}`,true));assert.equal(actual.label,object.label);assert.equal(actual.objectKey,object.objectKey);assert.equal(actual.objectTypeId,typeId);object.readback=actual;save();}}
const command=process.argv[2]||'status';assert.ok(['preflight','objects','fields','config','issues','verify','status'].includes(command));
await sharedGuard();
if(command==='preflight'){
 const workspaces=await read('/rest/servicedeskapi/assets/workspace');assert.ok(workspaces.values.some(w=>w.workspaceId===workspaceId));
 const schemas=await read('/objectschema/list',true);const schema=schemas.values.find(s=>String(s.id)===schemaId);assert.ok(schema);assert.equal(schema.objectSchemaKey,'CRT');
 const types=await read(`/objectschema/${schemaId}/objecttypes`,true);assert.ok(types.some(t=>String(t.id)===typeId&&t.name==='Laptop'));
 const attrs=await read(`/objecttype/${typeId}/attributes`,true);const required=attrs.filter(a=>(a.minimumCardinality>0||a.required)&&a.editable!==false);assert.deepEqual(required.map(a=>({id:String(a.id),name:a.name})),[{id:nameAttr,name:'Name'}]);
 const screen=await read('/rest/api/3/screens/10038/tabs/10043/fields');assert.ok(screen.some(f=>f.id==='customfield_11081'));
 const metadata=await read('/rest/api/3/issue/createmeta/JT/issuetypes/10005');assert.ok(metadata.fields.some(f=>f.fieldId==='customfield_11081'));
 state.preflight={at:new Date().toISOString(),schema:{id:schema.id,name:schema.name,key:schema.objectSchemaKey},objectType:{id:typeId,name:'Laptop'},requiredEditable:required.map(a=>({id:a.id,name:a.name})),screenFieldIds:screen.map(f=>f.id),createRequired:metadata.fields.filter(f=>f.required).map(f=>f.fieldId)};save();
}
if(command==='objects'){
 assert.ok(state.preflight);
 for(const label of ['A','B','C'])if(!state.objects[label]){
  const name=`${prefix} ${label}`;
  await write(`object-${label}`,'POST','/object/create',{objectTypeId:typeId,attributes:[{objectTypeAttributeId:nameAttr,objectAttributeValues:[{value:name}]}]},b=>{state.objects[label]={id:String(b.id),objectKey:b.objectKey,label:b.label};},true);
  assert.equal(state.objects[label].label,name);await validateObjects();
 }
}
if(command==='fields'){
 await validateObjects();assert.equal(Object.keys(state.objects).length,3);
 for(const role of ['multiple','gate']){
  if(!state.fields[role])await write(`field-${role}`,'POST','/rest/api/3/field',{name:`${prefix} ${role}`,description:`Owned ${marker}. Retained for LeanZero UAT; do not modify shared COGTEST field.`,type:nativeType},b=>{state.fields[role]={id:b.id,name:b.name};});
  const field=state.fields[role];assert.match(field.id,/^customfield_\d+$/);assert.notEqual(field.id,'customfield_11081');
  const inventory=await read(`/rest/api/3/field/search?id=${field.id}`);const actual=inventory.values.find(f=>f.id===field.id);assert.equal(actual?.name,field.name);assert.equal(actual?.schema?.custom,nativeType);
  if(!field.contextId)await write(`context-${role}`,'POST',`/rest/api/3/field/${field.id}/context`,{name:`${prefix} JT Task`,description:marker,projectIds:['10008'],issueTypeIds:['10005']},b=>{field.contextId=String(b.id);});
  const contexts=await read(`/rest/api/3/field/${field.id}/context`);assert.ok(contexts.values.some(c=>String(c.id)===field.contextId&&!c.isGlobalContext&&!c.isAnyIssueType));
  field.contexts=contexts.values;field.projectMappings=await read(`/rest/api/3/field/${field.id}/context/projectmapping?contextId=${field.contextId}`);field.issueTypeMappings=await read(`/rest/api/3/field/${field.id}/context/issuetypemapping?contextId=${field.contextId}`);save();
 }
}
if(command==='config'){
 for(const role of ['multiple','gate']){
  const field=state.fields[role];assert.ok(field?.contextId);assert.notEqual(field.id,'customfield_11081');assert.notEqual(field.contextId,'11589');
  const config={...state.sharedBefore.config,attributesDisplayedOnIssue:['Name'],objectFilterQuery:`objectTypeId = ${typeId} AND objectId IN (${Object.values(state.objects).map(o=>o.id).join(',')})`,multiple:role==='multiple'};
  if(!field.configured)await write(`configure-${role}`,'PUT',`/rest/servicedesk/cmdb/latest/fieldconfig/${field.contextId}`,config,()=>{field.configured=true;});
  const actual=await read(`/rest/servicedesk/cmdb/latest/fieldconfig/${field.contextId}`);for(const k of ['objectSchemaId','workspaceId','objectFilterQuery','multiple'])assert.deepEqual(actual[k],config[k]);field.config=actual;save();
  const route='/rest/api/3/screens/10038/tabs/10043/fields';let screen=await read(route);
  if(!screen.some(f=>f.id===field.id))await write(`screen-${role}`,'POST',route,{fieldId:field.id},()=>{field.screenAttached=true;});
  screen=await read(route);assert.ok(screen.some(f=>f.id===field.id));assert.ok(state.preflight.screenFieldIds.every(id=>screen.some(f=>f.id===id)));field.screenAttached=true;save();
 }
}
async function ownIssue(key){
 const issue=await read(`/rest/api/3/issue/${key}?fields=summary,labels,project,issuetype,customfield_10015,customfield_10180,customfield_10181,duedate,${Object.values(state.fields).map(f=>f.id).join(',')}`);
 assert.equal(issue.fields.project.id,'10008');assert.equal(issue.fields.issuetype.id,'10005');assert.ok(issue.fields.labels.includes(marker));assert.ok(issue.fields.summary.startsWith(prefix));return issue;
}
if(command==='issues'){
 assert.ok(Object.values(state.fields).every(f=>f.configured&&f.screenAttached));assert.equal(Object.keys(state.fields).length,2);
 for(const [label,assignment]of Object.entries(matrix)){
  if(!state.issues[label])await write(`issue-${label}`,'POST','/rest/api/3/issue',{fields:{project:{id:'10008'},issuetype:{id:'10005'},summary:`${prefix} ${label}`,labels:[marker]}},b=>{state.issues[label]={id:b.id,key:b.key};});
  const issue=state.issues[label];await ownIssue(issue.key);
  const meta=await read(`/rest/api/3/issue/${issue.key}/editmeta`);issue.editable=Object.fromEntries(['customfield_10015','duedate','customfield_10180','customfield_10181',...Object.values(state.fields).map(f=>f.id)].map(id=>[id,meta.fields[id]?{name:meta.fields[id].name,schema:meta.fields[id].schema,operations:meta.fields[id].operations,configuration:meta.fields[id].configuration}:null]));save();
  for(const role of ['multiple','gate'])assert.equal(meta.fields[state.fields[role].id]?.configuration?.multiple,role==='multiple',`Exact ${issue.key} ${role} native edit-meta`);
  const ref=label=>({workspaceId,id:`${workspaceId}:${state.objects[label].id}`,objectId:state.objects[label].id});
  if(!issue.assigned)await write(`assign-${label}`,'PUT',`/rest/api/3/issue/${issue.key}`,{update:Object.fromEntries(Object.entries(assignment).map(([role,labels])=>[state.fields[role].id,[{set:labels.map(ref)}]]))},()=>{issue.assigned=true;issue.expected=assignment;});
 }
}
if(command==='verify'){
 state.ready=false;save();
 await validateObjects();assert.equal(Object.keys(state.issues).length,3);
 for(const [role,field]of Object.entries(state.fields)){
  const config=await read(`/rest/servicedesk/cmdb/latest/fieldconfig/${field.contextId}`);assert.deepEqual(config,field.config);
  const projects=await read(`/rest/api/3/field/${field.id}/context/projectmapping?contextId=${field.contextId}`);
  const types=await read(`/rest/api/3/field/${field.id}/context/issuetypemapping?contextId=${field.contextId}`);
  assert.deepEqual(projects.values,[{contextId:field.contextId,projectId:'10008'}]);assert.equal(projects.isLast,true);
  assert.deepEqual(types.values,[{contextId:field.contextId,issueTypeId:'10005'}]);assert.equal(types.isLast,true);
  for(const context of field.contexts.filter(c=>c.isGlobalContext)){
   const fallback=await read(`/rest/servicedesk/cmdb/latest/fieldconfig/${context.id}`);assert.ok(!fallback.workspaceId&&!fallback.objectSchemaId);field.unconfiguredGlobal={contextId:context.id,config:fallback};
  }
 }
 const screen=await read('/rest/api/3/screens/10038/tabs/10043/fields');assert.ok([...state.preflight.screenFieldIds,...Object.values(state.fields).map(f=>f.id)].every(id=>screen.some(f=>f.id===id)));state.verifiedScreenFieldIds=screen.map(f=>f.id);save();
 for(const[label,assignment]of Object.entries(matrix)){
  const issue=state.issues[label];issue.reads=[];
  for(let n=0;n<2;n++){
   const actual=await ownIssue(issue.key),fields={};
   for(const[role,labels]of Object.entries(assignment)){assert.ok(Object.hasOwn(actual.fields,state.fields[role].id),`Missing field is not empty: ${actual.key} ${role}`);const value=refs(actual.fields[state.fields[role].id]);assert.deepEqual(value.map(r=>r.objectId).sort(),labels.map(l=>state.objects[l].id).sort());assert.ok(value.every(r=>r.workspaceId===workspaceId&&r.id===`${workspaceId}:${r.objectId}`));fields[state.fields[role].id]=value;}
   issue.reads.push({at:new Date().toISOString(),id:actual.id,key:actual.key,fields});save();
  }
 }
 await sharedGuard();state.ready=true;state.verifiedAt=new Date().toISOString();save();
}
console.log(JSON.stringify({command,stateFile:file,ready:state.ready||false,objects:Object.fromEntries(Object.entries(state.objects).map(([k,v])=>[k,v.id])),fields:Object.fromEntries(Object.entries(state.fields).map(([k,v])=>[k,{id:v.id,contextId:v.contextId}])),issues:Object.fromEntries(Object.entries(state.issues).map(([k,v])=>[k,v.key]))},null,2));

// Preparation copy. Imports are relative to this scratch location. Before moving
// under scripts/, adjust imports and add this module to campaign instrument hash.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {get,post,put,request,BASE} from '../../data/jira.mjs';
import {assets} from '../../data/assets.mjs';
const marker='lz-assets-expanded-20260905',prefix='[harness-test] LZ Assets 20260905';
const output=path.resolve('evidence/lz-campaign/assets-expanded-fixture.json');
const workspaceId='be9cca2f-5f41-446f-8f5c-76cda0be8417',schemaId='35',typeId='43',nameAttr='156';
const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!/token|secret|authorization|cookie|avatar/i.test(k)).map(([k,v])=>[k,clean(v)])):v;
let state=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{marker,prefix,workspaceId,objects:{},fields:{},issues:{},steps:[],createdAt:new Date().toISOString()};
assert.equal(BASE,'https://wolfaenpak.atlassian.net');assert.equal(state.marker,marker);assert.equal(state.workspaceId,workspaceId);
const save=()=>{fs.mkdirSync(path.dirname(output),{recursive:true});const temp=output+'.tmp';fs.writeFileSync(temp,JSON.stringify(clean(state),null,2));fs.renameSync(temp,output);};
const step=(name,result)=>{state.steps.push({time:new Date().toISOString(),name,result:clean(result)});save();};
const objectBody=label=>({objectTypeId:typeId,attributes:[{objectTypeAttributeId:nameAttr,objectAttributeValues:[{value:label}]}]});
const reference=id=>({workspaceId,id:`${workspaceId}:${id}`,objectId:String(id)});
async function ownedObject(id){const r=await assets('GET',`/object/${id}`);assert.equal(r.status,200);assert.equal(String(r.body.id),String(id));assert.ok(r.body.label.startsWith(prefix));assert.equal(String(r.body.objectType.id),typeId);return r.body;}
async function ownedIssue(key){const r=await get(`/rest/api/3/issue/${key}?fields=project,summary,labels,${Object.values(state.fields).map(f=>f.id).join(',')}`);assert.equal(r.fields.project.id,'10008');assert.ok(r.fields.labels.includes(marker));assert.ok(r.fields.summary.startsWith(prefix));return r;}
async function sharedGuard(){const field=await get('/rest/servicedesk/cmdb/latest/fieldconfig/11589');const issue=await get('/rest/api/3/issue/JT-56?fields=customfield_11081');const current={field,values:issue.fields.customfield_11081};assert.equal(field.multiple,false);assert.equal(field.objectSchemaId,schemaId);assert.deepEqual(current.values.map(v=>`${v.workspaceId}:${v.objectId}`),[`${workspaceId}:71`]);if(state.sharedBefore)assert.deepEqual(current,state.sharedBefore);else{state.sharedBefore=current;save();}return current;}
const verb=process.argv[2]||'status';assert.ok(['seed','status','cleanup'].includes(verb));await sharedGuard();
if(verb==='status'){
 for(const object of Object.values(state.objects))await ownedObject(object.id);
 for(const issue of Object.values(state.issues))await ownedIssue(issue.key);
 console.log(JSON.stringify({stateFile:output,objects:state.objects,fields:state.fields,issues:state.issues,ready:state.ready||false}));
}else if(verb==='seed'){
 // Actual same-type positive control before creating any native Assets config.
 const control=await get('/rest/api/3/issue/JT-16?fields=project,issuetype,customfield_11081');assert.equal(control.fields.project.id,'10008');assert.equal(control.fields.issuetype.id,'10005');assert.deepEqual(control.fields.customfield_11081,[]);
 const attrs=await assets('GET',`/objecttype/${typeId}/attributes`);assert.equal(attrs.status,200);assert.ok(attrs.body.some(a=>String(a.id)===nameAttr&&a.name==='Name'&&a.editable!==false));
 for(const label of ['A','B','C']){
  if(!state.objects[label]){const r=await assets('POST','/object/create',objectBody(`${prefix} ${label}`));assert.ok([200,201].includes(r.status));state.objects[label]={id:String(r.body.id),objectKey:r.body.objectKey,label:r.body.label};save();}
  const object=await ownedObject(state.objects[label].id);assert.equal(object.objectKey,state.objects[label].objectKey);assert.equal(object.label,state.objects[label].label);
 }
 const objectIds=Object.values(state.objects).map(o=>o.id);const nativeType='com.atlassian.jira.plugins.cmdb:cmdb-object-cftype';
 for(const role of ['multiple','gate']){
  if(!state.fields[role]){const f=await post('/rest/api/3/field',{name:`${prefix} ${role}`,description:`Owned ${marker}. Preserve COGTEST/JT-56.`,type:nativeType});assert.ok(/^customfield_\d+$/.test(f.id));state.fields[role]={id:f.id,name:f.name};save();}
  const field=state.fields[role];
  const all=await get('/rest/api/3/field');const visible=all.find(f=>f.id===field.id);assert.equal(visible?.name,field.name);assert.equal(visible?.schema?.custom,nativeType);
  if(!field.contextId){const made=await post(`/rest/api/3/field/${field.id}/context`,{name:`${prefix} JT Task`,description:marker,projectIds:['10008'],issueTypeIds:['10005']});field.contextId=String(made.id);save();}
  const context=await get(`/rest/api/3/field/${field.id}/context`);assert.ok(context.values.some(c=>String(c.id)===field.contextId&&!c.isGlobalContext&&!c.isAnyIssueType));
  const config={...state.sharedBefore.field,objectFilterQuery:`objectTypeId = ${typeId} AND objectId IN (${objectIds.join(',')})`,multiple:role==='multiple'};
  await put(`/rest/servicedesk/cmdb/latest/fieldconfig/${field.contextId}`,config);const read=await get(`/rest/servicedesk/cmdb/latest/fieldconfig/${field.contextId}`);assert.equal(read.multiple,config.multiple);assert.equal(read.objectFilterQuery,config.objectFilterQuery);assert.equal(read.objectSchemaId,schemaId);field.config=read;save();
  const route='/rest/api/3/screens/10038/tabs/10043/fields';let screen=await get(route);if(!screen.some(f=>f.id===field.id))await post(route,{fieldId:field.id});screen=await get(route);assert.ok(screen.some(f=>f.id===field.id));field.screenAttached=true;save();
 }
 const matrix={R1:{multiple:['A','B'],gate:['A']},R2:{multiple:['B'],gate:['C']},R3:{multiple:[],gate:['A']}};
 for(const [name,values]of Object.entries(matrix)){
  if(!state.issues[name]){const made=await post('/rest/api/3/issue',{fields:{project:{id:'10008'},issuetype:{id:'10005'},summary:`${prefix} ${name}`,labels:[marker]}});state.issues[name]={key:made.key,id:made.id};save();}
  const issue=state.issues[name];await ownedIssue(issue.key);const meta=await get(`/rest/api/3/issue/${issue.key}/editmeta`);
  for(const role of ['multiple','gate']){const field=state.fields[role];assert.ok(meta.fields[field.id],'exact owned issue exposes native field');assert.equal(meta.fields[field.id].configuration.multiple,role==='multiple');}
  await put(`/rest/api/3/issue/${issue.key}`,{update:Object.fromEntries(Object.entries(values).map(([role,labels])=>[state.fields[role].id,[{set:labels.map(l=>reference(state.objects[l].id))}]]))});
  const reads=[];for(let n=0;n<2;n++){const read=await ownedIssue(issue.key);for(const [role,labels]of Object.entries(values))assert.deepEqual(read.fields[state.fields[role].id].map(v=>`${v.workspaceId}:${v.objectId}`).sort(),labels.map(l=>`${workspaceId}:${state.objects[l].id}`).sort());reads.push({key:read.key,fields:read.fields});}
  issue.expected=values;issue.reads=reads;save();
 }
 await sharedGuard();state.ready=true;state.verifiedAt=new Date().toISOString();save();console.log(JSON.stringify({stateFile:output,ready:true,fields:state.fields,objects:state.objects,issues:Object.fromEntries(Object.entries(state.issues).map(([k,v])=>[k,v.key]))}));
}else{
 // Own IDs and exact labels are mandatory before every deletion. Shared context,
 // field, schema, original objects and JT56 are never cleanup targets.
 for(const issue of Object.values(state.issues)){if(issue.deleted)continue;await ownedIssue(issue.key);await request('DELETE',`/rest/api/3/issue/${issue.key}`);assert.equal((await request('GET',`/rest/api/3/issue/${issue.key}`,{raw:true})).status,404);issue.deleted=true;save();}
 for(const field of Object.values(state.fields)){if(field.trashed)continue;const all=await get('/rest/api/3/field');assert.equal(all.find(f=>f.id===field.id)?.name,field.name);await post(`/rest/api/3/field/${field.id}/trash`,{});assert.ok(!(await get('/rest/api/3/field')).some(f=>f.id===field.id));field.trashed=true;save();}
 for(const object of Object.values(state.objects)){if(object.deleted)continue;await ownedObject(object.id);const r=await assets('DELETE',`/object/${object.id}`);assert.ok([200,204].includes(r.status));assert.equal((await assets('GET',`/object/${object.id}`)).status,404);object.deleted=true;save();}
 await sharedGuard();state.cleanedAt=new Date().toISOString();save();console.log(JSON.stringify({stateFile:output,cleaned:true,fieldDeletion:'trashed (retention is platform-controlled)'}));
}

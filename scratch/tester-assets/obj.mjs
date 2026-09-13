import { get } from "../../data/jira.mjs";
const WS = "be9cca2f-5f41-446f-8f5c-76cda0be8417";
const o = await get(`/gateway/api/jsm/assets/workspace/${WS}/v1/object/${process.argv[2]}`);
console.log(JSON.stringify({id:o.id,key:o.objectKey,label:o.label,type:o.objectType?.name}, null, 1));
for (const a of o.attributes||[]) {
  console.log(` ${a.objectTypeAttribute?.name}: ${JSON.stringify((a.objectAttributeValues||[]).map(v=>({value:v.value,display:v.displayValue,ref:v.referencedObject&&{id:v.referencedObject.id,key:v.referencedObject.objectKey,label:v.referencedObject.label}})))}`);
}

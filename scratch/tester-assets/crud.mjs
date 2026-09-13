import { post, del, get } from "../../data/jira.mjs";
const WS = "be9cca2f-5f41-446f-8f5c-76cda0be8417";
const B = `/gateway/api/jsm/assets/workspace/${WS}/v1`;
const created = await post(`${B}/object/create`, {
  objectTypeId: "122",
  attributes: [{ objectTypeAttributeId: "285", objectAttributeValues: [{ value: "[harness-test] delete probe" }] }],
});
console.log("created:", created.id, created.objectKey, created.label);
const d = await del(`${B}/object/${created.id}`).then(()=> "deleted-ok").catch(e=>"DELETE FAILED: "+e.message.slice(0,200));
console.log(d);
const still = await get(`${B}/object/${created.id}`).catch(e=>null);
console.log("still present:", !!still);

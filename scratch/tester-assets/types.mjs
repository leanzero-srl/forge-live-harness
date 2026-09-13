import { get } from "../../data/jira.mjs";
const WS = "be9cca2f-5f41-446f-8f5c-76cda0be8417";
const B = `/gateway/api/jsm/assets/workspace/${WS}/v1`;
for (const s of ["68","102","103","104"]) {
  const types = await get(`${B}/objectschema/${s}/objecttypes`);
  console.log(`\n=== schema ${s} ===`);
  for (const t of types) console.log(` type ${t.id} "${t.name}" count=${t.objectCount} abstract=${t.abstractObjectType}`);
}

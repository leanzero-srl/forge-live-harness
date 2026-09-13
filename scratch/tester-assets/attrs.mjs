import { get } from "../../data/jira.mjs";
const WS = "be9cca2f-5f41-446f-8f5c-76cda0be8417";
const B = `/gateway/api/jsm/assets/workspace/${WS}/v1`;
const t = process.argv[2];
const attrs = await get(`${B}/objecttype/${t}/attributes`);
for (const a of attrs) console.log(`${a.id}\t"${a.name}"\ttype=${a.type} default=${a.defaultType?.name} min=${a.minimumCardinality} max=${a.maximumCardinality} editable=${a.editable} ref=${a.referenceObjectType?.name} opts=${a.options||""}`);

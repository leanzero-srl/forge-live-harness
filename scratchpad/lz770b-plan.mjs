import { hook, bed, save, api } from "./lz770b-lib.mjs";
import { get } from "../data/jira.mjs";
const me = await get("/rest/api/3/myself");
const admin = await hook({ what: "mintApiToken", accountId: me.accountId, name: "critic4-admin", role: "admin" });
console.log("TOKEN_ROW", admin.row.id, admin.row.role);
const b = bed();
const r = await api(admin, "POST", { resource: "plans" }, { name: "[harness-test] LZ770B saved-edit bed", jql: b.jql, index: true, wait: 20 });
console.log("CREATE", r.status, JSON.stringify(r.json?.plan?.id), JSON.stringify(r.json?.indexing), JSON.stringify(r.json?.progress));
save({ planId: r.json?.plan?.id, tokenId: admin.row.id, tokenUrl: admin.url, token: admin.token, accountId: me.accountId });

import { setDates } from "../../data/jira-build.mjs";
import { hook, sleep } from "./rest.mjs";
import fs from "fs";
const bed = JSON.parse(fs.readFileSync(new URL("./bed.json", import.meta.url)));
const fc = { startDate:"customfield_10015", dueDate:"duedate", duration:"customfield_10180", buffer:"customfield_10181" };
await setDates(bed.epic2, { start:"2026-08-03", due:"2026-11-13", duration:66, buffer:"No" }, fc);
await sleep(5000);
console.log("reindex", (await hook(`what=refreshPlan&planId=${bed.p2}`)).ok);

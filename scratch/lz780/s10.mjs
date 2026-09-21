import { rest, sleep } from "./rest.mjs";
const P = process.env.PLAN_ID;
const ai = await rest(`resource=ai&planId=${P}&action=group`, { method:"POST", body:{} });
console.log("AI group:", ai.status, JSON.stringify(ai).slice(0, 400));
await sleep(2000);
const view = await rest(`resource=ai&planId=${P}`);
const v = view.view || view;
console.log("view keys:", Object.keys(v||{}).slice(0,20).join(","), "storylines:", (v.storylines||[]).length, "none:", v.storylinesNone, "segments:", (v.segments||[]).length);

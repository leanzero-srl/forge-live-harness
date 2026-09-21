import { rest, sleep } from "./rest.mjs";
const P = process.env.PLAN_ID;
async function capture(name, template) {
  const begin = await rest(`resource=reports&planId=${P}`, { method:"POST", body:{ name, ...(template?{template}:{}) } });
  const jobId = begin.job?.id;
  console.log("capture begin:", begin.status, "job", jobId, "done", begin.done);
  let last = begin;
  for (let i=0;i<40 && !last.done;i++) {
    await sleep(2000);
    last = await rest(`resource=reports&planId=${P}&action=run&jobId=${jobId}`, { method:"POST" });
    if (i%5===0) console.log("  run:", last.status, "done", last.done, "stage", last.job?.stage || last.stage);
  }
  console.log("capture end:", JSON.stringify({done:last.done, reportId:last.reportId||last.job?.reportId, error:last.error}).slice(0,200));
  return last.reportId || last.job?.reportId;
}
const a = await capture("LZ780 archive");
const s = await capture("LZ780 storyline", "storyline");
console.log("ARCHIVE", a, "STORYLINE", s);
const list = await rest(`resource=reports&planId=${P}`);
console.log("REPORTS:", JSON.stringify((list.reports||[]).map(r=>({id:r.id,name:r.name,template:r.template,capturedAt:r.capturedAt}))));

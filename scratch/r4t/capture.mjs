import { rest, sleep } from "./rest.mjs";
const P = process.env.PLAN;
async function capture(name, template) {
  let r = await rest(`resource=reports&planId=${P}`, { method: "POST", body: { name, ...(template ? { template } : {}) } });
  console.log("start", JSON.stringify(r).slice(0, 400));
  const jobId = r.job?.id || r.job?.jobId || r.jobId;
  for (let i = 0; i < 40 && !r.done; i++) {
    await sleep(3000);
    r = await rest(`resource=reports&planId=${P}&action=run&jobId=${jobId}`, { method: "POST" });
    process.stdout.write(`.${r.job?.stage || r.job?.status || ""}`);
  }
  console.log("\ndone", r.done, "report", r.report?.id || r.report?.reportId);
  return r;
}
const t = process.argv[2], n = process.argv[3];
console.log(JSON.stringify(await capture(n, t === "storyline" ? "storyline" : null)).slice(0, 2000));

const r = await import("/Users/mihaiperdum/Projects/ChatWise/src/shared/productOwner/routing.js");
const KEYISH = /\b[A-Z][A-Z0-9_]{1,9}-\d+\b/;
// Every app-authored sentence this module can emit.
const sentences = [
  r.projectListUnavailableNote(403),
  r.projectListUnavailableNote(null),
  r.projectListEmptyNote(),
];
for (const s of sentences) console.log(KEYISH.test(s) ? "KEY-SHAPED TOKEN FOUND: " : "clean: ", JSON.stringify(s));
// buildProjectOptions ranking + question text
const projects = [
  {key:"CGL1",name:"CogniRunner Rule Lab 1"},{key:"CGL2",name:"CogniRunner Rule Lab 2"},
  {key:"COGTEST",name:"CogniRunner Test Harness"},{key:"BDP",name:"DEMAND PROCESS"},
  {key:"WFH",name:"WORK FOR HIRE"},
];
console.log(JSON.stringify(r.buildProjectOptions(projects,{established:["WFH"],total:18}),null,1));
console.log(JSON.stringify(r.buildProjectOptions(projects,{established:[],total:5}),null,1));
// an established key that is NOT in the visible list must not appear
console.log(JSON.stringify(r.buildProjectOptions(projects,{established:["NOPE"],total:18}).question));
// establishedProjectKeys must refuse a key Jira does not confirm
console.log("established(fake):", JSON.stringify(r.establishedProjectKeys({history:[{role:"assistant",content:"Created ADC2C-14"}],realKeys:["WFH"]})));
console.log("established(real):", JSON.stringify(r.establishedProjectKeys({history:[{role:"assistant",content:"Created WFH-2255 then COGTEST-1"}],realKeys:["WFH","COGTEST"]})));
console.log("handoffAllowed opening:", r.handoffAllowed({}), " docFork:", r.handoffAllowed({offerBacklog:true}));

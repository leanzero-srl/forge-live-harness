import assert from 'node:assert/strict';
export function assertDiagnosticReceipt(receipt, now=Date.now()) {
 assert.ok(receipt,'Actual installed launcher receipt is required');
 const expected={mode:'portable-chrome152',browserVersion:'152.0.7977.76',principalSha256:'b4cb5211a5e4d44c9f3a6bc909588c2fe62162358d4b0c04da52aa6977433769',uiVersion:'4.58.579',executableSha256:'755178ee89130a6f1c94cc4ecb2289fe74240db3e7efe9ec69a6cfcd4b93a6ee',frameworkSha256:'bfea9981cc61dfa72d847c920f274e4e96e362954f451198d8ee1650cbefb2e6',appUrl:'https://wolfaenpak.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/d6096af9-3082-4ee1-a05e-f8b61d766b77'};
 for(const[key,value]of Object.entries(expected))assert.equal(receipt[key],value,`Actual diagnostic receipt ${key}`);
 const age=now-Date.parse(receipt.admittedAt);assert.ok(Number.isFinite(age)&&age>=0&&age<=300000,'Actual receipt must be fresh and not future dated');
 return receipt;
}
export async function readDiagnosticRuntime(context) {
 const cdp=await context.newCDPSession(context.pages()[0]);
 try {const version=await cdp.send('Browser.getVersion');assert.equal(version.product,'Chrome/152.0.7977.76','Actual CDP runtime version');return version;}
 finally {await cdp.detach();}
}

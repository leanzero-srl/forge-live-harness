// Both original source identity and additive diagnostic provenance run first.
import './campaign-diagnostic-identity.spec';
import fs from 'node:fs';import path from 'node:path';
import {test,expect} from '../../fixtures/forge';
import {getHarnessLaunchReceipt} from '../../forge/browser';
import {assertDiagnosticReceipt} from './portable-diagnostic-receipt.mjs';
test('admission: installed portable Chrome152 receipt agrees with actual runtime after original45 and retained diagnostic reads',async({page})=>{
 expect(process.env.LZ_HARNESS_BROWSER_MODE).toBe('portable-chrome152');const receipt=assertDiagnosticReceipt(getHarnessLaunchReceipt(page.context()));const dir=process.env.LZ_CAMPAIGN_UNIT_DIR!,phase=process.env.LZ_CAMPAIGN_PHASE!;
 const source=JSON.parse(fs.readFileSync(path.join(dir,`${phase}-identity.json`),'utf8')),diagnostic=JSON.parse(fs.readFileSync(path.join(dir,`${phase}-diagnostic-provenance.json`),'utf8'));expect(source.issueCount).toBe(45);expect(source.planIds).toEqual(diagnostic.planIds);expect(diagnostic.summary.id).toBe('4fbb1943-7064-4dc1-8faa-e06816c188f6');
 const cdp=await page.context().newCDPSession(page);try{const version=await cdp.send('Browser.getVersion');expect(version.product).toBe('Chrome/152.0.7977.76');fs.writeFileSync(path.join(dir,`${phase}-portable-receipt.json`),JSON.stringify({receipt,actualRuntime:version,originalGuardTime:source.time,diagnosticGuardTime:diagnostic.time},null,2)+'\n');}finally{await cdp.detach();}
});

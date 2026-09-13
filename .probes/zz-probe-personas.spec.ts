import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, assertLoggedIn, openGlobalPage, callResolver, waitForChatApp } from "./chatwise-support";
const T = getTarget("chatwise-global");
test.describe.configure({ timeout: 240_000 });
test("PROBE: persona model settings", async ({ page }) => {
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  for (const m of ["getPersonas", "listPersonas", "getConfig", "getSettings"]) {
    const r = await callResolver<any>(frame, GLOBAL_APP, m, {}).catch((e) => ({ threw: String(e).slice(0, 120) }));
    if (r?.personas) console.log(m + " MODELS -> " + JSON.stringify(r.personas.map((p:any)=>({id:p.id,name:p.name,model:p.modelSettings?.defaultModel}))));
  }
  const inApp = await frame.locator("body").evaluate(() => {
    const app = (window as any).chatWiseGlobal;
    const ps = app?.services?.personas?.personas || app?.state?.personas || null;
    return ps ? ps.map((p: any) => ({ id: p.id, name: p.name, model: p.settings?.defaultModel ?? p.defaultModel ?? p.model })) : "not found";
  });
  console.log("IN-APP PERSONAS: " + JSON.stringify(inApp));
});

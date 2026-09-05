import {expect} from '../../fixtures/forge';
import {waitForAppReady} from './settled-screenshot.mjs';
// saveConfig awaits updatePlan and onConfigured (real index/reload), then removes
// this panel. A changing Save/Saving button label is not completion evidence.
export async function assetsConfigured(frame:any,bar:any,fieldCount:number) {
 await expect(bar.getByRole('heading',{name:'Assets fields on this plan',exact:true})).toHaveCount(0,{timeout:120000});
 await expect(bar.locator('[data-testid="assets-match-count"]')).toHaveText(`${fieldCount} Assets field${fieldCount===1?'':'s'}`,{timeout:120000});
 await expect(bar.getByText(/^Read \d+ issues…$/)).toHaveCount(0,{timeout:120000});
 await expect(bar.getByRole('alert')).toHaveCount(0);
 await expect(frame.locator('[data-testid="tab-loading-overlay"]')).toHaveCount(0,{timeout:120000});
 await waitForAppReady(bar);
}

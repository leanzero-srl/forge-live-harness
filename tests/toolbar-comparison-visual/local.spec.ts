import {test,expect} from './local-forge';
test('actual worker fixture cache CDP tracing sizing and teardown with local blank page',async({page})=>{await page.goto('about:blank');for(const width of [1100,1440,1600]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>location.href)).toBe('about:blank');await page.screenshot();}});

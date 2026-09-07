import { expect, test } from '@playwright/test';

test('准备阶段设置与后台事件暂停，恢复必须重新按下',async({page},info)=>{
  await page.addInitScript(()=>localStorage.setItem('undead-tower.audio.v1',JSON.stringify({enabled:false,volume:0})));
  await page.goto('/');await page.getByRole('button',{name:'正式模式'}).click();await page.getByRole('button',{name:'选择步枪',exact:true}).click();await page.getByRole('button',{name:'开始坚守'}).click();
  await page.screenshot({path:info.outputPath('preparation-desktop.png')});
  const state=()=>page.evaluate(()=>window.__undeadTower!.snapshot());
  await page.getByRole('button',{name:'游戏设置',exact:true}).click();const settings=await state();expect(settings.phase).toBe('paused');
  await page.waitForTimeout(250);expect((await state()).rogue!.countdown).toBe(settings.rogue!.countdown);expect((await state()).survived).toBe(0);
  await page.getByRole('button',{name:'关闭设置'}).click();expect((await state()).phase).toBe('countdown');
  await page.getByTestId('game-canvas').dispatchEvent('pointerdown',{button:0,clientX:720,clientY:270});
  // Browser event injection: exercises the real handler/RAF guard, not an OS tab-switch claim.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const hidden=await state();await page.waitForTimeout(300);const after=await state();
  expect(after.phase).toBe('paused');expect(after.renderCount).toBe(hidden.renderCount);expect(after.shots).toBe(hidden.shots);expect(after.rogue).toEqual(hidden.rogue);expect(after.survived).toBe(0);
  await page.evaluate(()=>{delete(document as unknown as {hidden?:boolean}).hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.keyboard.press('Escape');await page.waitForTimeout(150);expect((await state()).shots).toBe(hidden.shots);
  await info.attach('preparation-lifecycle',{body:JSON.stringify({settings,hidden,after}),contentType:'application/json'});
});

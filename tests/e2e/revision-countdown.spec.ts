import { expect, test } from '@playwright/test';
import { WEAPONS } from '../../src/game/weapons';

for (const weapon of WEAPONS) test(`${weapon.id} 准备阶段可以瞄准射击换弹使用技能，暂停后冻结`, async ({page},info)=>{
  await page.addInitScript(()=>localStorage.setItem('undead-tower.audio.v1',JSON.stringify({enabled:false,volume:0})));
  await page.goto('/');
  await page.getByRole('button',{name:'正式模式'}).click();
  await page.getByRole('button',{name:`选择${weapon.label}`,exact:true}).click();
  await page.getByRole('button',{name:'开始坚守'}).click();
  const canvas=page.getByTestId('game-canvas');
  const state=()=>page.evaluate(()=>window.__undeadTower!.snapshot());
  expect((await state()).phase).toBe('countdown');
  await expect(page.locator('.crosshair')).toBeVisible();await expect(page.getByTestId('ammo')).toBeVisible();
  await expect(page.locator('.wave-countdown')).toBeVisible();
  const bounds=await page.locator('.wave-countdown').boundingBox();expect(bounds!.height).toBeLessThan(140);
  expect(await page.locator('.wave-countdown').evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
  // Native pointer input traverses the page, so an accidentally restored overlay breaks this assertion.
  await page.mouse.move(790,270);await page.mouse.down();await page.mouse.up();
  const fired=await state();
  expect(fired.shots).toBeGreaterThanOrEqual(1);
  expect(fired.ammo).toBe(weapon.capacity-fired.shots);
  // 为换弹与技能冲突保留完整三秒窗口，避免把浏览器自动化耗时算进机械规则。
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'重新开始坚守'}).click();
  // 上方原生坐标点击已覆盖倒计时层的命中测试；重开后的冲突段直接派发到
  // 同一 canvas 监听器，避免 React 移除暂停层时的布局帧令坐标点击落空。
  await canvas.dispatchEvent('pointerdown',{button:0,clientX:790,clientY:270});
  await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{button:0})));
  await expect.poll(async()=> (await state()).ammo).toBe(weapon.capacity-1);
  await page.keyboard.press('r');
  // 霰弹只装一发时换弹窗口为 0.4 秒；在页面 RAF 内采样，避免跨进程
  // poll 的退避间隔恰好越过完整窗口。
  await page.evaluate(async()=>{
    const deadline=performance.now()+4000;
    while(performance.now()<deadline){
      if(window.__undeadTower!.snapshot().reloading)return;
      await new Promise(requestAnimationFrame);
    }
    throw new Error('未捕获准备阶段换弹');
  });
  await canvas.dispatchEvent('pointerdown',{button:2});
  expect((await state()).rogue!.skill.activations).toBe(0);
  await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{button:2})));
  await page.keyboard.press('Escape');
  const paused=await state();expect(paused.phase).toBe('paused');expect(paused.survived).toBe(0);expect(paused.totalSpawned).toBe(0);
  await page.waitForTimeout(250);expect((await state()).reload.remaining).toBe(paused.reload.remaining);
  await page.keyboard.press('Escape');
  await expect.poll(async()=> (await state()).reloading,{timeout:5000}).toBe(false);
  // 用正常重开获得完整准备窗口，不把自动化命令耗时当作游戏机械时间。
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'重新开始坚守'}).click();
  const beforeSkill=await state();expect(beforeSkill.phase).toBe('countdown');expect(beforeSkill.survived).toBe(0);
  await canvas.dispatchEvent('pointerdown',{button:2});await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{button:2})));
  expect((await state()).rogue!.skill.activations).toBe(1);
  if(weapon.id==='pistol') await page.screenshot({path:info.outputPath('preparation-operable.png')});
  await expect.poll(async()=> (await state()).phase).toBe('playing');
  expect((await state()).rogue!.skill.remaining).toBeLessThan(beforeSkill.rogue!.skillStats.duration);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  expect((await state()).phase).toBe('paused');const frozen=await state();await page.waitForTimeout(150);
  expect((await state()).survived).toBe(frozen.survived);expect((await state()).rogue!.skill.remaining).toBe(frozen.rogue!.skill.remaining);
});

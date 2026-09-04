import { expect, test, type Page } from '@playwright/test';
import { ROGUE_KEY } from '../../src/game/rogue';
const snapshot = (page: Page) => page.evaluate(() => window.__undeadTower!.snapshot());
async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '正式模式' }).click();
  await page.getByRole('button', { name: '选择半自动手枪' }).click();
  await page.getByRole('button', { name: '开始坚守' }).click();
}
// 用真实游戏输入事件完成战斗；只读取诊断信息，不改血量、波数、速度或升级结果。
async function clearWave(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const canvas = document.querySelector('canvas')!;
    let next = 0, lastTarget = -1;
    const blocked = new Map<number, number>(), deadline = performance.now() + 100000;
    const tick = (now: number) => {
      const state = window.__undeadTower!.snapshot();
      if (state.phase === 'upgrade') { resolve(state.rogue!.wave); return; }
      if (state.phase === 'failed' || state.phase === 'breaching') { reject(new Error(`自动操作在第 ${state.rogue!.wave} 波失败`)); return; }
      if (now > deadline) { reject(new Error(`第 ${state.rogue!.wave} 波超时`)); return; }
      if (state.phase === 'playing' && now >= next && !state.reloading) {
        if (state.ammo === 0) { window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyR',key:'r',bubbles:true})); next = now + 100; }
        else {
          if (lastTarget >= 0 && state.lastShot?.hitTarget !== lastTarget) blocked.set(lastTarget, now + 1500);
          lastTarget = -1;
          const target = state.targets.filter(z => z.health > 0 && z.head.x > 30 && z.head.x < innerWidth-30 && z.head.y > 130 && z.head.y < innerHeight-100 && (blocked.get(z.id) ?? 0) < now)
            .sort((a,b) => Math.hypot(a.x,a.z-9)/(a.kind==='football'?2:a.kind==='giant'?.5:1)-Math.hypot(b.x,b.z-9)/(b.kind==='football'?2:b.kind==='giant'?.5:1))[0];
          if (target) {
            const rect = canvas.getBoundingClientRect();
            const input = {clientX:target.head.x+rect.x,clientY:target.head.y+rect.y,button:0,bubbles:true};
            canvas.dispatchEvent(new PointerEvent('pointermove',input)); canvas.dispatchEvent(new PointerEvent('pointerdown',input));
            window.dispatchEvent(new PointerEvent('pointerup',input));
            lastTarget = target.id; next = now + state.rogue!.stats.interval * 1000 + 70;
          }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

test('肉鸽清波、三选一、高级僵尸、自然失败及独立波数榜', async ({page}) => {
  test.setTimeout(600000);
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('undead-tower.leaderboard.armor-v3','[]'));
  await start(page);
  await expect.poll(async()=> (await snapshot(page)).phase).toBe('countdown');
  await page.keyboard.press('Escape');
  const frozen=await snapshot(page); await page.waitForTimeout(250); expect((await snapshot(page)).rogue!.countdown).toBe(frozen.rogue!.countdown);
  await page.keyboard.press('Escape');
  await expect.poll(async()=> (await snapshot(page)).phase).toBe('playing');
  await page.keyboard.press('1'); await page.mouse.wheel(0,150);
  expect((await snapshot(page)).weaponIndex).toBe(2);
  await expect(page.getByRole('group',{name:'切换武器'})).toHaveCount(0);
  for(let wave=1;wave<=8;wave++) {
    expect(await clearWave(page)).toBe(wave);
    console.log(`已通过第 ${wave} 波`);
    const state=await snapshot(page); expect(state.rogue!.completed).toBe(wave); expect(state.blockedZombies).toEqual([]);
    await expect(page.getByRole('region',{name:'波次升级'})).toBeVisible();
    await expect(page.locator('.upgrade-card')).toHaveCount(3);
    if(wave===1) {
      await page.screenshot({path:'test-results/rogue-upgrades.png'});
      await page.waitForTimeout(300); expect((await snapshot(page)).survived).toBe(state.survived);
    }
    const choices=state.rogue!.choices;
    const selected=choices.includes('damage')?'damage':choices.includes('head')?'head':choices[0];
    const labels={damage:'强装药',head:'精准射击',magazine:'扩容弹匣',reload:'快速装填',rate:'轻快扳机'};
    await page.getByRole('button',{name:new RegExp(labels[selected])}).click();
    await page.getByRole('button',{name:`应用升级，开始第 ${wave+1} 波`}).click();
    const after=await snapshot(page); expect(after.rogue!.levels[selected]).toBe(state.rogue!.levels[selected]+1);
    expect(after.ammo).toBe(after.rogue!.stats.capacity);
  }
  await expect(page.getByRole('region',{name:'游戏结束'})).toBeVisible({timeout:90000});
  const ended=await snapshot(page); expect(ended.result!.rogue!.completed).toBe(8);
  expect(ended.result!.rogue!.failedWave).toBe(9); expect(ended.breachElapsed).toBe(2);
  await expect(page.getByTestId('survival-result')).toHaveText('8 波');
  await expect(page.locator('.record-notice')).toContainText('已保存');
  await page.screenshot({path:'test-results/rogue-result.png'});
  const entries=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),ROGUE_KEY); expect(entries).toHaveLength(1);
  expect(await page.evaluate(()=>localStorage.getItem('undead-tower.leaderboard.armor-v3'))).toBe('[]');
  await page.getByRole('button',{name:'再守一次'}).click();
  expect((await snapshot(page)).rogue!.levels).toEqual({damage:0,head:0,rate:0,magazine:0,reload:0});
  await page.reload(); await page.getByRole('button',{name:'查看排行榜'}).click();
  await expect(page.getByRole('table')).toContainText('8 波'); expect(errors).toEqual([]);
});

test('手枪肉鸽选择页在窄屏可操作，返回练习仍保留六枪',async({page})=>{
  await page.setViewportSize({width:375,height:844}); await page.goto('/');
  await page.getByRole('button',{name:'正式模式'}).click(); await page.getByRole('button',{name:'开始坚守'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/rogue-menu-mobile.png'});
  await page.setViewportSize({width:1440,height:900}); await start(page); await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'返回主菜单',exact:true}).click(); await page.getByRole('button',{name:'练习模式'}).click();
  await page.getByRole('button',{name:'进入哨站'}).click();
  await expect(page.getByRole('group',{name:'切换武器'})).toBeVisible(); expect((await snapshot(page)).targets).toHaveLength(4);
});
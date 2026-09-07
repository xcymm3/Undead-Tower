import { clearWave } from './rogue-helpers';
import { expect, test, type Page } from '@playwright/test';
import { ROGUE_KEY, UPGRADES, freshLevels } from '../../src/game/rogue';
const snapshot = (page: Page) => page.evaluate(() => window.__undeadTower!.snapshot());
async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '正式模式' }).click();
  await page.getByRole('button', { name: '选择半自动手枪' }).click();
  await page.getByRole('button', { name: '开始坚守' }).click();
}

test('肉鸽清波、三选一、高级僵尸、自然失败及独立波数榜', async ({page}) => {
  test.setTimeout(900000);
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
      await page.screenshot({path:test.info().outputPath('rogue-upgrades.png')});
      await page.waitForTimeout(300); expect((await snapshot(page)).survived).toBe(state.survived);
    }
    const choices=state.rogue!.choices;
    const selected=choices.includes('damage')?'damage':choices.includes('critical_chance')?'critical_chance':choices[0];
    const labels = UPGRADES;
    await page.locator('.upgrade-cards').getByRole('button',{name:new RegExp(labels[selected].name)}).click();
    await page.getByRole('button',{name:`应用升级，开始第 ${wave+1} 波`}).click();
    await expect.poll(async () => (await snapshot(page)).phase).toBe('countdown');
    const after=await snapshot(page); expect(after.rogue!.levels[selected]).toBe(state.rogue!.levels[selected]+1);
    expect(after.ammo).toBe(after.rogue!.stats.capacity);
  }
  await expect(page.getByRole('region',{name:'游戏结束'})).toBeVisible({timeout:90000});
  const ended=await snapshot(page); expect(ended.result!.rogue!.completed).toBe(8);
  expect(ended.result!.rogue!.failedWave).toBe(9); expect(ended.breachElapsed).toBe(2);
  await expect(page.getByTestId('survival-result')).toHaveText('8 波');
  await expect(page.locator('.record-notice')).toContainText('已保存');
  await page.screenshot({path:test.info().outputPath('rogue-result.png')});
  const entries=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),ROGUE_KEY); expect(entries).toHaveLength(1);
  expect(await page.evaluate(()=>localStorage.getItem('undead-tower.leaderboard.armor-v3'))).toBe('[]');
  await page.getByRole('button',{name:'再守一次'}).click();
  expect((await snapshot(page)).rogue!.levels).toEqual(freshLevels());
  await page.reload(); await page.getByRole('button',{name:/排行榜/}).click();
  await expect(page.getByRole('table')).toContainText('8 波'); expect(errors).toEqual([]);
});

test('手枪肉鸽选择页在窄屏可操作，返回练习仍保留六枪',async({page})=>{
  await page.setViewportSize({width:375,height:844}); await page.goto('/');
  await page.getByRole('button',{name:'正式模式'}).click(); await page.getByRole('button',{name:'开始坚守'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:test.info().outputPath('rogue-menu-mobile.png')});
  await page.setViewportSize({width:1440,height:900}); await start(page); await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'返回主菜单',exact:true}).click(); await page.getByRole('button',{name:'练习模式'}).click();
  await page.getByRole('button',{name:'进入哨站'}).click();
  await expect(page.getByRole('group',{name:'切换武器'})).toBeVisible(); expect((await snapshot(page)).targets).toHaveLength(4);
});

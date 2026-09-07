import { expect, test } from '@playwright/test';

test('标题和暂停按需绘制，后台停止绘制且不增加成绩或技能时间', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('undead-tower.audio.v1', JSON.stringify({ enabled: false, volume: 0 })));
  await page.goto('/');
  const snapshot = () => page.evaluate(() => window.__undeadTower!.snapshot());
  await expect.poll(async () => (await snapshot()).weaponAnimation.loaded).toBe(true);
  await page.waitForTimeout(300); const title = await snapshot();
  await page.waitForTimeout(500); expect((await snapshot()).renderCount).toBe(title.renderCount);
  await page.getByRole('button', { name: '正式模式' }).click();
  await page.getByRole('button', { name: '开始坚守' }).click();
  await expect.poll(async () => (await snapshot()).phase).toBe('playing');
  await page.getByTestId('game-canvas').dispatchEvent('pointerdown', { button: 2 });
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const paused = await snapshot(); await page.waitForTimeout(500);
  const afterPause = await snapshot();
  expect(afterPause.renderCount).toBe(paused.renderCount); expect(afterPause.survived).toBe(paused.survived);
  expect(afterPause.rogue!.skill).toEqual(paused.rogue!.skill);
  await page.getByRole('button', { name: '继续游戏' }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await snapshot(); await page.waitForTimeout(600);
  const afterHidden = await snapshot();
  expect(afterHidden.phase).toBe('paused'); expect(afterHidden.renderCount).toBe(hidden.renderCount);
  expect(afterHidden.survived).toBe(hidden.survived); expect(afterHidden.rogue!.skill).toEqual(hidden.rogue!.skill);
  await page.evaluate(() => { delete (document as unknown as { hidden?: boolean }).hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(150); expect((await snapshot()).phase).toBe('paused');
  await info.attach('idle-render-and-clock', { body: JSON.stringify({ title, paused, afterPause, hidden, afterHidden }), contentType: 'application/json' });
});

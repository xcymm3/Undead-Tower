import { expect, test } from '@playwright/test';

test('音量即时生效，静音独立保存，刷新与重开不丢失偏好', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '进入哨站' }).click();
  await page.getByRole('button', { name: '游戏设置' }).click();
  const volume = page.getByRole('slider', { name: '总音量' });
  await volume.fill('37');
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.gain).toBeCloseTo(0.37);
  await page.getByRole('checkbox', { name: '游戏声音' }).uncheck();
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.gain).toBe(0);
  await page.getByRole('button', { name: '返回哨站' }).click();
  await page.reload();
  await page.getByRole('button', { name: '游戏设置' }).click();
  await expect(volume).toHaveValue('37');
  await expect(page.getByRole('checkbox', { name: '游戏声音' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: '游戏声音' }).check();
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.gain).toBeCloseTo(0.37);
  await volume.fill('0');
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.gain).toBe(0);
  await volume.fill('37');
  await page.screenshot({ path: 'test-results/audio-settings.png' });
  await page.getByRole('button', { name: '返回哨站' }).click();
  await page.getByRole('button', { name: '进入哨站' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '重新开始训练' }).click();
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.volume).toBe(0.37);
});

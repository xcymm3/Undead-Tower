import { expect, test } from '@playwright/test';
import { WEAPONS } from '../../src/game/weapons';
import { freshLevels } from '../../src/game/rogue';

for (const [index, weapon] of WEAPONS.entries()) test(`${weapon.id} 正式选择、技能、暂停与清空重开`, async ({ page }, info) => {
  test.setTimeout(45000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('undead-tower.audio.v1', JSON.stringify({ enabled: false, volume: 0 })));
  await page.goto('/');
  expect(await page.evaluate(() => window.__undeadReplay)).toBeUndefined();
  await page.getByRole('button', { name: '正式模式' }).click();
  await page.getByRole('button', { name: `选择${weapon.label}`, exact: true }).click();
  await page.getByRole('button', { name: '开始坚守' }).click();
  await expect.poll(() => page.evaluate(() => window.__undeadTower!.snapshot().phase)).toBe('playing');
  const state = () => page.evaluate(() => window.__undeadTower!.snapshot());
  expect((await state()).weaponIndex).toBe(index);
  await page.keyboard.press('1'); expect((await state()).weaponIndex).toBe(index);
  const canvas = page.getByTestId('game-canvas');
  await canvas.dispatchEvent('pointerdown', { button: 2, buttons: 2 });
  await expect.poll(async () => (await state()).rogue!.skill.active).toBe(true);
  await canvas.dispatchEvent('pointerdown', { button: 2, buttons: 2 });
  expect((await state()).rogue!.skill.activations).toBe(1);
  // Real game input, with a deterministic empty-sky point; no direct state mutation.
  await canvas.dispatchEvent('pointerdown', { button: 0, buttons: 3, clientX: 720, clientY: 270 });
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', {button:0})));
  expect((await state()).shots).toBeGreaterThanOrEqual(1);
  if (weapon.id === 'rifle') expect((await state()).ammo).toBe(weapon.capacity);
  if (weapon.id === 'pistol') {
    await expect.poll(async () => (await state()).offhandVisible).toBe(true);
    const dual = await state(); expect(dual.offhandMuzzle[0]).not.toBe(dual.muzzle[0]);
  }
  await page.screenshot({ path: info.outputPath(`${weapon.id}-active.png`) });
  await page.keyboard.press('Escape');
  const paused = await state(); await page.waitForTimeout(220);
  expect((await state()).rogue!.skill).toEqual(paused.rogue!.skill);
  expect((await state()).survived).toBe(paused.survived);
  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect.poll(async () => page.getByRole('complementary', { name: '右键技能状态' }).innerText(), { timeout: 9000, intervals: [80] }).toContain('技能结束');
  expect((await state()).rogue!.skill.active).toBe(false);
  expect((await state()).offhandVisible).toBe(false);
  await page.screenshot({ path: info.outputPath(`${weapon.id}-ended.png`) });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '重新开始坚守' }).click();
  const restarted = await state();
  expect(restarted.phase).toBe('countdown'); expect(restarted.rogue!.weapon).toBe(weapon.id);
  expect(restarted.rogue!.levels).toEqual(freshLevels()); expect(restarted.rogue!.skill.cooldownRemaining).toBe(0);
  expect(restarted.offhandVisible).toBe(false); expect(restarted.ammo).toBe(weapon.capacity);
  expect(errors).toEqual([]);
});

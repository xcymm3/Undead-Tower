import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LEADERBOARD_KEY } from '../../src/game/leaderboard';

const snapshot = (page: Page) => page.evaluate(() => window.__undeadTower!.snapshot());
async function startSurvival(page: Page, difficulty = '困难') {
  await page.goto('/');
  await page.getByRole('button', { name: '正式模式' }).click();
  await page.getByRole('group', { name: '选择难度' }).getByRole('button', { name: difficulty, exact: true }).click();
  await page.getByRole('button', { name: '开始坚守' }).click();
  await expect.poll(async () => (await snapshot(page)).mode).toBe('survival');
}

test('正式模式移动、暂停、失败结算与刷新后排行榜持久化', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await startSurvival(page);
  await expect.poll(async () => (await snapshot(page)).targets.length).toBeGreaterThan(0);
  const first = (await snapshot(page)).targets[0];
  await expect.poll(async () => (await snapshot(page)).targets.find(z => z.id === first.id)!.z).toBeGreaterThan(first.z + 0.3);
  const moved = (await snapshot(page)).targets[0];
  expect(Math.hypot(moved.x, moved.z - 9)).toBeLessThan(Math.hypot(first.x, first.z - 9));
  await page.keyboard.press('Escape');
  const paused = await snapshot(page);
  await page.waitForTimeout(500);
  const frozen = await snapshot(page);
  expect(frozen.survived).toBe(paused.survived);
  expect(frozen.targets).toEqual(paused.targets);
  expect(frozen.totalSpawned).toBe(paused.totalSpawned);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).totalSpawned, { timeout: 12000 }).toBeGreaterThanOrEqual(8);
  const arrivals = (await snapshot(page)).targets;
  expect(new Set(arrivals.map(z => z.spawnZone)).size).toBe(8);
  expect(arrivals.some(z => z.spawnZone === 'north-road')).toBe(true);
  expect(new Set(arrivals.map(z => z.breachTarget!.x.toFixed(5))).size).toBeGreaterThanOrEqual(7);
  for (const zombie of arrivals) {
    expect(Math.hypot(zombie.breachTarget!.x, zombie.breachTarget!.z - 9)).toBeCloseTo(8, 8);
    expect(zombie.breachTarget!.z).toBeLessThan(9);
  }
  await expect.poll(async () => (await snapshot(page)).targets.some(z => z.health > 0 && !z.waypoint), { timeout: 15000 }).toBe(true);
  for (const original of arrivals) {
    const current = (await snapshot(page)).targets.find(z => z.id === original.id);
    if (current) expect(current.breachTarget).toEqual(original.breachTarget);
  }
  await page.screenshot({ path: 'test-results/survival-playing.png' });
  // 真实移动模型必须能被枪口射线击杀，成绩不能只验证零击杀的空局。
  for (let shot = 0; shot < 5 && (await snapshot(page)).kills === 0; shot++) {
    const target = (await snapshot(page)).targets.find(z => z.id === first.id)!;
    await page.mouse.click(target.head.x, target.head.y);
    await page.waitForTimeout(150);
  }
  expect((await snapshot(page)).kills).toBeGreaterThan(0);
  expect((await snapshot(page)).blood.bursts).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: '防线失守' })).toBeVisible({ timeout: 45000 });
  const ended = await snapshot(page);
  expect(ended.phase).toBe('failed');
  expect(ended.nearest).toBeCloseTo(8, 6);
  const breached = ended.targets.filter(z => z.health > 0).sort((a, b) => Math.hypot(a.x, a.z - 9) - Math.hypot(b.x, b.z - 9))[0];
  expect(breached.head.x).toBeGreaterThan(10);
  expect(breached.head.x).toBeLessThan(1430);
  expect(breached.head.y).toBeGreaterThan(0);
  expect(breached.head.y).toBeLessThan(900);
  expect(ended.result!.duration).toBeGreaterThan(1);
  await page.mouse.click(20, 500);
  await page.keyboard.press('r');
  await page.keyboard.press('Escape');
  expect((await snapshot(page)).phase).toBe('failed');
  expect((await snapshot(page)).shots).toBe(ended.shots);
  expect((await snapshot(page)).survived).toBe(ended.survived);
  await page.screenshot({ path: 'test-results/survival-result.png' });
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), LEADERBOARD_KEY);
  expect(stored).toHaveLength(1);
  expect(stored[0].id).toBe(ended.result!.id);
  expect(stored[0].kills).toBe(ended.kills);
  expect(stored[0].kills).toBeGreaterThan(0);
  await page.getByRole('button', { name: '再守一次' }).click();
  const reset = await snapshot(page);
  expect(reset.phase).toBe('playing');
  expect(reset.difficulty).toBe('hard');
  expect(reset.survived).toBeLessThan(1);
  expect(reset.shots).toBe(0);
  expect(reset.blood.active).toBe(0);
  expect(reset.blood.bursts).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '返回主菜单' }).click();
  await page.reload();
  await page.getByRole('button', { name: '查看排行榜' }).click();
  await page.getByRole('group', { name: '排行榜难度' }).getByRole('button', { name: '困难', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.getByRole('group', { name: '排行榜难度' }).getByRole('button', { name: '简单', exact: true }).click();
  await expect(page.getByText('还没有坚守纪录')).toBeVisible();
  expect(errors).toEqual([]);
});

test('三档难度传入真实逻辑，返回练习模式后不再刷新和移动', async ({ page }) => {
  for (const [label, key] of [['简单', 'easy'], ['普通', 'normal'], ['困难', 'hard']]) {
    await startSurvival(page, label);
    expect((await snapshot(page)).difficulty).toBe(key);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '返回主菜单' }).click();
  }
  await page.getByRole('button', { name: '练习模式' }).click();
  await page.getByRole('button', { name: '进入哨站' }).click();
  const first = await snapshot(page);
  await page.waitForTimeout(450);
  const later = await snapshot(page);
  expect(later.mode).toBe('practice');
  expect(later.targets).toEqual(first.targets);
  expect(later.survived).toBe(0);
  expect(later.totalSpawned).toBe(0);
  expect(await page.evaluate(key => localStorage.getItem(key), LEADERBOARD_KEY)).toBeNull();
});

test('正式模式选择和排行榜在小屏可操作', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '正式模式' }).click();
  await page.getByRole('group', { name: '选择难度' }).getByRole('button', { name: '普通', exact: true }).click();
  const button = await page.getByRole('button', { name: '开始坚守' }).boundingBox();
  expect(button!.y + button!.height).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/survival-menu-375.png' });
  await page.getByRole('button', { name: '查看排行榜' }).click();
  await expect(page.getByRole('heading', { name: '坚守排行榜' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

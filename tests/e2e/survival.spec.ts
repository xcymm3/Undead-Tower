import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { LEADERBOARD_KEY } from '../../src/game/leaderboard';

const snapshot = (page: Page) => page.evaluate(() => window.__undeadTower!.snapshot());
async function startSurvival(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '正式模式' }).click();
  await expect(page.getByRole('group', { name: '选择难度' })).toHaveCount(0);
  await page.getByRole('button', { name: '开始坚守' }).click();
  await expect.poll(async () => (await snapshot(page)).mode).toBe('survival');
}

test('正式模式移动、暂停、失败结算与刷新后排行榜持久化', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(key => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify([{ id: 'previous-best', difficulty: 'hard', duration: 5, kills: 0, hits: 0, shots: 0, endedAt: '2026-09-03T08:00:00.000Z' }]));
  }, LEADERBOARD_KEY);
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
  for (const zombie of arrivals) {
    expect(zombie).not.toHaveProperty('waypoint');
    expect(zombie).not.toHaveProperty('breachTarget');
    if (zombie.heading !== undefined) expect(Number.isFinite(zombie.heading)).toBe(true);
  }
  expect((await snapshot(page)).blockedZombies).toEqual([]);
  expect((await snapshot(page)).obstacles.length).toBeGreaterThan(180);
  await expect(page.locator('.defense-legend')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/survival-playing.png' });
  // 真实移动模型必须能被枪口射线击杀，成绩不能只验证零击杀的空局。
  for (let shot = 0; shot < 5 && (await snapshot(page)).kills === 0; shot++) {
    const target = (await snapshot(page)).targets.find(z => z.id === first.id)!;
    await page.mouse.click(target.head.x, target.head.y);
    await page.waitForTimeout(150);
  }
  expect((await snapshot(page)).kills).toBeGreaterThan(0);
  expect((await snapshot(page)).blood.bursts).toBeGreaterThan(0);
  // 两秒动画短于慢机器上的多次浏览器往返；在页面 RAF 内采样，保留真实时间推进。
  const sequence = await page.evaluate(() => new Promise<{
    begin: ReturnType<NonNullable<typeof window.__undeadTower>['snapshot']>;
    focus: ReturnType<NonNullable<typeof window.__undeadTower>['snapshot']>;
    end: ReturnType<NonNullable<typeof window.__undeadTower>['snapshot']>;
    inputPhase: string; earlyResult: boolean; culpritId: string | null; frame: string;
  }>(resolve => {
    type State = ReturnType<NonNullable<typeof window.__undeadTower>['snapshot']>;
    let begin: State, focus: State, inputPhase = '', earlyResult = false, culpritId: string | null = null, frame = '';
    const sample = () => {
      const state = window.__undeadTower!.snapshot();
      if (state.phase === 'breaching') {
        if (!begin) {
          begin = state;
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
          document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointerdown', { button: 0 }));
          inputPhase = window.__undeadTower!.snapshot().phase;
        }
        earlyResult ||= Boolean(document.querySelector('.result-screen'));
        culpritId = document.querySelector('[data-testid="breached-zombie"]')?.getAttribute('data-zombie-id') ?? culpritId;
        if (!focus && state.breachElapsed >= 1) {
          focus = state;
          frame = document.querySelector('canvas')!.toDataURL('image/png');
        }
      }
      if (state.phase === 'failed') resolve({ begin, focus, end: state, inputPhase, earlyResult, culpritId, frame });
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  const breachedState = sequence.begin, focus = sequence.focus, ended = sequence.end;
  expect(breachedState).toBeDefined(); expect(focus).toBeDefined();
  expect(breachedState.breachElapsed).toBeLessThan(1);
  expect(breachedState.defenseVisible).toBe(false);
  expect(breachedState.weaponVisible).toBe(false);
  expect(breachedState.audio.musicPlaying).toBe(false);
  expect(breachedState.audio.failureCues).toBe(1);
  expect(breachedState.blockedZombies).toEqual([]);
  expect(sequence.earlyResult).toBe(false);
  expect(sequence.culpritId).toBe(String(breachedState.breach!.id));
  expect(sequence.inputPhase).toBe('breaching');
  expect(focus.cameraPosition).not.toEqual(breachedState.cameraPosition);
  expect(focus.cameraFov).toBe(43);
  expect(focus.survived).toBe(breachedState.survived); expect(focus.shots).toBe(breachedState.shots);
  expect(focus.targets.map(z => [z.id, z.x, z.z, z.health])).toEqual(breachedState.targets.map(z => [z.id, z.x, z.z, z.health]));
  await writeFile('test-results/breach-feedback.png', Buffer.from(sequence.frame.split(',')[1], 'base64'));
  await expect(page.locator('.result-screen')).toBeVisible({ timeout: 3000 });
  expect(ended.phase).toBe('failed'); expect(ended.breachElapsed).toBe(2);
  expect(ended.nearest).toBeCloseTo(8, 6);
  expect(ended.result!.duration).toBeGreaterThan(1);
  expect(ended.survived).toBe(breachedState.survived);
  await expect(page.getByRole('heading', { name: '坚守排行榜' })).toBeVisible();
  await expect(page.getByTestId('personal-record')).toContainText('新纪录');
  await page.screenshot({ path: 'test-results/survival-result.png' });
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), LEADERBOARD_KEY);
  expect(stored).toHaveLength(2);
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
  expect(reset.armorEffects.active).toBe(0);
  expect(reset.breach).toBeNull();
  expect(reset.weaponVisible).toBe(true);
  expect(reset.cameraPosition).toEqual([0, 4.8, 9]);
  expect(reset.cameraFov).toBe(61);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '返回主菜单' }).click();
  await page.reload();
  await page.getByRole('button', { name: '查看排行榜' }).click();
  await expect(page.getByRole('group', { name: '排行榜难度' })).toHaveCount(0);
  await expect(page.getByText('困难难度 · 本机前 10 名')).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('正式模式固定困难，返回练习模式后不再刷新和移动', async ({ page }) => {
  await startSurvival(page);
  expect((await snapshot(page)).difficulty).toBe('hard');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '重新开始坚守' }).click();
  expect((await snapshot(page)).difficulty).toBe('hard');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '返回主菜单' }).click();
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
  await expect(page.getByText('困难难度 · 守住防线')).toBeVisible();
  const button = await page.getByRole('button', { name: '开始坚守' }).boundingBox();
  expect(button!.y + button!.height).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/survival-menu-375.png' });
  await page.getByRole('button', { name: '查看排行榜' }).click();
  await expect(page.getByRole('heading', { name: '坚守排行榜' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

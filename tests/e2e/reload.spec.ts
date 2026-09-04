import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const snapshot = (page: Page) => page.evaluate(() => window.__undeadTower!.snapshot());
async function freezeAt(page: Page, progress: number) {
  await page.evaluate(async threshold => {
    const deadline = performance.now() + 3000;
    while (performance.now() < deadline) {
      const state = window.__undeadTower!.snapshot();
      if (state.reloading && state.reload.progress >= threshold) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); return;
      }
      await new Promise(requestAnimationFrame);
    }
    throw new Error('未捕获换弹阶段');
  }, progress);
}

test('快速换弹的弹匣与左手动画可见，暂停冻结，空仓释放枪机后恢复射击', async ({ page }) => {
  test.setTimeout(45000);
  await page.goto('/'); await page.getByRole('button', { name: '进入哨站' }).click();
  await page.mouse.move(720, 450); await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/weapon-clear-view.png' });
  await page.mouse.click(720, 450);
  const timing = await page.evaluate(async () => {
    const start = performance.now();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
    const remaining = window.__undeadTower!.snapshot().reload.remaining;
    while (window.__undeadTower!.snapshot().reloading && performance.now() - start < 3000) await new Promise(requestAnimationFrame);
    return { remaining, elapsed: (performance.now() - start) / 1000 };
  });
  expect(timing.remaining).toBe(0.775); expect(timing.elapsed).toBeGreaterThan(0.7); expect(timing.elapsed).toBeLessThan(1.3);
  expect((await snapshot(page)).ammo).toBe(30);

  // 暂停通过真实输入触发；仅在证据截图中隐藏暂停遮罩以看清模型姿态。
  await page.addStyleTag({ content: '.pause-screen { visibility: hidden; }' });
  await page.mouse.click(720, 450); await page.keyboard.press('r'); await freezeAt(page, 0.28);
  const removed = await snapshot(page);
  expect(removed.reload.magazine[1]).toBeLessThan(-0.5);
  await page.screenshot({ path: 'test-results/reload-remove.png' });
  await page.waitForTimeout(250);
  expect((await snapshot(page)).reload).toEqual(removed.reload);
  const ui = await page.locator('.game-shell').evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--reload-progress')));
  expect(ui).toBeCloseTo(removed.reload.progress, 6);
  await page.keyboard.press('Escape'); await freezeAt(page, 0.56);
  const inserted = await snapshot(page);
  expect(inserted.reload.hand).not.toEqual(removed.reload.hand);
  await page.screenshot({ path: 'test-results/reload-insert.png' });
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).reloading).toBe(false);
  expect((await snapshot(page)).reload.magazine).toEqual([0, -0.255, -0.4]);

  await page.mouse.down();
  await expect.poll(async () => (await snapshot(page)).ammo, { timeout: 6000 }).toBe(0);
  await page.mouse.up(); await page.keyboard.press('r'); await freezeAt(page, 0.85);
  const empty = await snapshot(page); expect(empty.reload.empty).toBe(true); expect(empty.reload.bolt).toBeGreaterThan(-0.09);
  await page.screenshot({ path: 'test-results/reload-bolt.png' });
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).ammo).toBe(30);
  expect((await snapshot(page)).reload.oldMagazineVisible).toBe(false);
  await page.mouse.click(720, 450); expect((await snapshot(page)).ammo).toBe(29);
});

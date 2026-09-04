import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const snapshot = (page: Page) => page.evaluate(() => window.__undeadTower!.snapshot());
async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '进入哨站' }).click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
}

test('首屏加载、真实开火、枪口火光和装填', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await page.mouse.move(900, 380);
  await page.mouse.down();
  await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(0);
  // 按住期间采样多帧，避免 65 ms 枪口火光被跨进程调度错过。
  const visibleFlash = await page.evaluate(async () => {
    for (let i = 0; i < 40; i++) {
      if (window.__undeadTower!.snapshot().flashVisible) return true;
      await new Promise(requestAnimationFrame);
    }
    return false;
  });
  expect(visibleFlash).toBe(true);
  await page.mouse.up();
  const shot = await snapshot(page);
  expect(shot.ammo).toBe(30 - shot.shots);
  expect(shot.effects).toBeGreaterThan(0);
  const ray = shot.lastShot!;
  const delta = ray.aimPoint.map((v, i) => v - ray.muzzle[i]);
  const length = Math.hypot(...delta);
  expect(delta.reduce((sum, v, i) => sum + v / length * ray.direction[i], 0)).toBeCloseTo(1, 8);
  await page.keyboard.press('r');
  await expect.poll(async () => (await snapshot(page)).reloading).toBe(true);
  await expect(page.getByTestId('ammo')).toHaveText('30', { timeout: 4000 });
  expect(errors).toEqual([]);
});

test('视角小幅阻尼跟随、不会累积转身，枪管与瞄准点一致', async ({ page }) => {
  await start(page);
  await page.mouse.move(1250, 140);
  await expect.poll(async () => Math.abs((await snapshot(page)).yaw)).toBeGreaterThan(0.025);
  for (const [x, y] of [[1350, 250], [80, 650], [1320, 700], [240, 80], [720, 450]]) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(140);
    const s = await snapshot(page);
    expect(Math.abs(s.yaw)).toBeLessThanOrEqual(4 * Math.PI / 180 + 1e-8);
    expect(Math.abs(s.pitch)).toBeLessThanOrEqual(2.5 * Math.PI / 180 + 1e-8);
    const direction = s.aimPoint.map((v, i) => v - s.muzzle[i]);
    const length = Math.hypot(...direction);
    expect(direction.reduce((sum, v, i) => sum + v / length * s.barrelDirection[i], 0)).toBeCloseTo(1, 7);
  }
});

test('瞄准人形靶头部可命中，倒下后自动复位', async ({ page }) => {
  await start(page);
  // 镜头在缓慢跟随，迭代屏幕投影直至鼠标与当前头部位置收敛。
  for (let i = 0; i < 8; i++) {
    const target = (await snapshot(page)).targets[1];
    await page.mouse.move(target.head.x, target.head.y);
    await page.waitForTimeout(120);
  }
  const head = (await snapshot(page)).targets[1].head;
  await page.mouse.click(head.x, head.y);
  await expect.poll(async () => (await snapshot(page)).hits).toBe(1);
  await expect.poll(async () => (await snapshot(page)).kills).toBe(1);
  expect((await snapshot(page)).targets[1].health).toBe(0);
  const killed = await snapshot(page);
  expect(killed.blood.active).toBeGreaterThan(0);
  expect(killed.blood.origin).toEqual(killed.lastShot!.impact);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/blood-kill.png' });
  await expect.poll(async () => (await snapshot(page)).blood.active, { timeout: 3000 }).toBe(0);
  await expect.poll(async () => (await snapshot(page)).targets[1].health, { timeout: 5000 }).toBe(100);
});

test('暂停、设置和失焦不会误射，重新开始清空训练状态', async ({ page }) => {
  await start(page);
  await page.mouse.click(800, 410);
  await page.keyboard.press('Escape');
  expect((await snapshot(page)).phase).toBe('paused');
  const count = (await snapshot(page)).shots;
  await page.mouse.click(100, 500);
  expect((await snapshot(page)).shots).toBe(count);
  await page.getByRole('button', { name: '游戏设置' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#damping')).toHaveCount(0);
  await expect(page.getByRole('slider', { name: '总音量' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await snapshot(page)).phase).toBe('paused');
  await page.getByRole('button', { name: '重新开始训练' }).click();
  expect((await snapshot(page)).shots).toBe(0);
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurred = await snapshot(page);
  expect(blurred.phase).toBe('paused');
  await page.waitForTimeout(350);
  expect((await snapshot(page)).shots).toBe(blurred.shots);
  await page.mouse.up();
});

for (const width of [320, 375, 414, 768]) {
  test(`小屏布局与设置可用 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: '进入哨站' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '游戏设置' }).click();
    await expect(page.getByRole('button', { name: '返回哨站' })).toBeVisible();
    await page.getByRole('checkbox', { name: '粗颗粒像素' }).check();
    await expect(page.getByRole('checkbox', { name: '粗颗粒像素' })).toBeChecked();
    await page.screenshot({ path: `test-results/settings-${width}.png` });
    await page.getByRole('button', { name: '返回哨站' }).click();
    await page.screenshot({ path: `test-results/intro-${width}.png` });
  });
}

test('标题与暂停静止时停止绘制，游戏恢复后重新绘制', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await snapshot(page)).renderCount).toBeGreaterThan(0);
  await page.waitForTimeout(200);
  const ready = (await snapshot(page)).renderCount;
  await page.waitForTimeout(250);
  expect((await snapshot(page)).renderCount).toBe(ready);
  await page.getByRole('button', { name: '进入哨站' }).click();
  await expect.poll(async () => (await snapshot(page)).renderCount).toBeGreaterThan(ready + 3);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const paused = (await snapshot(page)).renderCount;
  await page.waitForTimeout(250);
  expect((await snapshot(page)).renderCount).toBe(paused);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).renderCount).toBeGreaterThan(paused + 3);
});

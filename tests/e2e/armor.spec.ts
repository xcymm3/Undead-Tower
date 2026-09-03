import { expect, test } from '@playwright/test';

test('真实对局在30秒后生成护甲僵尸，路障和铁桶分别需要2次与4次爆头', async ({ page }) => {
  test.setTimeout(80000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '正式模式' }).click();
  await page.getByRole('group', { name: '选择难度' }).getByRole('button', { name: '困难', exact: true }).click();
  await page.getByRole('button', { name: '开始坚守' }).click();
  // 通过真实输入守到铁桶出生；不改游戏时钟、不注入僵尸、不修改生命值。
  const appearance = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas')!;
    const blocked = new Map<number, number>();
    const first: Record<string, number> = {};
    const deadline = performance.now() + 60000;
    while (performance.now() < deadline) {
      const state = window.__undeadTower!.snapshot();
      if (state.phase !== 'playing') return { first, phase: state.phase };
      for (const zombie of state.targets) first[zombie.kind] ??= zombie.bornAt;
      if (state.targets.some(z => z.kind === 'bucket') && state.targets.some(z => z.kind === 'cone' && z.health === 200)) return { first, phase: state.phase };
      if (state.ammo === 0 && !state.reloading) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
      const target = state.targets.filter(z => z.kind === 'normal' && z.health > 0 && z.head.x > 20 && z.head.x < innerWidth - 20 && (blocked.get(z.id) ?? 0) < performance.now()).sort((a, b) => Math.hypot(a.x, a.z - 9) - Math.hypot(b.x, b.z - 9))[0];
      if (target && !state.reloading && state.ammo > 0) {
        canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: target.head.x, clientY: target.head.y, button: 0, bubbles: true }));
        window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
        if (window.__undeadTower!.snapshot().lastShot?.hitTarget !== target.id) blocked.set(target.id, performance.now() + 500);
      }
      await new Promise(resolve => setTimeout(resolve, 165));
    }
    return { first, phase: 'timeout' };
  });
  expect(appearance.phase).toBe('playing');
  expect(appearance.first.cone).toBeGreaterThanOrEqual(30);
  expect(appearance.first.bucket).toBeGreaterThan(appearance.first.cone);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/armored-horde.png' });
  for (const [kind, health, shots] of [['cone', 200, 2], ['bucket', 400, 4]] as const) {
    const target = await page.evaluate(kind => window.__undeadTower!.snapshot().targets.find(z => z.kind === kind && z.health > 0)!, kind);
    expect(target.maxHealth).toBe(health);
    for (let i = 1; i <= shots; i++) {
      const state = await page.evaluate(() => window.__undeadTower!.snapshot());
      if (state.ammo === 0 || state.reloading) { await page.keyboard.press('r'); await expect.poll(async () => (await page.evaluate(() => window.__undeadTower!.snapshot())).reloading).toBe(false); }
      const result = await page.evaluate(id => {
        const target = window.__undeadTower!.snapshot().targets.find(z => z.id === id)!;
        const canvas = document.querySelector('canvas')!;
        canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: target.head.x, clientY: target.head.y, button: 0, bubbles: true }));
        window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
        return window.__undeadTower!.snapshot().targets.find(z => z.id === id)!.health;
      }, target.id);
      expect(result).toBe(health - i * 100);
      await page.waitForTimeout(180);
    }
  }
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

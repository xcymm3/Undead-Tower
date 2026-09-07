import { expect, test } from '@playwright/test';

for (const head of [false, true]) test(`真实${head ? '头部' : '身体'}碰撞显示${head ? '暴击爆头' : '暴击'}，空枪不产生提示`, async ({ page }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('undead-tower.audio.v1', JSON.stringify({ enabled: false, volume: 0 }));
    const original = crypto.getRandomValues.bind(crypto);
    // Fix the new-session seed only; production still uses its independent critical RNG.
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array<ArrayBuffer>) => {
      if (array instanceof Uint32Array && array.length === 1) { array[0] = 264; return array; }
      return original(array);
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '进入哨站' }).click();
  await expect.poll(() => page.evaluate(() => window.__undeadTower!.snapshot().phase)).toBe('playing');
  for (let i = 0; i < 8; i++) {
    const p = await page.evaluate(head => { const z = window.__undeadTower!.snapshot().targets[1]; return head ? z.head : z.chest; }, head);
    await page.mouse.move(p.x, p.y); await page.waitForTimeout(100);
  }
  await page.evaluate(head => {
    const p = window.__undeadTower!.snapshot().targets[1], target = head ? p.head : p.chest;
    const canvas = document.querySelector('canvas')!;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: target.x, clientY: target.y, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
  }, head);
  await expect(page.locator('.hit-feedback')).toHaveAttribute('data-critical', 'true');
  await expect(page.locator('.hit-feedback')).toContainText(head ? '暴击爆头' : '暴击');
  await page.screenshot({ path: info.outputPath(head ? 'critical-head.png' : 'critical-body.png') });
  const state = await page.evaluate(() => window.__undeadTower!.snapshot());
  expect(state.seed).toBe(264); expect(state.shots).toBe(1); expect(state.hits).toBe(1);
  expect(state.criticalHits).toBe(1); expect(state.criticalHeadHits).toBe(head ? 1 : 0);
  expect(state.targets[1].health).toBe(head ? 0 : 25);
  await expect(page.locator('.hit-feedback')).toHaveCount(0);
  await page.mouse.click(1370, 170);
  const missed = await page.evaluate(() => window.__undeadTower!.snapshot());
  expect(missed.shots).toBe(2); expect(missed.hits).toBe(1); expect(missed.criticalHits).toBe(1);
  await expect(page.locator('.hit-feedback')).toHaveCount(0);
});

test('暴击卡图案、准确预览、键盘选择与构筑在七视口可读', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('undead-tower.audio.v1', JSON.stringify({ enabled: false, volume: 0 })));
  await page.goto('/');
  await page.getByRole('button', { name: '正式模式' }).click();
  await page.getByRole('button', { name: '开始坚守' }).click();
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const moduleAt = (url: string) => import(/* @vite-ignore */ url);
    const React = (await moduleAt('/node_modules/.vite/deps/react.js')).default as typeof import('react');
    const { createRoot } = (await moduleAt('/node_modules/.vite/deps/react-dom_client.js')).default as typeof import('react-dom/client');
    const { UpgradePanel } = await moduleAt('/src/ui/UpgradePanel.tsx') as typeof import('../../src/ui/UpgradePanel');
    const { freshLevels, weaponStats } = await moduleAt('/src/game/rogue.ts') as typeof import('../../src/game/rogue');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:100'; document.body.appendChild(host);
    const levels = { ...freshLevels(), critical_chance: 2, critical_damage: 2, revolver_deadeye: 2 };
    createRoot(host).render(React.createElement(UpgradePanel, { state: { ...window.__undeadTower!.snapshot().rogue!, weapon: 'revolver', choices: ['critical_chance', 'critical_damage', 'revolver_deadeye'], levels, stats: weaponStats('revolver', levels) }, onConfirm: id => { host.dataset.confirmed = id ?? ''; } }));
  });
  await expect(page.locator('.upgrade-card')).toHaveCount(3);
  await expect(page.locator('.upgrade-card').nth(0)).toContainText('暴击率 15 → 20 %');
  await expect(page.locator('.upgrade-card').nth(1)).toContainText('暴击伤害 2.00 → 2.25 倍');
  await expect(page.locator('.upgrade-card').nth(2)).toContainText('死眼暴击率 45 → 60 %');
  const paths = await page.locator('.upgrade-card path').evaluateAll(nodes => nodes.map(n => n.getAttribute('d')));
  expect(new Set(paths).size).toBe(3);
  for (const width of [320, 375, 390, 414, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator('.upgrade-card p,.upgrade-card strong').evaluateAll(nodes => nodes.every(el => el.scrollWidth <= el.clientWidth + 1))).toBe(true);
    await page.screenshot({ path: info.outputPath(`critical-upgrades-${width}.png`) });
  }
  await page.locator('.upgrade-card').first().focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.upgrade-card').first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /应用升级/ }).click();
  await expect(page.locator('[data-confirmed="critical_chance"]')).toHaveCount(1);
});

import { expect, test } from '@playwright/test';

test('长说明和双指标预览在三视口完整换行', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '正式模式' }).click();
  await page.getByRole('button', { name: '开始坚守' }).click();
  await page.keyboard.press('Escape');
  // Production component fixture on a paused scene; never writes game progression.
  await page.evaluate(async () => {
    const moduleAt = (url: string) => import(/* @vite-ignore */ url);
    const React = (await moduleAt('/node_modules/.vite/deps/react.js')).default as typeof import('react');
    const { createRoot } = (await moduleAt('/node_modules/.vite/deps/react-dom_client.js')).default as typeof import('react-dom/client');
    const { UpgradePanel } = await moduleAt('/src/ui/UpgradePanel.tsx') as typeof import('../../src/ui/UpgradePanel');
    const { freshLevels, weaponStats } = await moduleAt('/src/game/rogue.ts') as typeof import('../../src/game/rogue');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:100'; document.body.appendChild(host);
    const root = createRoot(host), state = window.__undeadTower!.snapshot().rogue!;
    window.__cardFixture = weapon => {
      const choices = { revolver: ['revolver_deadeye', 'damage', 'revolver_cylinder'], shotgun: ['shotgun_impact', 'damage', 'shotgun_choke'], sniper: ['sniper_pierce', 'damage', 'sniper_caliber'] }[weapon] as import('../../src/game/rogue').UpgradeId[];
      const levels = freshLevels(); for (const id of choices) levels[id] = 2;
      root.render(React.createElement(UpgradePanel, { key: weapon, state: { ...state, weapon, choices, levels, stats: weaponStats(weapon, levels) }, onConfirm: () => {} }));
    };
  });
  for (const weapon of ['revolver', 'shotgun', 'sniper'] as const) {
    await page.evaluate(weapon => window.__cardFixture(weapon), weapon);
    await expect(page.locator('.upgrade-card')).toHaveCount(3);
    await page.waitForTimeout(220);
    for (const [width, height] of [[1440, 900], [1280, 720], [390, 844]]) {
      await page.setViewportSize({ width, height });
      expect(await page.locator('.upgrade-card p,.upgrade-card strong').evaluateAll(nodes => nodes.every(el => el.scrollWidth <= el.clientWidth + 1))).toBe(true);
      await page.screenshot({ path: info.outputPath(`${weapon}-${width}.png`) });
      if (width === 390) {
        await page.locator('.upgrade-card').last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath(`${weapon}-${width}-bottom.png`) });
      }
    }
  }
});
declare global { interface Window { __cardFixture: (weapon: 'revolver' | 'shotgun' | 'sniper') => void; } }

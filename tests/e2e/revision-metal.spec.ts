import { expect, test } from '@playwright/test';

test('真实WebAudio铁桶分层缓存、六组上限、静音与结束回收', async ({ page }, info) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const moduleAt = (url: string) => import(/* @vite-ignore */ url);
    const { GameAudio } = await moduleAt('/src/game/audio.ts') as typeof import('../../src/game/audio');
    const audio = new GameAudio(); audio.enabled = true; audio.volume = .37; audio.unlock();
    try {
      for (let i = 0; i < 20; i++) audio.armor('bucket', Math.floor(i / 4) % 2 === 0);
      const active = audio.diagnostics();
      await new Promise(resolve => setTimeout(resolve, 550));
      const ended = audio.diagnostics();
      audio.armor('bucket', false); audio.enabled = false; audio.armor('bucket', true);
      const muted = audio.diagnostics();
      audio.enabled = true; audio.armor('bucket', true); audio.resetMusic();
      const reset = audio.diagnostics();
      audio.dispose(); const disposed = audio.diagnostics();
      return { active, ended, muted, reset, disposed };
    } finally { audio.dispose(); }
  });
  expect(result.active.metalCues).toBe(20); expect(result.active.activeMetal).toBe(6); expect(result.active.cachedMetal).toBe(8);
  expect(result.active.lastMetal!.resonances).toHaveLength(4); expect(result.active.gain).toBeCloseTo(.37);
  expect(result.ended.activeMetal).toBe(0); expect(result.muted.activeMetal).toBe(0); expect(result.muted.metalCues).toBe(21); expect(result.muted.gain).toBe(0);
  expect(result.reset.activeMetal).toBe(0); expect(result.disposed.cachedMetal).toBe(0);
  await info.attach('metal-diagnostics', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});

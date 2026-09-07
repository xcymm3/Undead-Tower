import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Actual input playthroughs, with rendering sampled more often for visual review.
 * These captures are presentation fixtures, never balance/replay samples. */
export async function captureRogueVisuals(page, output, weapons) {
  await mkdir(output, { recursive: true });
  const captures = [], icons = new Set(), rarities = new Set(), enemies = new Set(), enemyEvents = new Set(), gaps = [];
  const capture = async (name, metadata = {}) => {
    const path = resolve(output, `${name}.png`);
    await page.screenshot({ path }); captures.push({ name, path, ...metadata });
  };
  for (const weapon of weapons) {
    const weaponIcons = new Set();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(async weapon => {
      const { startReplay } = await import('/scripts/rogue-replay-browser.ts');
      window.visualRunner = startReplay({ weapon, profile: 'regular', seed: 42031, fps: 60, maxWaves: 24 }, { pauseOnUpgrade: true, renderEvery: 3 });
    }, weapon);
    let active = false, ended = false, previousHits = 0, previousTeleports = 0, teleportCaptured = false, animation = false;
    for (let batch = 0; batch < 48000; batch++) {
      const state = await page.evaluate(() => {
        const run = window.visualRunner.batch(6), o = window.__undeadReplay.observe();
        const d = window.__undeadTower.snapshot();
        return { run, o, lastShot: d.lastShot, renderedSkillActive: Boolean(document.querySelector('.skill-hud.active')), slowed: d.targets.filter(z => z.slowRemaining > 0).map(z => z.id) };
      });
      const { o, run } = state;
      if (!active && o.skillActive && state.renderedSkillActive && o.hits > previousHits) {
        await capture(`${weapon}-skill-hit`, { weapon, skill: 'active-hit', time: o.time, hits: o.hits, slowed: state.slowed, lastShot: state.lastShot }); active = true;
      }
      if (active && !ended && !o.skillActive && !state.renderedSkillActive && o.phase === 'playing') {
        await capture(`${weapon}-skill-ended`, { weapon, skill: 'ended', time: o.time }); ended = true;
      }
      previousHits = o.hits;
      for (const [type, count] of Object.entries(o.enemyEventCounts)) if (count > 0 && !enemyEvents.has(type)) {
        await capture(`feedback-${type}`, { weapon, enemyEvent: type, count, time: o.time, effects: o.resources.effects }); enemyEvents.add(type);
      }
      if (!teleportCaptured && o.teleportCount > previousTeleports) {
        await capture('feedback-wizard-teleport', { weapon, teleportCount: o.teleportCount, time: o.time, effects: o.resources.effects });
        teleportCaptured = true;
      }
      previousTeleports = o.teleportCount;
      for (const target of o.targets) if (!enemies.has(target.kind)) {
        await capture(`enemy-${target.kind}`, { weapon, enemy: target.kind, target, time: o.time }); enemies.add(target.kind);
      }
      if (o.phase === 'upgrade') {
        const cards = page.locator('.upgrade-card'); await cards.first().waitFor();
        await page.waitForTimeout(220);
        const catalog = await cards.evaluateAll(nodes => nodes.map(node => ({ id: node.querySelector('[data-upgrade-icon]')?.getAttribute('data-upgrade-icon'), rarity: [...node.classList].find(c => c.startsWith('rarity-')) })));
        for (const card of catalog) weaponIcons.add(card.id);
        const unseen = catalog.some(card => !icons.has(card.id) || !rarities.has(card.rarity));
        if (unseen) {
          for (const [width, height] of [[1440, 900], [1280, 720], [390, 844]]) {
            await page.setViewportSize({ width, height });
            const overflow = await cards.evaluateAll(nodes => nodes.flatMap(node => [...node.querySelectorAll('p,strong')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent)));
            if (overflow.length) gaps.push(`${weapon}/wave${o.wave}/${width}: overflowing card text: ${overflow.join('; ')}`);
            await capture(`${weapon}-wave-${o.wave}-cards-${width}`, { weapon, wave: o.wave, catalog });
            if (width === 390) { await cards.last().scrollIntoViewIfNeeded(); await capture(`${weapon}-wave-${o.wave}-cards-${width}-bottom`, { weapon, wave: o.wave, catalog }); }
          }
          await page.setViewportSize({ width: 1440, height: 900 });
          for (const card of catalog) { icons.add(card.id); rarities.add(card.rarity); }
        }
        if (!animation) {
          const opacity = await page.locator('.upgrade-screen').evaluate(el => {
            const a = el.getAnimations()[0]; if (!a) return null;
            a.pause(); a.currentTime = 90; return getComputedStyle(el).opacity;
          });
          await capture(`${weapon}-enter-middle`, { animation: 'enter-90ms', opacity });
          await page.locator('.upgrade-screen').evaluate(el => { for (const a of el.getAnimations()) a.finish(); });
        }
        await cards.first().click();
        await page.getByRole('button', { name: /应用升级/ }).click();
        if (!animation) {
          await capture(`${weapon}-exit-transition`, { animation: 'exit', opacity: await page.locator('.upgrade-screen').evaluate(el => getComputedStyle(el).opacity).catch(() => 'removed') });
          animation = true;
        }
        await page.locator('.upgrade-screen').waitFor({ state: 'detached' });
        await capture(`${weapon}-wave-${o.wave}-next`, { phase: 'countdown', weapon, wave: o.wave });
      }
      if (active && ended && weaponIcons.size === 9 && enemies.size === 10) break;
      if (run.done) break;
      if (batch === 47999) gaps.push(`${weapon}: capture step limit reached`);
    }
    if (!active || !ended) gaps.push(`${weapon}: missing actual skill hit/ended capture`);
    console.log(`Visual ${weapon}: ${captures.length} captures, ${icons.size} icons, ${enemies.size} enemies`);
  }
  if (enemies.size !== 10) gaps.push(`Only ${enemies.size}/10 enemy types captured`);
  for (const type of ['skitter-turn', 'charger-windup', 'charger-charge', 'howler-windup', 'howler-command', 'command-ended', 'berserker-rage']) if (!enemyEvents.has(type)) gaps.push(`Missing ${type} production feedback capture`);
  if (!captures.some(capture => capture.name === 'feedback-wizard-teleport')) gaps.push('Missing wizard teleport production feedback capture');
  if (icons.size !== 20) gaps.push(`Only ${icons.size}/20 upgrade icons captured`);
  if (rarities.size !== 3) gaps.push(`Only ${rarities.size}/3 rarity classes captured`);
  const report = { status: gaps.length ? 'FAIL' : 'READY_FOR_REVIEW', gaps, captures, icons: [...icons], rarities: [...rarities], enemies: [...enemies], enemyEvents: [...enemyEvents],
    limitations: ['Real input and production scene; fixed clock, first displayed upgrade chosen. These are visual fixtures, not the frozen probabilistic balance samples.', 'Screenshots require human/model visual inspection; capture coverage is not an AC6 verdict.'] };
  await writeFile(resolve(output, 'visual-captures.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

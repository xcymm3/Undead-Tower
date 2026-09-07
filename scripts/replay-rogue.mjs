import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const argument = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const output = argument('--output', process.env.DEADLINE_CARL_OUTPUT_DIR && resolve(process.env.DEADLINE_CARL_OUTPUT_DIR, 'replay'));
if (!output || output.startsWith('--')) throw new Error('--output or DEADLINE_CARL_OUTPUT_DIR required');
await mkdir(output, { recursive: true });
const server = await createServer({ mode: 'replay', clearScreen: false, server: { host: '127.0.0.1', port: 5177, strictPort: true } });
let browser;
try {
  await server.listen();
  const { simulateRogueRun, balanceConfiguration } = await server.ssrLoadModule('/scripts/rogue-model.ts');
  const { WEAPON_IDS } = await server.ssrLoadModule('/src/game/weapons.ts');
  const weapons = argument('--weapon', '').split(',').filter(Boolean);
  if (weapons.some(w => !WEAPON_IDS.includes(w))) throw new Error('Unknown weapon');
  const selectedProfile = argument('--profile', '');
  if (selectedProfile && !['regular', 'expert'].includes(selectedProfile)) throw new Error('Replay supports regular/expert');
  const maxWaves = Number(argument('--max-waves', 60)), maxSeconds = Number(argument('--max-seconds', 3600));
  if (!Number.isInteger(maxWaves) || maxWaves < 1 || !(maxSeconds > 0)) throw new Error('Invalid review limits');
  const formal = !weapons.length && !selectedProfile && maxWaves === 60 && maxSeconds === 3600;
  const sourceHashes = {};
  for (const path of ['src/game/Game.ts', 'src/App.tsx', 'scripts/rogue-model.ts', 'scripts/rogue-replay-browser.ts', 'scripts/rogue-agent.ts', 'scripts/replay-rogue.mjs', 'scripts/rogue-replay-checks.ts', 'scripts/rogue-resource-checks.ts', ...['staticCollision', 'rogue', 'config', 'upgrades', 'skills', 'combat', 'encounter', 'enemyRules', 'movement', 'navigation', 'spawn', 'sceneRules', 'world', 'geometry', 'zombies', 'firearm', 'arsenal', 'weapons', 'teleport', 'aim', 'timing', 'hitFeedback', 'audio', 'metalSynthesis'].map(n => `src/game/${n}.ts`)]) sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('undead-tower.audio.v1', JSON.stringify({ enabled: false, volume: 0 })));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5177');
  await page.waitForFunction(() => window.__undeadReplay && window.__undeadTower?.snapshot().weaponAnimation.loaded);
  const lifecycle = await page.evaluate(async () => (await import('/scripts/rogue-replay-checks.ts')).replayLifecycleChecks());
  await writeFile(resolve(output, 'lifecycle.json'), JSON.stringify(lifecycle, null, 2) + '\n');
  console.log(`Lifecycle: ${lifecycle.length} weapons passed`);
  if (args.includes('--visuals-only')) {
    const { captureRogueVisuals } = await import('./rogue-visual-checks.mjs');
    const visuals = await captureRogueVisuals(page, output, weapons.length ? weapons : WEAPON_IDS);
    if (args.includes('--assert') && (visuals.gaps.length || errors.length)) process.exitCode = 1;
  } else if (args.includes('--lifecycle-only')) {
    if (errors.length) throw new Error(errors.join('\n'));
  } else if (args.includes('--resources-only')) {
    const resources = await page.evaluate(async () => (await import('/scripts/rogue-resource-checks.ts')).replayResourceChecks());
    resources.gaps.push(...errors); resources.status = resources.gaps.length ? 'FAIL' : 'PASS';
    await writeFile(resolve(output, 'resources.json'), JSON.stringify({ ...resources, sourceHashes,
      configurationSha256: createHash('sha256').update(JSON.stringify(balanceConfiguration())).digest('hex') }, null, 2) + '\n');
    console.log(JSON.stringify({ status: resources.status, gaps: resources.gaps, maxAlive: resources.maxAlive, maxEffects: resources.maxEffects }));
    if (args.includes('--assert') && resources.gaps.length) process.exitCode = 1;
  } else {
  const pairs = [], start = performance.now();
  for (const weapon of weapons.length ? weapons : WEAPON_IDS) for (const profile of selectedProfile ? [selectedProfile] : ['regular', 'expert']) {
    const options = { weapon, profile, seed: profile === 'regular' ? 42031 : 42208, seedIndex: profile === 'regular' ? 0 : 1, fps: 60, maxWaves, maxSeconds };
    // Sequential CPU model then one browser instance: no simultaneous 3D workers.
    const model = simulateRogueRun(options);
    await page.evaluate(async options => {
      const module = await import('/scripts/rogue-replay-browser.ts');
      window.replayRunner = module.startReplay(options);
    }, options);
    let previous = -1;
    while (true) {
      const state = await page.evaluate(() => window.replayRunner.batch(180));
      if (state.completed !== previous) { previous = state.completed; console.log(`${weapon}/${profile}: replay ${state.completed}, ${state.seconds.toFixed(1)}s; model ${model.completed}`); }
      if (state.done) break;
      if (performance.now() - start > 60 * 60 * 1000) throw new Error('Replay wall-time timeout, not natural failure');
    }
    const replay = await page.evaluate(() => window.replayRunner.result());
    await page.screenshot({ path: resolve(output, `${weapon}-${profile}-result.png`) });
    const comparison = { criticalHits: [model.criticalHits, replay.criticalHits], criticalHeadHits: [model.criticalHeadHits, replay.criticalHeadHits], accuracy: [model.hits / Math.max(1, model.shots), replay.hits / Math.max(1, replay.shots)], headShare: [model.headHits / Math.max(1, model.hits), replay.headHits / Math.max(1, replay.hits)], skillActivations: [model.skillActivations, replay.skillActivations], skillTime: [model.skillTime, replay.skillTime], spawned: [model.spawned, replay.spawned], enemyEventCounts: [model.enemyEventCounts, replay.enemyEventCounts], teleportCount: [model.teleportCount, replay.teleportCount] };
    const pair = { options, model, replay, comparison, completedDifference: Math.abs(model.completed - replay.completed), entered50Agrees: (model.completed >= 49) === (replay.completed >= 49) };
    pairs.push(pair); await writeFile(resolve(output, `${weapon}-${profile}.json`), JSON.stringify(pair, null, 2) + '\n');
  }
  const differences = pairs.map(p => p.completedDifference).sort((a, b) => a - b);
  const median = differences.length % 2 ? differences[Math.floor(differences.length / 2)] : (differences[differences.length / 2 - 1] + differences[differences.length / 2]) / 2;
  const gaps = [];
  if (!formal || pairs.length !== 12) gaps.push('Not the full frozen 12-run protocol');
  if (median > 2) gaps.push(`Median difference ${median} > 2`);
  if (Math.max(...differences) > 5) gaps.push(`Maximum difference ${Math.max(...differences)} > 5`);
  if (pairs.some(p => !p.entered50Agrees)) gaps.push('Reached wave 50 disagreement');
  if (pairs.some(p => p.model.censored !== p.replay.censored)) gaps.push('Natural failure/censoring disagreement');
  if (errors.length) gaps.push(...errors);
  const report = { formal, lifecycle, sourceHashes, configurationSha256: createHash('sha256').update(JSON.stringify(balanceConfiguration())).digest('hex'), pairs, median, maximum: Math.max(...differences), status: gaps.length ? 'FAIL' : 'PASS', gaps, elapsedSeconds: (performance.now() - start) / 1000,
    limitations: ['Fixed probabilistic agents, no human samples. Replay uses real bounded pointer inputs, actual animated muzzle and scene collisions; render is sampled every 180 fixed updates.', 'Model currently approximates muzzle recoil and camera-to-target intersection. Pair data retain accuracy/head hits, skill counts/time and enemy composition for discrepancy review.'] };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, median, maximum: report.maximum, gaps, seconds: report.elapsedSeconds }));
  if (args.includes('--assert') && gaps.length) process.exitCode = 1;
  }
} finally { await browser?.close(); await server.close(); }

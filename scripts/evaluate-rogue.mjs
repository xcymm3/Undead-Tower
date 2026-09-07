import { mkdir, writeFile, readFile, appendFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, createServer } from 'vite';

const args = process.argv.slice(2);
const argument = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const output = argument('--output', process.env.DEADLINE_CARL_OUTPUT_DIR && resolve(process.env.DEADLINE_CARL_OUTPUT_DIR, 'rogue-balance.json'));
if (!output || output.startsWith('--')) throw new Error('--output or DEADLINE_CARL_OUTPUT_DIR is required');
const quick = args.includes('--quick');
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-rogue-balance', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { simulateRogueRun, balanceConfiguration } = await server.ssrLoadModule('/scripts/rogue-model.ts');
  const { BALANCE_SEEDS, PROFILES } = await server.ssrLoadModule('/scripts/rogue-agent.ts');
  const { balanceGroups, balanceFailures } = await server.ssrLoadModule('/scripts/rogue-statistics.ts');
  const { WEAPON_IDS } = await server.ssrLoadModule('/src/game/weapons.ts');
  const weapons = argument('--weapon', '').split(',').filter(Boolean);
  const profiles = argument('--profile', '').split(',').filter(Boolean);
  for (const weapon of weapons) if (!WEAPON_IDS.includes(weapon)) throw new Error(`Unknown weapon ${weapon}`);
  for (const profile of profiles) if (!(profile in PROFILES)) throw new Error(`Unknown profile ${profile}`);
  const seedCount = Number(argument('--seed-count', quick ? 1 : BALANCE_SEEDS.length));
  if (!Number.isSafeInteger(seedCount) || seedCount < 1 || seedCount > BALANCE_SEEDS.length) throw new Error('--seed-count must be 1–24');
  const fpsValues = argument('--fps', quick ? '60' : '60,30').split(',').map(Number);
  if (!fpsValues.length || new Set(fpsValues).size !== fpsValues.length || fpsValues.some(fps => ![30, 60].includes(fps))) throw new Error('--fps must be 60, 30 or 60,30');
  const seeds = BALANCE_SEEDS.slice(0, seedCount);
  const fullConfiguration = !quick && !weapons.length && !profiles.length && !args.includes('--seed-count') && !args.includes('--fps') && !Number.isFinite(Number(argument('--max-runs', Infinity)));
  // Frozen evidence rules require one fresh uninterrupted 864-run invocation.
  // Resume/sliced executions are diagnostic checkpoints and must never report
  // themselves as formal even when they eventually accumulate every sample.
  const formal = fullConfiguration && !args.includes('--resume') && !args.includes('--slice-seconds');
  const configuration = balanceConfiguration();
  const sourceFiles = ['scripts/evaluate-rogue.mjs', 'scripts/rogue-matrix-worker.mjs', 'scripts/typescript-loader.mjs', 'scripts/rogue-model.ts', 'scripts/rogue-agent.ts', 'scripts/static-collision.ts', 'scripts/rogue-statistics.ts', ...['staticCollision', 'Game', 'rogue', 'config', 'upgrades', 'skills', 'combat', 'encounter', 'enemyRules', 'movement', 'navigation', 'spawn', 'sceneRules', 'world', 'geometry', 'zombies', 'firearm', 'arsenal', 'weapons', 'teleport', 'aim', 'timing', 'hitFeedback', 'audio', 'metalSynthesis'].map(n => `src/game/${n}.ts`)];
  const sourceHashes = {};
  for (const path of sourceFiles) sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
  const configurationSha256 = createHash('sha256').update(JSON.stringify(configuration)).digest('hex');
  const checkpoint = `${output}.runs.jsonl`, manifestPath = `${output}.manifest.json`;
  const workerDirectory = `${output}.workers`;
  const manifest = { sourceHashes, configurationSha256, quick, weapons, profiles, seedCount, fpsValues };
  await mkdir(dirname(resolve(output)), { recursive: true });
  const runs = [], start = performance.now();
  const runKey = run => `${run.fps}/${run.profile}/${run.weapon}/${run.seed}`;
  const loadedRunKeys = new Set();
  const addLoadedRun = run => {
    const key = runKey(run);
    if (loadedRunKeys.has(key)) return;
    loadedRunKeys.add(key);
    runs.push(run);
  };
  if (args.includes('--resume')) {
    if (JSON.stringify(JSON.parse(await readFile(manifestPath, 'utf8'))) !== JSON.stringify(manifest)) throw new Error('Checkpoint source/configuration/sample mismatch; run fresh with a new output');
    for (const line of (await readFile(checkpoint, 'utf8')).split('\n').filter(Boolean)) addLoadedRun(JSON.parse(line));
    // A formal matrix can outlive one supervised iteration. Workers journal every
    // completed simulation so an interrupted parent does not discard 20+ minutes
    // of valid samples. The manifest comparison above prevents stale-source reuse.
    for (const name of (await readdir(workerDirectory).catch(() => [])).filter(name => /^progress-\d+\.jsonl$/.test(name))) {
      for (const line of (await readFile(resolve(workerDirectory, name), 'utf8')).split('\n').filter(Boolean)) {
        addLoadedRun(JSON.parse(line).run);
      }
    }
  } else {
    await writeFile(manifestPath, JSON.stringify(manifest) + '\n'); await writeFile(checkpoint, '');
  }
  const maxRuns = Number(argument('--max-runs', Infinity));
  if (!(maxRuns > 0) || (Number.isFinite(maxRuns) && !Number.isSafeInteger(maxRuns))) throw new Error('--max-runs must be a positive integer');
  const sliceSeconds = Number(argument('--slice-seconds', Infinity));
  if (!(sliceSeconds > 0)) throw new Error('--slice-seconds must be positive');
  const sliceDeadline = Number.isFinite(sliceSeconds) ? Date.now() + sliceSeconds * 1000 : null;
  let added = 0;
  const tasks = [];
  matrix: for (const fps of fpsValues) for (const profile of profiles.length ? profiles : Object.keys(PROFILES)) for (const weapon of weapons.length ? weapons : WEAPON_IDS) for (let i = 0; i < seeds.length; i++) {
    if (loadedRunKeys.has(`${fps}/${profile}/${weapon}/${seeds[i]}`)) continue;
    if (tasks.length >= maxRuns) break matrix;
    tasks.push({ weapon, profile, seed: seeds[i], seedIndex: i, fps });
  }
  if (tasks.length > 1 && !args.includes('--serial')) {
    // Keep the CPU-only matrix bounded and leave capacity for the host/supervisor.
    // Filtered diagnostic matrices use the same worker path so balance tuning does
    // not spend several supervised iterations waiting on serial long-run samples.
    const workerCount = Math.min(10, Math.max(1, availableParallelism() - 2), tasks.length);
    await mkdir(workerDirectory, { recursive: true });
    const bundleDirectory = resolve(workerDirectory, 'bundle');
    await build({ configFile: false, logLevel: 'error', build: { ssr: 'scripts/rogue-model.ts', outDir: bundleDirectory, emptyOutDir: true, rollupOptions: { output: { entryFileNames: 'rogue-model.mjs' } } } });
    const moduleUrl = pathToFileURL(resolve(bundleDirectory, 'rogue-model.mjs')).href;
    const chunks = Array.from({ length: workerCount }, () => []);
    tasks.forEach((task, index) => chunks[index % workerCount].push({ index, options: task }));
    const workerScript = fileURLToPath(new URL('./rogue-matrix-worker.mjs', import.meta.url));
    const workerResults = await Promise.all(chunks.map(async (chunk, index) => {
      const taskFile = resolve(workerDirectory, `tasks-${index}.json`);
      const resultFile = resolve(workerDirectory, `results-${index}.json`);
      const progressFile = resolve(workerDirectory, `progress-${index}.jsonl`);
      await writeFile(taskFile, JSON.stringify(chunk) + '\n');
      if (!args.includes('--resume')) await writeFile(progressFile, '');
      await new Promise((resolveWorker, rejectWorker) => {
        const childArgs = [workerScript, '--tasks', taskFile, '--output', resultFile, '--progress', progressFile, '--worker-index', String(index), '--module', moduleUrl];
        if (sliceDeadline !== null) childArgs.push('--deadline', String(sliceDeadline));
        const child = spawn(process.execPath, childArgs, {
          cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
        });
        let stderr = '';
        child.stdout.on('data', data => process.stdout.write(data));
        child.stderr.on('data', data => { stderr += data; process.stderr.write(data); });
        child.on('error', rejectWorker);
        child.on('close', code => code === 0 ? resolveWorker() : rejectWorker(new Error(`Matrix worker ${index} exited ${code}: ${stderr}`)));
      });
      return JSON.parse(await readFile(resultFile, 'utf8'));
    }));
    const indexedRuns = workerResults.flat().sort((a, b) => a.index - b.index);
    if (new Set(indexedRuns.map(entry => entry.index)).size !== indexedRuns.length || indexedRuns.some(entry => !Number.isSafeInteger(entry.index) || entry.index < 0 || entry.index >= tasks.length)) throw new Error('Parallel matrix returned duplicate or invalid sample indexes');
    for (const entry of indexedRuns) addLoadedRun(entry.run);
    await writeFile(checkpoint, runs.map(run => JSON.stringify(run)).join('\n') + '\n');
    added = indexedRuns.length;
    console.log(`Parallel matrix completed ${added} fresh runs with ${workerCount} bounded workers`);
  } else {
    for (const task of tasks) {
      const runStart = performance.now();
      const run = simulateRogueRun(task); runs.push(run);
      await appendFile(checkpoint, JSON.stringify(run) + '\n'); added++;
      console.log(`${runs.length} ${task.weapon}/${task.profile}/${task.fps}/${run.seed}: completed=${run.completed}, seconds=${run.seconds.toFixed(1)}, censored=${run.censored}, wallSeconds=${((performance.now() - runStart) / 1000).toFixed(2)}`);
    }
  }
  const expectedRunCount = fpsValues.length * (profiles.length ? profiles.length : Object.keys(PROFILES).length) * (weapons.length ? weapons.length : WEAPON_IDS.length) * seeds.length;
  if (runs.length !== expectedRunCount) throw new Error(`Matrix slice preserved ${runs.length}/${expectedRunCount} diagnostic samples; rerun with --resume (non-formal)`);
  const gaps = balanceFailures(runs, formal);
  const report = { schemaVersion: 1, formal, generatedAt: new Date().toISOString(), elapsedSeconds: (performance.now() - start) / 1000, profiles: PROFILES, configuration,
    configurationSha256, sourceHashes,
    limitations: ['代理概率是假设，未收集真人样本；均值区间为正态近似，进入50波率为Wilson 95%区间。', '实际生产场景几何/敌人方块碰撞、导航和战斗规则；省略渲染与枪械动画，使用无后坐枪口姿态。', '瞄准延迟后直接瞄准头/身体中心，失误弹射向上方；死眼按实际技能覆盖失误。镜头使用有限阻尼。', '目标ETA使用剩余直线距离/当前速度下界；12局真实回放误差须单独验证，此输出不证明AC10。'],
    groups: balanceGroups(runs), runs, status: gaps.length ? 'FAIL' : 'PASS', gaps };
  await mkdir(dirname(resolve(output)), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.table(report.groups.filter(g => g.strategy === 'all').map(({ weapon, profile, fps, n, mean, p10, entered50Rate, censored }) => ({ weapon, profile, fps, n, mean, p10, entered50Rate, censored })));
  console.log(`Wrote ${output}; ${report.elapsedSeconds.toFixed(1)} seconds; ${gaps.length} gaps`);
  if (args.includes('--assert') && gaps.length) process.exitCode = 1;
} finally { await server.close(); }

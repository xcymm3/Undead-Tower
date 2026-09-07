import { WEAPON_IDS } from '../src/game/weapons';
import { BALANCE_SEEDS, PROFILES } from './rogue-agent';
import type { RogueRun } from './rogue-model';

export function wilson(successes: number, n: number) {
  if (!n) return [0, 1];
  const z = 1.96, p = successes / n, denominator = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denominator;
  const radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
export function summarize(runs: RogueRun[]) {
  const values = runs.map(r => r.completed).sort((a, b) => a - b), n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  const q = (p: number) => values[Math.floor((n - 1) * p)];
  const entered = runs.filter(r => r.completed >= 49).length;
  return { n, mean, median: q(.5), p10: q(.1), p90: q(.9), min: q(0), max: q(1), mean95Approx: [mean - 1.96 * sd / Math.sqrt(n), mean + 1.96 * sd / Math.sqrt(n)],
    earlyFailureRate: runs.filter(r => r.failed && r.completed < 10).length / n, entered50: entered, entered50Rate: entered / n,
    cleared50Rate: runs.filter(r => r.completed >= 50).length / n, entered50Wilson95: wilson(entered, n), censored: runs.filter(r => r.censored).length };
}
export function balanceGroups(runs: RogueRun[]) {
  const groups = [];
  for (const fps of [60, 30]) for (const profile of Object.keys(PROFILES)) for (const weapon of [...WEAPON_IDS, 'all']) {
    const selected = runs.filter(r => r.fps === fps && r.profile === profile && (weapon === 'all' || r.weapon === weapon));
    if (selected.length) groups.push({ fps, profile, weapon, strategy: 'all', ...summarize(selected) });
    if (profile === 'regular') for (const strategy of ['random', 'priority']) {
      const subset = selected.filter(r => r.strategy === strategy);
      if (subset.length) groups.push({ fps, profile, weapon, strategy, ...summarize(subset) });
    }
  }
  return groups;
}
export function balanceFailures(runs: RogueRun[], formal: boolean) {
  const gaps: string[] = [];
  if (!formal) gaps.push('Diagnostic sample is not the frozen 864-run matrix');
  if (runs.length !== 864) gaps.push(`Expected 864 runs, received ${runs.length}`);
  for (const fps of [60, 30]) for (const profile of Object.keys(PROFILES)) for (const weapon of WEAPON_IDS) for (const seed of BALANCE_SEEDS) {
    if (runs.filter(r => r.fps === fps && r.profile === profile && r.weapon === weapon && r.seed === seed).length !== 1) gaps.push(`Missing/duplicate ${weapon}/${profile}/${fps}/${seed}`);
  }
  const groups = balanceGroups(runs), get = (weapon: string, profile: string, fps: number) => groups.find(g => g.weapon === weapon && g.profile === profile && g.fps === fps && g.strategy === 'all');
  const means = [];
  for (const weapon of WEAPON_IDS) {
    const a = get(weapon, 'regular', 60), b = get(weapon, 'regular', 30);
    if (!a || !b) continue;
    means.push(a.mean);
    if (a.mean < 18 || a.mean > 24 || a.p10 < 10 || a.censored || b.censored) gaps.push(`${weapon}: regular target failed (60 mean=${a.mean.toFixed(2)}, p10=${a.p10}, censored=${a.censored + b.censored})`);
    if (Math.abs(b.mean - a.mean) / Math.max(1, a.mean) > .2) gaps.push(`${weapon}: FPS mean shift exceeds 20%`);
  }
  if (means.length && Math.max(...means) - Math.min(...means) > 6) gaps.push('Regular weapon mean spread exceeds 6 waves');
  const regular30 = get('all', 'regular', 30);
  if (regular30 && (regular30.mean < 16 || regular30.mean > 26)) gaps.push('30 FPS regular combined mean outside 16–26');
  for (const fps of [60, 30]) for (const profile of ['skilled', 'expert']) {
    const all = get('all', profile, fps);
    if (all && all.entered50Rate > .01) gaps.push(`${profile}/${fps}: entered50 rate exceeds 1%`);
    for (const weapon of WEAPON_IDS) if ((get(weapon, profile, fps)?.entered50 ?? 0) > 1) gaps.push(`${weapon}/${profile}/${fps}: entered50 > 1/24`);
  }
  if (runs.some(r => r.censored && r.completed < 49 && r.profile !== 'regular')) gaps.push('High-level run censored before entering wave 50');
  return gaps;
}

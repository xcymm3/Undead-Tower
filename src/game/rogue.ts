import { WEAPONS } from './weapons';
import type { WeaponDefinition } from './weapons';
import type { ZombieKind } from './config';

export const ROGUE_KEY = 'undead-tower.leaderboard.rogue-v1';
export const UPGRADES = {
  damage: { name: '强装药', detail: '基础伤害 +20%', max: 5 },
  rate: { name: '轻快扳机', detail: '基础射速 +12%', max: 5 },
  magazine: { name: '扩容弹匣', detail: '弹容 +3 发', max: 4 },
  reload: { name: '快速装填', detail: '装填速度 +15%', max: 4 },
  head: { name: '精准射击', detail: '爆头倍率 +0.3', max: 5 },
} as const;
export type UpgradeId = keyof typeof UPGRADES;
export type UpgradeLevels = Record<UpgradeId, number>;
export const freshLevels = (): UpgradeLevels => ({ damage: 0, rate: 0, magazine: 0, reload: 0, head: 0 });
export function pistolStats(levels: UpgradeLevels): WeaponDefinition {
  const base = WEAPONS[2];
  return { ...base, damage: base.damage * (1 + .2 * levels.damage), headMultiplier: 2 + .3 * levels.head,
    interval: base.interval / (1 + .12 * levels.rate), fireDuration: base.fireDuration / (1 + .12 * levels.rate),
    capacity: base.capacity + 3 * levels.magazine, reloadDuration: base.reloadDuration / (1 + .15 * levels.reload) };
}
export function shuffle<T>(values: T[], random: () => number): T[] {
  for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; }
  return values;
}
export function upgradeChoices(levels: UpgradeLevels, random: () => number) {
  return shuffle((Object.keys(UPGRADES) as UpgradeId[]).filter(id => levels[id] < UPGRADES[id].max), random).slice(0, 3);
}
const KINDS: ZombieKind[] = ['normal', 'cone', 'bucket', 'football', 'giant', 'wizard'];
const WAVES = [[6,0,0,0,0,0], [6,2,0,0,0,0], [7,2,1,0,0,0], [8,2,1,1,0,0], [8,3,2,1,0,0],
  [9,3,2,1,0,1], [9,4,3,1,0,1], [9,4,3,2,1,1], [10,4,4,2,1,1], [10,5,4,2,1,2]];
export function waveCounts(wave: number) {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new Error('Invalid wave');
  const counts = [...WAVES[Math.min(wave, 10) - 1]];
  const additions = [[1,2], [2,3], [1,5], [2,3], [0,4]];
  if (wave > 10) for (let i = 0; i < 5; i++) {
    const repeats = Math.max(0, Math.floor((wave - 11 - i) / 5) + 1);
    for (const index of additions[i]) counts[index] += repeats;
  }
  return Object.fromEntries(KINDS.map((kind, i) => [kind, counts[i]])) as Record<ZombieKind, number>;
}
export const waveRate = (wave: number) => Math.min(10, .8 + .15 * (wave - 1));
export function waveEnemies(wave: number, random: () => number) {
  const counts = waveCounts(wave);
  const enemies = shuffle(KINDS.flatMap(kind => Array<ZombieKind>(counts[kind]).fill(kind)), random);
  const first: ZombieKind | undefined = counts.giant ? 'giant' : wave === 6 ? 'wizard' : wave === 4 ? 'football' : undefined;
  if (first) enemies.unshift(...enemies.splice(enemies.indexOf(first), 1));
  return enemies;
}
export interface RogueResult {
  version: 1; weapon: 'pistol'; seed: number; completed: number; failedWave: number; waveKills: number;
  waveTotal: number; clearTime: number; levels: UpgradeLevels;
}
export interface RogueSnapshot {
  wave: number; total: number; remaining: number; completed: number; countdown: number;
  levels: UpgradeLevels; choices: UpgradeId[]; stats: WeaponDefinition;
}

import type { WeaponDefinition, WeaponId } from './weapons';
import type { ZombieKind } from './config';
import { ZOMBIE_KINDS } from './config';
import type { UpgradeLevels, UpgradeId, SkillStats } from './upgrades';
import type { SkillSnapshot } from './skills';
export * from './upgrades';

export const LEGACY_ROGUE_KEY = 'undead-tower.leaderboard.rogue-v1';
export const LEGACY_SIX_ROGUE_KEY = 'undead-tower.leaderboard.rogue-six-v2';
export const ROGUE_KEY = 'undead-tower.leaderboard.rogue-revision-v3';
export function shuffle<T>(values: T[], random: () => number): T[] {
  for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; }
  return values;
}
const KINDS = ZOMBIE_KINDS;
export const ENEMY_INTEL: Partial<Record<ZombieKind, { wave: number; tip: string }>> = {
  football: { wave: 4, tip: '橄榄球僵尸：移动很快，优先拦截' },
  wizard: { wave: 6, tip: '巫师：非致命受击后瞬移，重新寻找目标' },
  giant: { wave: 8, tip: '巨人：体型巨大但缓慢，集中火力并留意其他通路' },
  skitter: { wave: 10, tip: '游走者：左右变向接近，持续跟枪或用散弹覆盖' },
  charger: { wave: 13, tip: '突进者：蓄力时射击可打断，否则会沿通路高速突进' },
  howler: { wave: 15, tip: '号令者：打断蓄势或优先击杀，避免附近尸群获得加速' },
  berserker: { wave: 18, tip: '狂暴者：生命降至40%后永久狂暴，保留爆发火力完成击杀' },
};
export const waveIntel = (wave: number) => Object.values(ENEMY_INTEL).filter(intel => intel.wave === wave).map(intel => intel.tip);
export function waveCounts(wave: number) {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new Error('Invalid wave');
  const counts = Object.fromEntries(KINDS.map(kind => [kind, 0])) as Record<ZombieKind, number>;
  const earlyWeak = [6, 8, 10, 9, 9, 9, 10, 10, 11, 10];
  const weakTotal = wave <= 10 ? earlyWeak[wave - 1] : Math.max(0, 10 - Math.floor((wave - 9) * 2 / 3));
  counts.normal = Math.ceil(weakTotal * .4);
  counts.cone = Math.ceil((weakTotal - counts.normal) / 2);
  counts.bucket = weakTotal - counts.normal - counts.cone;
  const unlocked = (Object.entries(ENEMY_INTEL) as [ZombieKind, { wave: number; tip: string }][]).filter(([, intel]) => intel.wave <= wave).map(([kind]) => kind);
  if (unlocked.length) {
    // Once builds approach their upgrade ceiling, linear quotas let the strongest
    // weapons settle into an endless throughput equilibrium. Keep the target
    // regular-player window unchanged, then make late waves progressively denser.
    const latePressure = Math.floor(Math.max(0, wave - 24) ** 2 / 4);
    const strongTotal = Math.max(unlocked.length, wave - 1 + latePressure);
    for (const kind of unlocked) counts[kind] = 1;
    const rotation: ZombieKind[] = wave <= 24
      ? ['skitter', 'football', 'charger', 'wizard', 'skitter', 'howler', 'football', 'berserker', 'giant']
      : ['berserker'];
    for (let index = unlocked.length; index < strongTotal; index++) {
      const available = rotation.filter(kind => unlocked.includes(kind));
      counts[available[(index - unlocked.length) % available.length]]++;
    }
  }
  return counts;
}
// 前段给逐发武器建立构筑的时间，后段持续增压；没有指定波数强制失败。
export const waveRate = (wave: number) => Math.min(10, .5 + .06 * (wave - 1) + .015 * Math.max(0, wave - 15) ** 2);
export function waveEnemies(wave: number, random: () => number) {
  const counts = waveCounts(wave);
  const enemies = shuffle(KINDS.flatMap(kind => Array<ZombieKind>(counts[kind]).fill(kind)), random);
  const first = KINDS.find(kind => ENEMY_INTEL[kind]?.wave === wave);
  if (first) enemies.unshift(...enemies.splice(enemies.indexOf(first), 1));
  return enemies;
}
export interface RogueResult {
  version: 2; weapon: WeaponId; seed: number; completed: number; failedWave: number; waveKills: number;
  waveTotal: number; clearTime: number; levels: UpgradeLevels;
}
export interface RogueSnapshot {
  wave: number; total: number; remaining: number; completed: number; countdown: number;
  weapon: WeaponId; levels: UpgradeLevels; choices: UpgradeId[]; stats: WeaponDefinition;
  skill: SkillSnapshot; skillStats: SkillStats;
}

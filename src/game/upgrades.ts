import { WEAPONS } from './weapons';
import type { WeaponDefinition, WeaponId } from './weapons';

export type Rarity = 'common' | 'rare' | 'epic';
export const RARITIES = {
  common: { label: '普通', weight: 60 },
  rare: { label: '稀有', weight: 30 },
  epic: { label: '史诗', weight: 10 },
} as const;
interface UpgradeDefinition { name: string; detail: string; max: number; rarity: Rarity; weapon?: WeaponId; }
export const UPGRADES = {
  damage: { name: '强装药', detail: '基础伤害每层 +20%', max: 5, rarity: 'common' },
  rate: { name: '轻快扳机', detail: '基础射速每层 +12%', max: 5, rarity: 'common' },
  magazine: { name: '扩容弹匣', detail: '弹容每层 +3 发', max: 4, rarity: 'common' },
  reload: { name: '快速装填', detail: '装填速度每层 +15%', max: 4, rarity: 'common' },
  critical_chance: { name: '致命概率', detail: '暴击率每层 +5 个百分点，身体命中也可暴击', max: 5, rarity: 'common' },
  critical_damage: { name: '致命冲击', detail: '暴击伤害倍率每层 +0.25', max: 4, rarity: 'rare' },
  duration: { name: '持久战术', detail: '技能持续每层 +0.8 秒，最多不超过冷却', max: 4, rarity: 'rare' },
  cooldown: { name: '快速整备', detail: '技能冷却恢复速度每层 +16%', max: 4, rarity: 'rare' },
  rifle_velocity: { name: '重型弹芯', detail: '步枪基础伤害每层 +30%', max: 3, rarity: 'rare', weapon: 'rifle' },
  rifle_overload: { name: '过载导轨', detail: '超载期间最终伤害每层 +45%', max: 3, rarity: 'epic', weapon: 'rifle' },
  p90_dense: { name: '疾风枪机', detail: 'P90 基础射速每层 +24%', max: 3, rarity: 'rare', weapon: 'p90' },
  p90_frost: { name: '深度冻结', detail: '霜冻减速每层 +12 个百分点；余效每层 +1 秒', max: 3, rarity: 'epic', weapon: 'p90' },
  pistol_match: { name: '竞赛弹药', detail: '手枪基础伤害每层 +30%', max: 3, rarity: 'rare', weapon: 'pistol' },
  pistol_partner: { name: '镜像火力', detail: '副手伤害倍率每层 +0.45', max: 3, rarity: 'epic', weapon: 'pistol' },
  revolver_cylinder: { name: '长弹巢', detail: '左轮弹容每层 +2 发，装填速度每层 +10%', max: 3, rarity: 'rare', weapon: 'revolver' },
  revolver_deadeye: { name: '致命锁定', detail: '死眼期间暴击率每层 +15 个百分点', max: 3, rarity: 'epic', weapon: 'revolver' },
  shotgun_choke: { name: '猎群喉缩', detail: '每层增加 1 颗弹丸，并缩紧散布', max: 3, rarity: 'rare', weapon: 'shotgun' },
  shotgun_impact: { name: '破阵装药', detail: '每层击退距离 +1 米，每次扳机附加 40 点冲击伤害', max: 3, rarity: 'epic', weapon: 'shotgun' },
  sniper_caliber: { name: '重径枪管', detail: '狙击基础伤害每层 +35%', max: 3, rarity: 'rare', weapon: 'sniper' },
  sniper_pierce: { name: '纵深贯穿', detail: '每层额外贯穿 1 名敌人，后续目标保留伤害 +10 个百分点', max: 3, rarity: 'epic', weapon: 'sniper' },
} as const satisfies Record<string, UpgradeDefinition>;
export type UpgradeId = keyof typeof UPGRADES;
export type UpgradeLevels = Record<UpgradeId, number>;
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
export const freshLevels = (): UpgradeLevels => Object.fromEntries(UPGRADE_IDS.map(id => [id, 0])) as UpgradeLevels;
export function eligibleUpgrades(weapon: WeaponId) {
  return UPGRADE_IDS.filter(id => !('weapon' in UPGRADES[id]) || (UPGRADES[id] as UpgradeDefinition).weapon === weapon);
}
export function maxUpgradeCount(weapon: WeaponId) { return eligibleUpgrades(weapon).reduce((sum, id) => sum + UPGRADES[id].max, 0); }

/** All growth is computed from immutable base definitions; previews and combat use this function. */
export function weaponStats(weapon: WeaponId, levels: UpgradeLevels): WeaponDefinition {
  const base = WEAPONS.find(gun => gun.id === weapon)!;
  const damageBonus = weapon === 'rifle' ? .3 * levels.rifle_velocity : weapon === 'pistol' ? .3 * levels.pistol_match : weapon === 'sniper' ? .35 * levels.sniper_caliber : 0;
  const speed = 1 + .12 * levels.rate + (weapon === 'p90' ? .24 * levels.p90_dense : 0);
  const reloadSpeed = 1 + .15 * levels.reload + (weapon === 'revolver' ? .1 * levels.revolver_cylinder : 0);
  return { ...base, damage: base.damage * (1 + .2 * levels.damage + damageBonus), headMultiplier: base.headMultiplier ?? 2,
    interval: base.interval / speed, fireDuration: base.fireDuration / speed,
    capacity: base.capacity + 3 * levels.magazine + (weapon === 'revolver' ? 2 * levels.revolver_cylinder : 0),
    reloadDuration: base.reloadDuration / reloadSpeed,
    pellets: base.pellets + (weapon === 'shotgun' ? levels.shotgun_choke : 0),
    spread: base.spread / (1 + (weapon === 'shotgun' ? .2 * levels.shotgun_choke : 0)),
  };
}
// Compatibility for practice/legacy consumers; formal sessions always supply their weapon.
export const pistolStats = (levels: UpgradeLevels) => weaponStats('pistol', levels);

export const SKILLS = {
  rifle: { name: '弹药超载', detail: '限时不消耗弹匣，空匣也可激活', duration: 6, cooldown: 24, color: '#e8b260' },
  p90: { name: '霜冻弹幕', detail: '命中减速，连续命中刷新余效', duration: 6, cooldown: 22, color: '#82cdd2' },
  pistol: { name: '双持齐射', detail: '左右枪口同时射击，每对消耗 1 发', duration: 5, cooldown: 22, color: '#e2c58d' },
  revolver: { name: '死眼锁定', detail: '辅助锁定可见目标，左键开火', duration: 6, cooldown: 24, color: '#df9674' },
  shotgun: { name: '震退装药', detail: '散弹命中击退，每个目标每次扳机一次', duration: 5, cooldown: 20, color: '#bed08c' },
  sniper: { name: '贯穿弹', detail: '一条弹道穿过多个敌人，无法穿墙', duration: 6, cooldown: 26, color: '#adbbe5' },
} as const;
export interface SkillStats {
  duration: number; cooldown: number; damageMultiplier: number; criticalChanceBonus: number;
  slowFraction: number; slowDuration: number; offhandMultiplier: number;
  knockback: number; impactDamage: number; pierceTargets: number; pierceRetention: number;
}
export function skillStats(weapon: WeaponId, levels: UpgradeLevels): SkillStats {
  const base = SKILLS[weapon], cooldown = Math.max(8, base.cooldown / (1 + .16 * levels.cooldown));
  return { cooldown, duration: Math.min(cooldown, base.duration + .8 * levels.duration),
    damageMultiplier: weapon === 'rifle' ? 1 + .45 * levels.rifle_overload : 1,
    criticalChanceBonus: weapon === 'revolver' ? .15 * levels.revolver_deadeye : 0,
    slowFraction: Math.min(.8, .35 + .12 * levels.p90_frost), slowDuration: 2 + levels.p90_frost,
    offhandMultiplier: .65 + .45 * levels.pistol_partner,
    knockback: 2 + levels.shotgun_impact, impactDamage: 40 * levels.shotgun_impact,
    pierceTargets: 2 + levels.sniper_pierce, pierceRetention: Math.min(1, .7 + .1 * levels.sniper_pierce),
  };
}

/** Independent from head location; legacy head levels never enter these formulas. */
export function criticalStats(weapon: WeaponId, levels: UpgradeLevels, active = false) {
  const level = (id: 'critical_chance' | 'critical_damage') => Math.min(UPGRADES[id].max, Math.max(0, Number.isFinite(levels[id]) ? levels[id] : 0));
  return {
    chance: Math.min(1, Math.max(0, .05 + .05 * level('critical_chance') + (active ? skillStats(weapon, levels).criticalChanceBonus : 0))),
    multiplier: 1.5 + .25 * level('critical_damage'),
  };
}

/** Select a nonempty rarity first, then a card within it; remove each selected ID. */
export function upgradeChoices(levels: UpgradeLevels, random: () => number, weapon: WeaponId = 'pistol'): UpgradeId[] {
  let remaining = eligibleUpgrades(weapon).filter(id => levels[id] < UPGRADES[id].max);
  const choices: UpgradeId[] = [];
  while (remaining.length && choices.length < 3) {
    const rarities = (Object.keys(RARITIES) as Rarity[]).filter(r => remaining.some(id => UPGRADES[id].rarity === r));
    let roll = random() * rarities.reduce((sum, rarity) => sum + RARITIES[rarity].weight, 0);
    const rarity = rarities.find(r => { roll -= RARITIES[r].weight; return roll < 0; }) ?? rarities[rarities.length - 1];
    const pool = remaining.filter(id => UPGRADES[id].rarity === rarity);
    const id = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    choices.push(id); remaining = remaining.filter(candidate => candidate !== id);
  }
  return choices;
}
export function applyUpgrade(weapon: WeaponId, levels: UpgradeLevels, choices: readonly UpgradeId[], id: UpgradeId): UpgradeLevels | null {
  if (!choices.includes(id) || !eligibleUpgrades(weapon).includes(id) || levels[id] >= UPGRADES[id].max) return null;
  return { ...levels, [id]: levels[id] + 1 };
}

interface PreviewMetric { label: string; before: number; after: number; digits: number; unit: string; }
export function upgradePreview(weapon: WeaponId, levels: UpgradeLevels, id: UpgradeId): PreviewMetric[] {
  const next = { ...levels, [id]: Math.min(UPGRADES[id].max, levels[id] + 1) };
  const a = weaponStats(weapon, levels), b = weaponStats(weapon, next), sa = skillStats(weapon, levels), sb = skillStats(weapon, next);
  const ca = criticalStats(weapon, levels), cb = criticalStats(weapon, next);
  const metrics: PreviewMetric[] = [];
  const add = (label: string, before: number, after: number, digits: number, unit: string) => { if (Math.abs(after - before) > 1e-8) metrics.push({ label, before, after, digits, unit }); };
  add('伤害', a.damage, b.damage, 1, ''); add('射速', 1 / a.interval, 1 / b.interval, 2, '发/秒');
  add('弹容', a.capacity, b.capacity, 0, '发'); add('单次装填', a.reloadDuration, b.reloadDuration, 2, '秒');
  add('暴击率', ca.chance * 100, cb.chance * 100, 0, '%'); add('暴击伤害', ca.multiplier, cb.multiplier, 2, '倍'); add('弹丸', a.pellets, b.pellets, 0, '颗');
  add('散布', a.spread * 1000, b.spread * 1000, 1, 'mrad');
  add('持续', sa.duration, sb.duration, 1, '秒'); add('冷却', sa.cooldown, sb.cooldown, 1, '秒');
  if (weapon === 'rifle') add('超载伤害', sa.damageMultiplier, sb.damageMultiplier, 2, '倍');
  if (weapon === 'p90') { add('减速', sa.slowFraction * 100, sb.slowFraction * 100, 0, '%'); add('余效', sa.slowDuration, sb.slowDuration, 1, '秒'); }
  if (weapon === 'pistol') add('副手伤害', sa.offhandMultiplier, sb.offhandMultiplier, 2, '倍');
  if (weapon === 'revolver' && id === 'revolver_deadeye') add('死眼暴击率', criticalStats(weapon, levels, true).chance * 100, criticalStats(weapon, next, true).chance * 100, 0, '%');
  if (weapon === 'shotgun') { add('击退', sa.knockback, sb.knockback, 1, '米'); add('冲击伤害', sa.impactDamage, sb.impactDamage, 0, ''); }
  if (weapon === 'sniper') { add('贯穿人数', sa.pierceTargets, sb.pierceTargets, 0, '名'); add('后续伤害', sa.pierceRetention * 100, sb.pierceRetention * 100, 0, '%'); }
  return metrics;
}

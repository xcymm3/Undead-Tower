import { describe, expect, it, vi } from 'vitest';
import { Material, Raycaster, Vector3 } from 'three';
import { createShot, hitWithShot, criticalRandom, projectileHits } from '../../src/game/combat';
import { criticalStats, freshLevels, weaponStats, skillStats, upgradePreview, UPGRADES, eligibleUpgrades, type UpgradeLevels } from '../../src/game/upgrades';
import { WEAPON_IDS, WEAPONS } from '../../src/game/weapons';
import { Encounter } from '../../src/game/encounter';
import { ZombieField } from '../../src/game/zombies';
import { seededRandom } from '../../src/game/geometry';
import { hitFeedbackText, strongestFeedback } from '../../src/game/hitFeedback';
import { LeaderboardStore } from '../../src/game/leaderboard';
import { ROGUE_KEY } from '../../src/game/rogue';

function arena() {
  const encounter = new Encounter(); encounter.mode = 'survival';
  encounter.zombies = [-15, -21].map((z, id) => ({ id, kind: 'normal' as const, health: 10000, maxHealth: 10000, armorHealth: 0, x: 0, z, bornAt: 0, downTime: 0 }));
  return encounter;
}
describe('独立暴击成长', () => {
  it.each(WEAPON_IDS)('%s 身体可暴击，基础爆头不成长，预览与生产公式一致', weapon => {
    const levels = freshLevels(), base = WEAPONS.find(w => w.id === weapon)!;
    expect(criticalStats(weapon, levels)).toEqual({ chance: .05, multiplier: 1.5 });
    for (let n = 0; n <= 5; n++) expect(criticalStats(weapon, { ...levels, critical_chance: n }).chance).toBeCloseTo(.05 + .05 * n);
    for (let n = 0; n <= 4; n++) expect(criticalStats(weapon, { ...levels, critical_damage: n }).multiplier).toBe(1.5 + .25 * n);
    expect(criticalStats(weapon, { ...levels, critical_chance: 50, critical_damage: 40 })).toEqual({ chance: .3, multiplier: 2.5 });
    const grown = { ...levels, critical_chance: 5, critical_damage: 4, revolver_deadeye: 3, head: 99 };
    expect(weaponStats(weapon, grown).headMultiplier).toBe(base.headMultiplier ?? 2);
    expect(eligibleUpgrades(weapon)).not.toContain('head'); expect(eligibleUpgrades(weapon).length).toBeGreaterThanOrEqual(9);
    expect(upgradePreview(weapon, levels, 'critical_chance')).toEqual([{ label: '暴击率', before: 5, after: 10, digits: 0, unit: '%' }]);
    expect(upgradePreview(weapon, levels, 'critical_damage')).toEqual([{ label: '暴击伤害', before: 1.5, after: 1.75, digits: 2, unit: '倍' }]);
    expect(UPGRADES.critical_chance.rarity).toBe('common'); expect(UPGRADES.critical_damage.rarity).toBe('rare');
    for (const head of [false, true]) for (const critical of [false, true]) {
      const e = arena(), shot = createShot(weaponStats(weapon, grown), grown, false, () => critical ? 0 : .99);
      expect(hitWithShot(e, shot, 0, head)?.critical).toBe(critical);
      expect(10000 - e.zombies[0].health).toBeCloseTo(base.damage * (head ? base.headMultiplier ?? 2 : 1) * (critical ? 2.5 : 1));
    }
  });
  it('左轮只在技能生效期间增加概率且封顶100%，旧head字段不参与计算', () => {
    const l = { ...freshLevels(), critical_chance: 5, revolver_deadeye: 3 };
    expect(criticalStats('revolver', l).chance).toBe(.3);
    expect(criticalStats('revolver', l, true).chance).toBeCloseTo(.75);
    expect(skillStats('revolver', l).criticalChanceBonus).toBeCloseTo(.45);
    expect(criticalStats('pistol', l, true).chance).toBe(.3);
    expect(criticalStats('revolver', { ...l, revolver_deadeye: 99 }, true).chance).toBe(1);
    const old = { ...freshLevels(), head: 5 } as Record<string, number>; delete old.critical_chance; delete old.critical_damage;
    expect(criticalStats('pistol', old as UpgradeLevels)).toEqual({ chance: .05, multiplier: 1.5 });
    expect(weaponStats('pistol', old as UpgradeLevels).headMultiplier).toBe(2);
    const raw = JSON.stringify([{ rogue: { version: 2, levels: old } }]);
    const store = new LeaderboardStore({ getItem: () => raw, setItem: () => { throw new Error('read must not write'); } }, ROGUE_KEY);
    expect(store.read()).toEqual([]); expect(freshLevels()).not.toHaveProperty('head');
  });
});
describe('真实弹丸判定粒度与碰撞', () => {
  it('双持两枪独立判定并保持副手倍率，散弹逐颗独立', () => {
    const levels = freshLevels(), random = vi.fn().mockReturnValueOnce(0).mockReturnValue(.99);
    const e = arena(), pistol = createShot(weaponStats('pistol', levels), levels, true, random);
    expect(pistol.projectiles).toEqual([true, false]); expect(random).toHaveBeenCalledTimes(2);
    hitWithShot(e, pistol, 0, false, 0); hitWithShot(e, pistol, 0, false, 1);
    expect(10000 - e.zombies[0].health).toBeCloseTo(pistol.weapon.damage * 1.5 + pistol.weapon.damage * .65);
    let n = 0; const shot = createShot(weaponStats('shotgun', levels), levels, false, () => n++ % 2 ? .99 : 0);
    expect(n).toBe(7); expect(shot.projectiles).toEqual([true, false, true, false, true, false, true]);
    const target = arena();
    for (let pellet = 0; pellet < 7; pellet++) expect(hitWithShot(target, shot, 0, false, 0, 0, pellet)?.critical).toBe(pellet % 2 === 0);
    expect(10000 - target.zombies[0].health).toBeCloseTo(shot.weapon.damage * (4 * 1.5 + 3));
  });
  it('贯穿弹沿真实实例碰撞共享一次判定，不重复抽样；世界/未命中不返回伤害反馈', () => {
    const e = arena(), levels = freshLevels(), random = vi.fn(() => 0), field = new ZombieField(); field.sync(e);
    try {
      const shot = createShot(weaponStats('sniper', levels), levels, true, random);
      const ray = new Raycaster(new Vector3(0, 1.25, 9), new Vector3(0, 0, -1));
      const hits = projectileHits(ray.intersectObject(field), h => field.decode(h), 2);
      expect(hits.map(h => field.decode(h)?.id)).toEqual([0, 1]);
      hits.forEach((hit, depth) => { const target = field.decode(hit)!; expect(hitWithShot(e, shot, target.id, target.head, 0, depth)?.critical).toBe(true); });
      expect(random).toHaveBeenCalledTimes(1);
      expect(10000 - e.zombies[0].health).toBe(shot.weapon.damage * 1.5);
      expect(10000 - e.zombies[1].health).toBeCloseTo(shot.weapon.damage * 1.5 * .7);
      expect(hitWithShot(e, shot, 999, true)).toBeNull(); e.hit(0, false, 99999); expect(hitWithShot(e, shot, 0, true)).toBeNull();
      const missed = createShot(weaponStats('shotgun', levels), levels, false, random);
      expect(random).toHaveBeenCalledTimes(8); expect(missed.impacted.size).toBe(0);
    } finally { field.dispose(); (field.material as Material).dispose(); }
  });
  it('霰弹冲击伤害每目标仅一次，技能基础伤害先相加再应用爆头/暴击', () => {
    const e = arena(), l = { ...freshLevels(), shotgun_impact: 1 }, shot = createShot(weaponStats('shotgun', l), l, true, () => 0);
    hitWithShot(e, shot, 0, true, 0, 0, 0); hitWithShot(e, shot, 0, true, 0, 0, 1);
    expect(10000 - e.zombies[0].health).toBeCloseTo((shot.weapon.damage * 2 + 40) * 2 * 1.5);
  });
  it('独立随机流可重放，刷怪/升级/命中决策采样不改变暴击序列', () => {
    const a = criticalRandom(42031), b = criticalRandom(42031), unrelated = seededRandom(42031);
    for (let i = 0; i < 1000; i++) { for (let j = 0; j < i % 7; j++) unrelated(); expect(a()).toBe(b()); }
    const sample = criticalRandom(55); let hits = 0; for (let i = 0; i < 100000; i++) if (sample() < .05) hits++;
    expect(hits / 100000).toBeCloseTo(.05, 2);
  });
  it('提示保留真正的暴击/头部组合，后续普通命中不覆盖暴击', () => {
    const body = { head: false, killed: false, armorBroken: false, critical: true }, head = { ...body, head: true, critical: false };
    expect(hitFeedbackText(body).label).toBe('暴击'); expect(hitFeedbackText({ ...body, head: true }).label).toBe('暴击爆头');
    expect(strongestFeedback(body, head)).toEqual(body); expect(strongestFeedback(head, body)).toEqual(body);
    expect(strongestFeedback(body, { ...body, head: true }).head).toBe(true);
  });
});

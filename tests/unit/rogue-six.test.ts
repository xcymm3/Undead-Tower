import { describe, it, expect } from 'vitest';
import { WEAPONS, WEAPON_IDS } from '../../src/game/weapons';
import { ActiveSkill } from '../../src/game/skills';
import { Arsenal } from '../../src/game/arsenal';
import { Firearm } from '../../src/game/firearm';
import { freshLevels, UPGRADES, eligibleUpgrades, upgradeChoices, weaponStats, skillStats, upgradePreview, applyUpgrade, ROGUE_KEY, LEGACY_ROGUE_KEY, waveCounts } from '../../src/game/rogue';
import { seededRandom } from '../../src/game/geometry';
import { Encounter } from '../../src/game/encounter';
import { Navigation } from '../../src/game/navigation';
import { createShot, hitWithShot, projectileHits, projectileCount } from '../../src/game/combat';
import { LeaderboardStore, personalRecord, rankResults } from '../../src/game/leaderboard';
import type { RunResult } from '../../src/game/config';
import type { WeaponId } from '../../src/game/weapons';
import { BoxGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { ZombieField } from '../../src/game/zombies';

describe('六枪成长与稀有度', () => {
  it.each(WEAPON_IDS)('%s 的候选包含三档与两项专属，属性计算不污染基础或其他枪', weapon => {
    const bases = JSON.stringify(WEAPONS), levels = freshLevels(), ids = eligibleUpgrades(weapon);
    expect(ids).toHaveLength(10); expect(ids.filter(id => 'weapon' in UPGRADES[id])).toHaveLength(2);
    expect(new Set(ids.map(id => UPGRADES[id].rarity)).size).toBe(3);
    for (const id of ids) {
      const previews = upgradePreview(weapon, levels, id);
      expect(previews.length, id).toBeGreaterThan(0);
      expect(previews.every(metric => Number.isFinite(metric.after) && metric.before !== metric.after)).toBe(true);
      levels[id] = UPGRADES[id].max;
    }
    const stats = weaponStats(weapon, levels), base = WEAPONS.find(gun => gun.id === weapon)!;
    expect(stats.damage).toBeGreaterThan(base.damage); expect(stats.fireDuration).toBeLessThanOrEqual(stats.interval);
    expect(stats.automatic).toBe(base.automatic); expect(stats.shellReload).toBe(base.shellReload);
    expect(JSON.stringify(WEAPONS)).toBe(bases); expect(upgradeChoices(levels, seededRandom(1), weapon)).toEqual([]);
  });
  it.each(WEAPON_IDS)('%s 首张三档频率符合 60/30/10（30000 次），无重复且确定性', weapon => {
    const levels = freshLevels(), rng = seededRandom(7919), frequencies = { common: 0, rare: 0, epic: 0 };
    for (let i = 0; i < 30000; i++) {
      const choices = upgradeChoices(levels, rng, weapon);
      frequencies[UPGRADES[choices[0]].rarity]++;
      expect(new Set(choices).size).toBe(3);
      expect(choices.every(id => eligibleUpgrades(weapon).includes(id))).toBe(true);
    }
    for (const [rarity, probability] of [['common', .6], ['rare', .3], ['epic', .1]] as const) expect(Math.abs(frequencies[rarity] / 30000 - probability)).toBeLessThanOrEqual(.015);
    expect(upgradeChoices(levels, seededRandom(123), weapon)).toEqual(upgradeChoices(levels, seededRandom(123), weapon));
  });
  it('移除空档后重归一化，非法/错枪/满级选择不修改状态', () => {
    const levels = freshLevels();
    for (const id of eligibleUpgrades('rifle')) if (UPGRADES[id].rarity === 'common') levels[id] = UPGRADES[id].max;
    expect(UPGRADES[upgradeChoices(levels, () => .74, 'rifle')[0]].rarity).toBe('rare');
    expect(UPGRADES[upgradeChoices(levels, () => .76, 'rifle')[0]].rarity).toBe('epic');
    expect(applyUpgrade('rifle', levels, ['damage'], 'damage')).toBeNull();
    expect(applyUpgrade('rifle', levels, ['pistol_partner'], 'pistol_partner')).toBeNull();
    expect(applyUpgrade('rifle', levels, [], 'duration')).toBeNull();
    expect(applyUpgrade('rifle', levels, ['duration'], 'duration')?.duration).toBe(1); expect(levels.duration).toBe(0);
  });
  it('每枪稀有被动收益高于同类普通单层，史诗强化具有实际额外收益', () => {
    const l = freshLevels();
    expect(weaponStats('rifle', {...l,rifle_velocity:1}).damage).toBeGreaterThan(weaponStats('rifle',{...l,damage:1}).damage);
    expect(weaponStats('p90',{...l,p90_dense:1}).interval).toBeLessThan(weaponStats('p90',{...l,rate:1}).interval);
    expect(weaponStats('pistol',{...l,pistol_match:1}).damage).toBeGreaterThan(weaponStats('pistol',{...l,damage:1}).damage);
    expect(weaponStats('sniper',{...l,sniper_caliber:1}).damage).toBeGreaterThan(weaponStats('sniper',{...l,damage:1}).damage);
    expect(weaponStats('revolver',{...l,revolver_cylinder:1}).reloadDuration).toBeLessThan(weaponStats('revolver',l).reloadDuration);
    expect(weaponStats('shotgun',{...l,shotgun_choke:1}).pellets).toBe(8);
    expect(skillStats('rifle',{...l,rifle_overload:1}).damageMultiplier).toBe(1.45);
    expect(skillStats('p90',{...l,p90_frost:1}).slowFraction).toBeCloseTo(.47);
    expect(skillStats('pistol',{...l,pistol_partner:1}).offhandMultiplier).toBeCloseTo(1.1);
    expect(skillStats('revolver',{...l,revolver_deadeye:1}).criticalChanceBonus).toBe(.15);
    expect(skillStats('shotgun',{...l,shotgun_impact:1}).impactDamage).toBe(40);
    expect(skillStats('sniper',{...l,sniper_pierce:1}).pierceTargets).toBe(3);
  });
});

describe('技能计时与战斗', () => {
  it.each(WEAPON_IDS)('%s 的按下沿、拒绝、冷却、波间结束和新局重置', weapon => {
    const active = new ActiveSkill(), base = skillStats(weapon, freshLevels());
    expect(active.press(base, false)).toBe(false); expect(active.cooldownRemaining).toBe(0);
    expect(active.press(base, true)).toBe(false); active.release(); expect(active.press(base, true)).toBe(true);
    active.update(base.cooldown); expect(active.press(base, true)).toBe(false);
    active.release(); expect(active.press(base, true)).toBe(true); active.update(1); active.end();
    expect(active.active).toBe(false); expect(active.cooldownRemaining).toBe(base.cooldown - 1);
    const grown = skillStats(weapon, {...freshLevels(),duration:4,cooldown:4});
    expect(grown.duration).toBeGreaterThan(base.duration); expect(grown.cooldown).toBeLessThan(base.cooldown);
    expect(grown.duration).toBeLessThanOrEqual(grown.cooldown); expect(grown.cooldown).toBeGreaterThan(0);
    active.reset(); expect(active.snapshot()).toEqual({active:false,remaining:0,cooldownRemaining:0,endedRemaining:0,activations:0});
  });
  it('步枪空匣超载遵守射速，结束后仍为空；重置军械库清除全部成长', () => {
    const gun = new Firearm(); gun.ammo = 0;
    expect(gun.fire()).toBe(false); expect(gun.fire(true)).toBe(true); expect(gun.fire(true)).toBe(false);
    gun.update(1); expect(gun.ammo).toBe(0); expect(gun.fire()).toBe(false);
    const arsenal = new Arsenal(); arsenal.guns[0].definition.damage = 999; arsenal.reset(); expect(arsenal.guns[0].definition.damage).toBe(50);
  });
  it('双持独立弹丸伤害、P90 减速到期、死者不受状态；死眼提高独立暴击概率', () => {
    const e = new Encounter(); const id=e.zombies[0].id;
    e.zombies[0].health=1000; e.zombies[0].maxHealth=1000;
    const pistol = createShot(weaponStats('pistol',freshLevels()),freshLevels(),true, () => .99);
    expect(projectileCount('pistol',true)).toBe(2); expect(projectileCount('pistol',false)).toBe(1);
    hitWithShot(e,pistol,id,false); hitWithShot(e,pistol,id,false,1); expect(e.zombies[0].health).toBeCloseTo(1000-85*1.65);
    const frost=createShot(weaponStats('p90',freshLevels()),freshLevels(),true, () => .99);
    hitWithShot(e,frost,id,false); expect(e.zombies[0].slowFraction).toBe(.35); expect(e.zombies[0].slowRemaining).toBe(2);
    e.mode='survival'; e.startWave([],1); e.zombies=[{id:9,kind:'giant',health:2000,maxHealth:2000,armorHealth:0,x:0,z:-100,bornAt:0,downTime:0}];
    e.slow(9,.35,.1); e.update(.15,()=>null); expect(e.zombies[0].slowRemaining).toBe(0);
    const levels={...freshLevels(),revolver_deadeye:1}; hitWithShot(e,createShot(weaponStats('revolver',levels),levels,true, () => .1),9,true);
    expect(e.zombies[0].health).toBe(1475); e.hit(9,false,99999); expect(e.slow(9,.5,2)).toBe(false); expect(e.knockback(9,2)).toBe(0);
  });
  it('散弹同次扳机只击退一次，位移在障碍前停止', () => {
    const e=new Encounter();e.mode='survival'; e.zombies=[{id:1,kind:'normal',health:1000,maxHealth:1000,armorHealth:0,x:0,z:-10,bornAt:0,downTime:0}];
    e.setNavigation(new Navigation([{id:'wall',minX:-2,maxX:2,minZ:-14,maxZ:-13}]));
    const shot=createShot(weaponStats('shotgun',freshLevels()),freshLevels(),true, () => .99);
    hitWithShot(e,shot,1,false); const after=e.zombies[0].z; hitWithShot(e,shot,1,false);
    expect(after).toBeCloseTo(-12); expect(e.zombies[0].z).toBe(after); e.knockback(1,5); expect(e.zombies[0].z).toBeGreaterThan(-12.051);
  });
  it('贯穿去重并由世界阻挡，非贯穿只命中首目标', () => {
    const hits=[{id:1},{id:1},{id:2},{id:null},{id:3}];
    const decode=(hit:typeof hits[number])=>hit.id===null?null:{id:hit.id};
    expect(projectileHits(hits,decode,5)).toEqual(hits.filter((_,i)=>i!==1&&i!==4));
    expect(projectileHits(hits,decode,2)).toEqual([{id:1},{id:2}]); expect(projectileHits(hits,decode,1)).toEqual([{id:1}]);
  });
  it('真实实例化身体射线贯穿两名敌人，但最近世界方块截断弹道', () => {
    const e = new Encounter(); e.mode = 'survival';
    e.zombies = [-15, -21].map((z, id) => ({ id, kind:'normal' as const, health:100, maxHealth:100, armorHealth:0, x:0, z, bornAt:0, downTime:0 }));
    const field = new ZombieField(); field.sync(e);
    const wall = new Mesh(new BoxGeometry(2, 3, .4), new MeshBasicMaterial()); wall.position.set(0,1.5,-18); wall.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0,1.25,9),new Vector3(0,0,-1));
    const open = projectileHits(ray.intersectObjects([field],false), hit=>field.decode(hit),2);
    expect(open.map(hit=>field.decode(hit)?.id)).toEqual([0,1]);
    const blocked = projectileHits(ray.intersectObjects([field,wall],false), hit=>field.decode(hit),2);
    expect(blocked.map(hit=>field.decode(hit)?.id)).toEqual([0,undefined]);
    field.dispose(); wall.geometry.dispose(); wall.material.dispose();
  });
});

describe('六枪成绩隔离', () => {
  const result=(weapon:WeaponId, n=0):RunResult=>({id:`${weapon}-${n}`,difficulty:'hard',duration:20,kills:2,shots:1,hits:1,endedAt:'2026-09-04T00:00:00Z',rogue:{version:2,weapon,seed:1,completed:0,failedWave:1,waveKills:2,waveTotal:Object.values(waveCounts(1)).reduce((a,b)=>a+b),clearTime:0,levels:freshLevels()}});
  it('合法一发多杀、每枪 TOP10、个人最佳不混枪、旧键不动', () => {
    const data=new Map([[LEGACY_ROGUE_KEY,'legacy bytes']]);
    const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
    const store=new LeaderboardStore(storage,ROGUE_KEY);
    for(const weapon of WEAPON_IDS) for(let n=0;n<11;n++)store.record(result(weapon,n));
    expect(new LeaderboardStore(storage,ROGUE_KEY).read()).toHaveLength(60);expect(data.get(LEGACY_ROGUE_KEY)).toBe('legacy bytes');
    expect(personalRecord(result('sniper'),[result('pistol')]).status).toBe('first');
    expect(rankResults([{...result('pistol'),rogue:{...result('pistol').rogue!,levels:{...freshLevels(),rifle_overload:1}}}])).toEqual([]);
  });
});


describe('技能结束反馈使用有效时间', () => {
  it('只在自然到期产生，波间中断后不会由冷却进度伪造结束提示', () => {
    const skill = new ActiveSkill();
    const stats = skillStats('pistol', freshLevels());
    skill.press(stats, true); skill.update(stats.duration - .1);
    expect(skill.snapshot().endedRemaining).toBe(0);
    skill.update(.2);
    expect(skill.snapshot().endedRemaining).toBeCloseTo(1.5);
    skill.update(1.5); expect(skill.snapshot().endedRemaining).toBe(0);
    skill.reset(); skill.press(stats, true); skill.update(1); skill.end();
    skill.update(stats.duration);
    expect(skill.snapshot().endedRemaining).toBe(0);
    expect(skill.snapshot().cooldownRemaining).toBeGreaterThan(0);
  });
});

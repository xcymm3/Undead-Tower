import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { ENEMY_RULES, SURVIVAL, ZOMBIE_KINDS, ZOMBIE_TYPES, zombieScale, type ZombieKind } from '../../src/game/config';
import { Encounter, type Zombie } from '../../src/game/encounter';
import { triggerRage } from '../../src/game/enemyRules';
import { CrowdMovement } from '../../src/game/movement';
import { Navigation } from '../../src/game/navigation';
import { BreachSequence } from '../../src/game/breach';
import { ZombieField } from '../../src/game/zombies';
import { ENEMY_INTEL, waveCounts, waveEnemies, waveIntel, waveRate } from '../../src/game/rogue';
import { seededRandom } from '../../src/game/geometry';

const actor = (kind: ZombieKind, id = 1, x = 0, z = -30): Zombie => ({ id, kind, x, z, health: ZOMBIE_TYPES[kind].health, maxHealth: ZOMBIE_TYPES[kind].health, armorHealth: ZOMBIE_TYPES[kind].armor, bornAt: 0, downTime: 0, specialState: kind === 'charger' || kind === 'howler' ? 'ready' : undefined });
const encounter = (...zombies: Zombie[]) => {
  const e = new Encounter(); e.reset('survival', 'hard'); e.startWave([], 0); e.zombies = zombies; e.setNavigation(new Navigation([])); return e;
};
const weak = (wave: number) => { const counts = waveCounts(wave); return counts.normal + counts.cone + counts.bucket; };
const total = (wave: number) => Object.values(waveCounts(wave)).reduce((sum, count) => sum + count, 0);

describe('四类后期敌人规则', () => {
  it('冻结四类数值、首次波数与狂暴者恰为巨人总耐久两倍', () => {
    expect(ZOMBIE_TYPES.skitter.health).toBe(900);
    expect(ZOMBIE_TYPES.charger.health).toBe(1800);
    expect(ZOMBIE_TYPES.howler.health).toBe(1600);
    expect(ZOMBIE_TYPES.berserker.health).toBe((ZOMBIE_TYPES.giant.health + ZOMBIE_TYPES.giant.armor) * 2);
    expect([ENEMY_INTEL.skitter!.wave, ENEMY_INTEL.charger!.wave, ENEMY_INTEL.howler!.wave, ENEMY_INTEL.berserker!.wave]).toEqual([10, 13, 15, 18]);
  });

  it('狂暴阈值只触发一次，永久使用1.8倍速度，致死攻击不触发', () => {
    const z = actor('berserker'), e = encounter(z);
    expect(e.hit(1, false, 3119)?.enraged).toBe(false);
    expect(e.hit(1, false, 1)?.enraged).toBe(true);
    expect(z.health).toBe(2080); expect(e.hit(1, false, 1)?.enraged).toBe(false); expect(triggerRage(z)).toBe(false);
    const calm = actor('berserker', 3, 10), raging = actor('berserker', 4, -10); raging.enraged = true;
    const initial = Math.hypot(10, 39); new CrowdMovement().advance([calm, raging], .1, 1.4);
    expect(initial - Math.hypot(raging.x, raging.z - 9)).toBeCloseTo(.14 * ENEMY_RULES.berserker.speedMultiplier);
    expect(initial - Math.hypot(calm.x, calm.z - 9)).toBeCloseTo(.14);
    const dead = actor('berserker'); e.zombies = [dead]; expect(e.hit(1, false, 10000)?.enraged).toBe(false);
  });

  it('突进者在真实直线路段蓄力、冲刺并冷却，蓄力受击会踉跄且不耗配额', () => {
    const z = actor('charger', 1, 0, -10), e = encounter(z); e.waveTotal = 1;
    e.update(.1, () => null); expect(z.specialState).toBe('windup'); expect(z.z).toBe(-10);
    expect(e.drainEnemyEvents().map(event => event.type)).toContain('charger-windup');
    expect(e.hit(1, false, 1)?.killed).toBe(false); expect(z.specialState).toBe('staggered');
    expect(e.drainEnemyEvents().map(event => event.type)).toContain('charger-interrupted');
    e.update(.7, () => null); expect(z.specialState).toBe('ready'); expect(z.specialCooldown).toBeCloseTo(5);
    expect(e.waveTotal).toBe(1); expect(e.waveKills).toBe(0);
    const runner = actor('charger', 2, 0, -10), run = encounter(runner);
    run.update(.8, () => null); expect(runner.specialState).toBe('charging');
    const before = runner.z; run.update(.5, () => null);
    expect(runner.z - before).toBeCloseTo(1.4 * ENEMY_RULES.charger.speedMultiplier * .5);
    expect(run.drainEnemyEvents().map(event => event.type)).toEqual(expect.arrayContaining(['charger-windup', 'charger-charge']));
  });

  it('号令者需要两个可见盟友，号令不作用自身、不叠乘且受击可打断', () => {
    const source = actor('howler', 1, 0, -30), a = actor('normal', 2, 2, -30), b = actor('charger', 3, -2, -30);
    const e = encounter(source, a, b); e.update(.9, () => null);
    expect(source.commandRemaining ?? 0).toBe(0); expect(a.commandRemaining).toBeGreaterThanOrEqual(2.9); expect(b.commandRemaining).toBeGreaterThanOrEqual(2.9);
    expect(source.specialCooldown).toBeCloseTo(7);
    expect(e.drainEnemyEvents().find(event => event.type === 'howler-command')?.targetIds.sort()).toEqual([2, 3]);
    a.commandRemaining = 2.8; source.specialCooldown = 0; source.specialState = 'ready'; e.update(.1, () => null);
    expect(source.specialState).toBe('windup'); e.hit(1, false, 1);
    expect(source.specialState).toBe('ready'); expect(source.specialCooldown).toBeCloseTo(3);
    expect(e.drainEnemyEvents().map(event => event.type)).toContain('howler-interrupted');
    source.specialCooldown = 99; a.commandRemaining = .1; e.update(.1, () => null);
    expect(a.commandRemaining).toBe(0);
    expect(e.drainEnemyEvents()).toContainEqual(expect.objectContaining({ type: 'command-ended', sourceId: a.id }));
  });

  it('游走者连续左右变向，横移有界且每段通过真实导航并自然突破', () => {
    const nav = new Navigation([{ id: 'wall', minX: .8, maxX: 4, minZ: -25, maxZ: -12 }]);
    const z = actor('skitter', 0), movement = new CrowdMovement(nav); let positive = false, negative = false, failed = false;
    for (let i = 0; i < 1800 && !failed; i++) {
      const before = { ...z }; const result = movement.advance([z], 1 / 60, 1.4); failed = result.failed;
      expect(nav.clear(before, z)).toBe(true); expect(Math.abs(z.x)).toBeLessThan(2);
      expect(Math.hypot(z.x - before.x, z.z - before.z)).toBeLessThanOrEqual(1.4 / 60 + 1e-8);
      positive ||= z.x > before.x + .001; negative ||= z.x < before.x - .001;
    }
    expect(positive && negative).toBe(true); expect(failed).toBe(true);
  });

  it('四类受减速和逐段击退影响，死者不能再次触发', () => {
    const nav = new Navigation([{ id: 'rear', minX: -3, maxX: 3, minZ: -35, maxZ: -33 }]);
    for (const kind of ['skitter', 'charger', 'howler', 'berserker'] as const) {
      const z = actor(kind), e = encounter(z); e.setNavigation(nav);
      expect(e.slow(z.id, .5, 2)).toBe(true); e.update(1, () => null); expect(z.slowRemaining).toBeCloseTo(1);
      const before = { ...z }; const moved = e.knockback(z.id, 8);
      expect(moved).toBeGreaterThan(0); expect(moved).toBeLessThan(8); expect(nav.clear(before, z)).toBe(true);
      e.hit(z.id, true, 10000); expect(e.slow(z.id, .5, 2)).toBe(false); expect(e.knockback(z.id, 8)).toBe(0);
    }
  });
});

describe('十类阶段波池、实例和突破', () => {
  it('删除旧设计，逐波首次出场并以确定配额淘汰弱敌', () => {
    expect(ZOMBIE_KINDS).toHaveLength(10); expect(ZOMBIE_KINDS).not.toEqual(expect.arrayContaining(['shield', 'medic']));
    for (const [kind, intel] of Object.entries(ENEMY_INTEL)) {
      expect(waveCounts(intel.wave - 1)[kind as ZombieKind]).toBe(0);
      expect(waveEnemies(intel.wave, seededRandom(1))[0]).toBe(kind);
      expect(waveIntel(intel.wave)).toContain(intel.tip);
    }
    const caps = new Map([[5, .75], [10, .55], [15, .35], [20, .15], [25, 0]]);
    for (const [wave, cap] of caps) expect(weak(wave) / total(wave)).toBeLessThanOrEqual(cap);
    for (let wave = 10; wave < 25; wave++) expect(weak(wave + 1)).toBeLessThanOrEqual(weak(wave));
    for (let wave = 10; wave < 23; wave++) if (weak(wave) > 0) expect(weak(wave + 2)).toBeLessThan(weak(wave));
    expect([waveCounts(25).normal, waveCounts(25).cone, waveCounts(25).bucket]).toEqual([0, 0, 0]);
    expect(waveCounts(50).normal + waveCounts(50).cone + waveCounts(50).bucket).toBe(0);
  });

  it('全部种类走有限波次投放、真实头身碰撞和一次击杀清波', () => {
    const e = encounter(); e.startWave([...ZOMBIE_KINDS], 10); let x = -40;
    e.update(1.1, () => ({ x: x += 8, z: -100 }));
    expect(e.waveQueue).toEqual([]); expect(e.waveSpawned).toBe(10); expect(Object.values(e.zombieCounts)).toEqual(Array(10).fill(1));
    const field = new ZombieField();
    for (const kind of ZOMBIE_KINDS) {
      const z = actor(kind); e.zombies = [z]; e.mode = 'practice'; field.sync(e);
      const scale = zombieScale(kind), ray = new Raycaster(new Vector3(0, 1.83 * scale, 10), new Vector3(0, 0, -1));
      expect(field.decode(ray.intersectObject(field)[0])).toEqual({ id: 1, head: true });
      ray.ray.origin.y = 1.15 * scale; expect(field.decode(ray.intersectObject(field)[0])).toEqual({ id: 1, head: false });
      expect(e.hit(1, true, 10000)?.killed).toBe(true); expect(e.hit(1, true, 10000)).toBeNull();
      field.sync(e); expect(ray.intersectObject(field)).toHaveLength(0);
    }
    expect(e.waveKills).toBe(10); expect(e.waveCleared).toBe(true); expect(field.children).toHaveLength(0);
    field.dispose(); (field.material as { dispose(): void }).dispose();
  });

  it('四类新外观仍在单一实例网格，状态装饰没有碰撞', () => {
    const e = encounter(actor('skitter', 1, -6), actor('charger', 2, -2), actor('howler', 3, 2), actor('berserker', 4, 6));
    e.zombies[1].specialState = 'windup'; e.zombies[2].specialState = 'windup'; e.zombies[3].enraged = true;
    const field = new ZombieField(); field.sync(e);
    const matrices = Array.from({ length: field.count }, (_, i) => { const m = new Matrix4(); field.getMatrixAt(i, m); return m; });
    expect(matrices.filter(matrix => matrix.determinant() > 0).length).toBeGreaterThan(80);
    expect(field.children).toHaveLength(0); field.dispose(); (field.material as { dispose(): void }).dispose();
  });

  for (const kind of ZOMBIE_KINDS) it(`${kind} 自然越线并完成约两秒突破特写`, () => {
    const z = actor(kind, 7, 0, 0), e = encounter(z); e.update(4, () => null);
    expect(e.failed).toBe(true); expect(e.breachedId).toBe(7); expect(e.nearest).toBeCloseTo(SURVIVAL.breachRadius);
    const time = e.elapsed; e.update(10, () => null); expect(e.elapsed).toBe(time);
    const camera = new PerspectiveCamera(61, 1.6, .025, 220); camera.position.set(0, 4.8, 9); camera.updateMatrixWorld();
    const sequence = new BreachSequence(); sequence.begin(camera, z);
    expect(sequence.update(camera, 1)).toBe(false); expect(sequence.update(camera, 1)).toBe(true);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true); expect(ZOMBIE_TYPES[z.kind].label).toBeTruthy();
  });

  it('打乱仍保留每类配额且刷新率不超过10/s', () => {
    for (const wave of [1, 5, 10, 18, 25, 50, 100]) {
      const kinds = waveEnemies(wave, seededRandom(9)); expect(kinds).toHaveLength(total(wave)); expect(waveRate(wave)).toBeLessThanOrEqual(10);
      for (const kind of ZOMBIE_KINDS) expect(kinds.filter(item => item === kind)).toHaveLength(waveCounts(wave)[kind]);
    }
  });
});
